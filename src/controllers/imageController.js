import { generateImage } from '../services/imageService.js';
import { logger } from '../utils/logger.js';

// 图像生成配置
const IMAGE_GENERATION_CONFIG = {
    defaultModel: "flux-dev",
    supportedModels: [
        "flux-1.1-ultra",
        "recraft-v3",
        "flux-1.1-pro",
        "ideogram-v2",
        "flux-dev",
        "imagen3"
    ]
};

/**
 * 处理图像生成请求
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
export async function handleImageGeneration(req, res) {
    const startTime = Date.now();
    const { 
        model = IMAGE_GENERATION_CONFIG.defaultModel, 
        prompt, 
        n = 1, 
        size = "1024x1024", 
        responseFormat = "url", 
        user = "",
        stream = false,
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

    if (!IMAGE_GENERATION_CONFIG.supportedModels.includes(model)) {
        const duration = Date.now() - startTime;
        logger.error(`Model is not a supported image model`, {
            requestType,
            ip,
            model,
            duration
        });
        return res.status(400).json({
            error: {
                message: `Model '${model}' is not a supported image model. Please use one of: ${IMAGE_GENERATION_CONFIG.supportedModels.join(', ')}`,
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

        // 添加生成图片后的立即日志
        logger.info(`Image generation completed`, {
            requestType,
            ip,
            model,
            imageUrlsReceived: imageUrls ? JSON.stringify(imageUrls) : 'undefined',
            duration
        });

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
            
            // 记录开始事件
            logger.debug('Sending start event:', {
                requestType,
                ip,
                model,
                event: JSON.stringify(startEvent)
            });
            
            res.write(`data: ${JSON.stringify(startEvent)}\n\n`);

            // 构建图像内容
            let content = "";
            if (!imageUrls) {
                logger.error('Image generation failed: imageUrls is undefined', {
                    requestType,
                    ip,
                    model,
                    elapsedTime: Date.now() - startTime
                });
                content = "Image generation failed. Please try again.";
            } else if (Array.isArray(imageUrls)) {
                logger.debug('Processing image URLs:', {
                    requestType,
                    ip,
                    model,
                    imageUrlsCount: imageUrls.length,
                    rawImageUrls: imageUrls
                });
                
                content = imageUrls.map((img, i) => {
                    // 记录每个图片的处理
                    logger.debug(`Processing image ${i + 1}:`, {
                        requestType,
                        ip,
                        model,
                        imageObject: img
                    });

                    // 确保 URL 是有效的
                    if (!img || !img.url) {
                        logger.error(`Invalid image URL at index ${i}`, {
                            requestType,
                            ip,
                            model,
                            image: JSON.stringify(img)
                        });
                        return `Error: Invalid image URL at index ${i}`;
                    }

                    // 检查 URL 格式
                    try {
                        const url = new URL(img.url);
                        logger.debug(`Valid URL found for image ${i + 1}:`, {
                            requestType,
                            ip,
                            model,
                            fullUrl: url.toString()
                        });

                        // 构建 Markdown 格式
                        const markdownImage = `![Generated Image ${i + 1}](${url.toString()})`;
                        logger.debug(`Generated markdown for image ${i + 1}:`, {
                            requestType,
                            ip,
                            model,
                            markdownImage
                        });
                        return markdownImage;

                    } catch (e) {
                        logger.error(`Invalid URL format at index ${i}`, {
                            requestType,
                            ip,
                            model,
                            url: img.url,
                            error: e.message
                        });
                        return `Error: Invalid URL format at index ${i}`;
                    }
                }).join('\n\n');

                // 记录最终生成的内容
                logger.debug('Generated content:', {
                    requestType,
                    ip,
                    model,
                    fullContent: content
                });
            } else {
                logger.error('Invalid imageUrls format', {
                    requestType,
                    ip,
                    model,
                    imageUrlsType: typeof imageUrls,
                    imageUrls: JSON.stringify(imageUrls),
                    elapsedTime: Date.now() - startTime
                });
                content = "Invalid response format. Please try again.";
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
                        delta: { 
                            role: "assistant",
                            content: content
                        },
                        finish_reason: null
                    }
                ]
            };

            // 记录发送的事件内容
            logger.debug('Sending content event:', {
                requestType,
                ip,
                model,
                eventContent: content,
                fullEvent: JSON.stringify(contentEvent)
            });

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

            // 记录结束事件
            logger.debug('Sending end event:', {
                requestType,
                ip,
                model,
                event: JSON.stringify(endEvent)
            });

            res.write(`data: ${JSON.stringify(endEvent)}\n\n`);
            res.write("data: [DONE]\n\n");

            // 记录完整的响应过程
            logger.info('Stream response completed:', {
                requestType,
                ip,
                model,
                totalDuration: Date.now() - startTime,
                finalContent: content
            });

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