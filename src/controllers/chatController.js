import { fal } from '@fal-ai/client';
import { logger } from '../utils/logger.js';
import { isChatModel, convertMessagesToFalPrompt, handleStreamResponse, handleNonStreamResponse } from '../services/chatService.js';
import { handleImageGeneration } from './imageController.js';

function isImageModel(model) {
    return model.startsWith('flux-') || model === 'recraft-v3' || model === 'ideogram-v2';
}

export async function handleChatCompletion(req, res) {
    const startTime = Date.now();
    const { model, messages, stream = false, reasoning = false } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '-';
    const requestType = 'chat_completion';

    // 智能路由：如果是图像模型，自动重定向到图像生成端点
    if (isImageModel(model)) {
        // 从消息中提取提示词
        let prompt = "";
        if (messages && messages.length > 0) {
            const userMessages = messages.filter(msg => msg.role === 'user');
            if (userMessages.length > 0) {
                prompt = userMessages[userMessages.length - 1].content;
            }
        }
        
        if (!prompt) {
            logger.warn("No valid prompt found in messages for image generation", {
                requestType,
                ip,
                model,
                duration: Date.now() - startTime
            });
            return res.status(400).json({
                error: {
                    message: "No valid prompt found in messages for image generation",
                    type: "invalid_request_error",
                    param: "messages",
                    code: "parameter_invalid"
                }
            });
        }

        // 构建新的请求体，保持原始的 stream 参数
        const imageReq = {
            ...req,
            body: { 
                ...req.body, 
                prompt,
                stream: stream // 使用原始的 stream 参数值
            }
        };

        // 记录日志
        logger.info(`Redirecting to image generation endpoint`, {
            requestType,
            ip,
            model,
            stream, // 记录原始的 stream 值
            promptLength: prompt.length
        });

        // 调用图像生成处理函数
        return handleImageGeneration(imageReq, res);
    }

    // 对于非图像模型的请求，记录原始参数
    logger.info(`Received chat completion request`, {
        requestType,
        ip,
        model,
        stream,
        messageCount: messages?.length
    });

    // 验证模型是否为聊天模型
    if (!isChatModel(model)) {
        logger.error(`Model is not a supported chat model`, {
            requestType,
            ip,
            model,
            duration: Date.now() - startTime
        });
        
        return res.status(400).json({
            error: {
                message: `Model '${model}' is not a supported chat model.`,
                type: "invalid_request_error",
                param: "model",
                code: "model_not_found"
            }
        });
    }

    if (!model || !messages || !Array.isArray(messages) || messages.length === 0) {
        logger.error("Invalid request parameters", {
            requestType,
            ip,
            model: model || 'undefined',
            messagesType: Array.isArray(messages) ? `array[${messages.length}]` : typeof messages,
            duration: Date.now() - startTime
        });
        return res.status(400).json({
            error: {
                message: 'Missing or invalid parameters: model and messages array are required.',
                type: "invalid_request_error"
            }
        });
    }

    try {
        const { prompt, system_prompt } = convertMessagesToFalPrompt(messages);

        const falInput = {
            model: model,
            prompt: prompt,
            ...(system_prompt && { system_prompt: system_prompt }),
            reasoning: !!reasoning,
        };
        
        logger.debug("Fal Input prepared", {
            requestType,
            ip,
            model,
            systemPromptLength: system_prompt?.length || 0,
            promptLength: prompt?.length || 0
        });

        if (stream) {
            logger.info(`Starting stream request to fal-ai`, {
                requestType,
                ip,
                model,
                elapsedTime: Date.now() - startTime
            });

            const falStream = await fal.stream("fal-ai/any-llm", { input: falInput });
            await handleStreamResponse(falStream, res, model, startTime, requestType, ip);
        } else {
            logger.info("Executing non-stream request", {
                requestType,
                ip,
                model,
                elapsedTime: Date.now() - startTime
            });
            
            const response = await handleNonStreamResponse(falInput, model, startTime, requestType, ip);
            res.json(response);
            
            logger.info("Returned non-stream response successfully", {
                requestType,
                ip,
                model,
                duration: Date.now() - startTime
            });
        }
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error('Error in chat completion', {
            requestType,
            ip,
            model,
            duration,
            error: error.message
        });
        
        if (!res.headersSent) {
            res.status(500).json({
                error: {
                    message: error.message,
                    type: 'chat_completion_error'
                }
            });
        } else if (!res.writableEnded) {
            res.end();
        }
    }
} 