import { generateImage } from '../services/imageService.js';
import { logger } from '../utils/logger.js';

export async function handleImageGeneration(req, res) {
    const startTime = Date.now();
    const { 
        model = "flux-dev", 
        prompt, 
        n = 1, 
        size = "1024x1024", 
        responseFormat = "url", 
        user = "",
        stream = false,  // 确保有默认值
        ...otherParams 
    } = req.body;
    
    // 安全地获取IP地址
    let ip = '-';
    try {
        ip = (req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || '-').split(',')[0].trim();
    } catch (err) {
        logger.warn(`Error getting IP address: ${err.message}`);
    }
    
    const requestType = 'POST /v1/images/generations';

    logger.info(`Received image generation request`, {
        requestType,
        ip,
        model,
        promptLength: prompt?.length,
        n,
        size,
        stream
    });

    if (!prompt) {
        const duration = Date.now() - startTime;
        logger.error(`Missing required parameter: prompt`, {
            requestType,
            ip,
            model,
            duration
        });
        return res.status(400).json({
            error: {
                message: "prompt is required",
                type: "invalid_request_error",
                param: "prompt",
                code: "parameter_required"
            }
        });
    }

    // 验证模型是否为图像模型
    const FAL_IMAGE_MODELS = [
        "flux-1.1-ultra",
        "recraft-v3",
        "flux-1.1-pro",
        "ideogram-v2",
        "flux-dev"
    ];

    if (!FAL_IMAGE_MODELS.includes(model)) {
        const duration = Date.now() - startTime;
        logger.error(`Model is not a supported image model`, {
            requestType,
            ip,
            model,
            duration
        });
        return res.status(400).json({
            error: {
                message: `Model '${model}' is not a supported image model. Please use one of: ${FAL_IMAGE_MODELS.join(', ')}`,
                type: "invalid_request_error",
                param: "model",
                code: "model_not_found"
            }
        });
    }

    try {
        logger.info(`Calling image generation function`, {
            requestType,
            ip,
            model,
            n,
            size,
            elapsedTime: Date.now() - startTime
        });
        
        const imageUrls = await generateImage(model, prompt, n, size, responseFormat);
        const duration = Date.now() - startTime;

        if (stream) {
            // 流式响应
            res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.flushHeaders();

            const currentTime = Math.floor(Date.now() / 1000);

            // 开始事件
            const startEvent = {
                id: `chatcmpl-${currentTime}`,
                object: "chat.completion.chunk",
                created: currentTime,
                model: model,
                choices: [
                    {
                        index: 0,
                        delta: { role: "assistant" },
                        finish_reason: null
                    }
                ]
            };
            res.write(`data: ${JSON.stringify(startEvent)}\n\n`);

            // 构建图像Markdown内容
            let content = "";
            if (Array.isArray(imageUrls)) {
                imageUrls.forEach((img, i) => {
                    if (i > 0) content += "\n\n";
                    content += `![Generated Image ${i + 1}](${img.url})`;
                });
            }

            // 内容事件
            const contentEvent = {
                id: `chatcmpl-${currentTime}`,
                object: "chat.completion.chunk",
                created: currentTime,
                model: model,
                choices: [
                    {
                        index: 0,
                        delta: { content: content },
                        finish_reason: null
                    }
                ]
            };
            res.write(`data: ${JSON.stringify(contentEvent)}\n\n`);

            // 结束事件
            const endEvent = {
                id: `chatcmpl-${currentTime}`,
                object: "chat.completion.chunk",
                created: currentTime,
                model: model,
                choices: [
                    {
                        index: 0,
                        delta: {},
                        finish_reason: "stop"
                    }
                ]
            };
            res.write(`data: ${JSON.stringify(endEvent)}\n\n`);
            res.write("data: [DONE]\n\n");
            res.end();
        } else {
            // 非流式响应 - 标准的OpenAI图像生成格式
            const response = {
                created: Math.floor(Date.now() / 1000),
                data: Array.isArray(imageUrls) ? imageUrls : [],
                model: model
            };

            logger.info(`Successfully generated images`, {
                requestType,
                ip,
                model,
                imageCount: Array.isArray(imageUrls) ? imageUrls.length : 0,
                duration
            });

            res.json(response);
        }
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error(`Error generating image`, {
            requestType,
            ip,
            model,
            error: error.message,
            duration
        });
        
        // 构建符合 OpenAI 格式的错误响应
        const errorResponse = {
            error: {
                message: error.message || "An error occurred during image generation",
                type: "server_error",
                param: null,
                code: "image_generation_error"
            }
        };
        
        res.status(500).json(errorResponse);
    }
} 