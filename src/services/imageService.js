import fetch from 'node-fetch';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

// 模型URL配置
const IMAGE_MODEL_URLS = {
    "flux-1.1-ultra": {
        "submit_url": "https://queue.fal.run/fal-ai/flux-pro/v1.1-ultra",
        "status_base_url": "https://queue.fal.run/fal-ai/flux-pro"
    },
    "recraft-v3": {
        "submit_url": "https://queue.fal.run/fal-ai/recraft-v3",
        "status_base_url": "https://queue.fal.run/fal-ai/recraft-v3"
    },
    "flux-1.1-pro": {
        "submit_url": "https://queue.fal.run/fal-ai/flux-pro/v1.1",
        "status_base_url": "https://queue.fal.run/fal-ai/flux-pro"
    },
    "ideogram-v2": {
        "submit_url": "https://queue.fal.run/fal-ai/ideogram/v2",
        "status_base_url": "https://queue.fal.run/fal-ai/ideogram"
    },
    "flux-dev": {
        "submit_url": "https://queue.fal.run/fal-ai/flux/dev",
        "status_base_url": "https://queue.fal.run/fal-ai/flux"
    }
};

export async function generateImage(model, prompt, numImages = 1, size = "1024x1024", responseFormat = "url") {
    const startTime = Date.now();
    
    logger.info(`Starting image generation`, {
        requestType: 'generateImage',
        model,
        promptLength: prompt.length,
        numImages,
        size
    });
    
    // 获取模型URL信息
    const modelUrls = IMAGE_MODEL_URLS[model] || IMAGE_MODEL_URLS["flux-dev"];
    const submitUrl = modelUrls.submit_url;
    const statusBaseUrl = modelUrls.status_base_url;
    
    // 准备请求参数
    const requestBody = {
        prompt: prompt,
        num_images: numImages
    };
    
    // 处理图像尺寸
    if (size) {
        const parts = size.split("x");
        if (parts.length !== 2) {
            throw new Error(`Invalid size format: ${size}. Expected format: widthxheight (e.g. 1024x1024)`);
        }
        
        const width = Number(parts[0]);
        const height = Number(parts[1]);
        
        if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
            throw new Error(`Invalid size values: width=${width}, height=${height}. Both values must be positive numbers.`);
        }

        if (model === "flux-1.1-ultra" || model === "ideogram-v2") {
            const gcd = (a, b) => b ? gcd(b, a % b) : a;
            const divisor = gcd(width, height);
            requestBody.aspect_ratio = `${width / divisor}:${height / divisor}`;
        } else {
            requestBody.image_size = { width, height };
        }
        
        logger.debug(`Size parameters processed`, {
            requestType: 'generateImage',
            model,
            width,
            height,
            originalSize: size
        });
    }
    
    logger.debug(`Request body prepared`, {
        requestType: 'generateImage',
        model,
        requestBody: JSON.stringify(requestBody)
    });
    
    try {
        // 发送初始请求
        logger.info(`Sending request to ${submitUrl}`, {
            requestType: 'generateImage',
            model,
            elapsedTime: Date.now() - startTime
        });
        
        const response = await fetch(submitUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Key ${config.falKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            logger.error(`API request failed`, {
                requestType: 'generateImage',
                model,
                statusCode: response.status,
                error: errorText,
                elapsedTime: Date.now() - startTime
            });
            throw new Error(`API request failed with status ${Successfully.status}: ${errorText}`);
        }
        
        const responseData = await response.json();
        const requestId = responseData.request_id;
        
        if (!requestId) {
            logger.error(`Missing request_id in API response`, {
                requestType: 'generateImage',
                model,
                response: JSON.stringify(responseData),
                elapsedTime: Date.now() - startTime
            });
            throw new Error("Missing request_id in API response");
        }
        
        logger.info(`Got request_id: ${requestId}`, {
            requestType: 'generateImage',
            model,
            requestId,
            elapsedTime: Date.now() - startTime
        });
        
        // 轮询获取结果
        const statusUrl = `${statusBaseUrl}/requests/${requestId}/status`;
        const resultUrl = `${statusBaseUrl}/requests/${requestId}`;
        
        const maxAttempts = 120; // 增加最大尝试次数
        const initialDelay = 1000; // 初始延迟1秒
        const maxDelay = 5000; // 最大延迟5秒
        let currentDelay = initialDelay;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            logger.debug(`Polling attempt ${attempt + 1}/${maxAttempts}`, {
                requestType: 'generateImage',
                model,
                requestId,
                attempt: attempt + 1,
                currentDelay,
                elapsedTime: Date.now() - startTime
            });
            
            // 检查状态
            try {
                const statusResponse = await fetch(statusUrl, {
                    headers: {
                        'Authorization': `Key ${config.falKey}`
                    },
                    timeout: 10000 // 10秒超时
                });
                
                if (!statusResponse.ok) {
                    if (statusResponse.status === 429 || statusResponse.status >= 500) {
                        // 如果是限流或服务器错误，增加延迟并继续
                        const errorText = await statusResponse.text();
                        logger.warn(`Temporary error checking status, will retry`, {
                            requestType: 'generateImage',
                            model,
                            requestId,
                            statusCode: statusResponse.status,
                            error: errorText,
                            attempt: attempt + 1,
                            nextDelay: currentDelay,
                            elapsedTime: Date.now() - startTime
                        });
                        await new Promise(resolve => setTimeout(resolve, currentDelay));
                        // 指数退避，但不超过最大延迟
                        currentDelay = Math.min(currentDelay * 1.5, maxDelay);
                        continue;
                    }

                    const errorText = await statusResponse.text();
                    logger.error(`Error checking status`, {
                        requestType: 'generateImage',
                        model,
                        requestId,
                        statusCode: statusResponse.status,
                        error: errorText,
                        elapsedTime: Date.now() - startTime
                    });
                    throw new Error(`Error checking status: ${errorText}`);
                }
                
                const statusData = await statusResponse.json();
                const status = statusData.status;
                
                if (status === "COMPLETED") {
                    logger.info(`Generation completed, fetching results`, {
                        requestType: 'generateImage',
                        model,
                        requestId,
                        attempt: attempt + 1,
                        elapsedTime: Date.now() - startTime
                    });
                    
                    // 获取结果
                    const resultResponse = await fetch(resultUrl, {
                        headers: {
                            'Authorization': `Key ${config.falKey}`
                        },
                        timeout: 10000 // 10秒超时
                    });
                    
                    if (!resultResponse.ok) {
                        const errorText = await resultResponse.text();
                        logger.error(`Error fetching result`, {
                            requestType: 'generateImage',
                            model,
                            requestId,
                            statusCode: resultResponse.status,
                            error: errorText,
                            elapsedTime: Date.now() - startTime
                        });
                        throw new Error(`Error fetching result: ${errorText}`);
                    }
                    
                    const resultData = await resultResponse.json();
                    
                    // 提取图片URL
                    if (resultData.images && resultData.images.length > 0) {
                        const imageUrls = resultData.images
                            .filter(img => img && img.url)
                            .map(img => ({ url: img.url }));
                        
                        const duration = Date.now() - startTime;
                        logger.info(`Successfully generated ${imageUrls.length} images`, {
                            requestType: 'generateImage',
                            model,
                            requestId,
                            imageCount: imageUrls.length,
                            duration,
                            attempts: attempt + 1,
                            urls: imageUrls.map(img => img.url)
                        });
                        
                        return imageUrls;
                    } else {
                        logger.error(`No images found in the response`, {
                            requestType: 'generateImage',
                            model,
                            requestId,
                            response: JSON.stringify(resultData),
                            elapsedTime: Date.now() - startTime
                        });
                        throw new Error("No images found in the response");
                    }
                    
                    
                } else if (status === "FAILED") {
                    logger.error(`Request failed`, {
                        requestType: 'generateImage',
                        model,
                        requestId,
                        error: statusData.error || "Unknown error",
                        elapsedTime: Date.now() - startTime
                    });
                    throw new Error(`Request failed: ${statusData.error || "Unknown error"}`);
                } else if (status === "PROCESSING") {
                    // 记录处理进度
                    logger.debug(`Request still processing`, {
                        requestType: 'generateImage',
                        model,
                        requestId,
                        status,
                        attempt: attempt + 1,
                        elapsedTime: Date.now() - startTime
                    });
                }
                
                // 等待后再次检查
                await new Promise(resolve => setTimeout(resolve, currentDelay));
                // 逐渐增加延迟，但不超过最大值
                currentDelay = Math.min(currentDelay * 1.5, maxDelay);
            } catch (error) {
                if (error.name === 'AbortError' || error.type === 'request-timeout') {
                    // 如果是超时错误，记录警告并继续
                    logger.warn(`Request timeout, will retry`, {
                        requestType: 'generateImage',
                        model,
                        requestId,
                        attempt: attempt + 1,
                        error: error.message,
                        elapsedTime: Date.now() - startTime
                    });
                    continue;
                }
                throw error;
            }
        }
        
        const duration = Date.now() - startTime;
        logger.error(`Request timed out`, {
            requestType: 'generateImage',
            model,
            requestId,
            attempts: maxAttempts,
            totalDuration: duration,
            error: "Maximum polling attempts reached"
        });
        throw new Error("Image generation timed out. Please try again.");
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error(`Error generating image`, {
            requestType: 'generateImage',
            model,
            error: error.message,
            duration
        });
        throw error;
    }
}

// 处理图像变体生成
export async function handleImageVariation(imageUrl, prompt, model, startTime, requestType, ip, options = {}) {
    try {
        logger.info("Starting image variation", {
            requestType,
            ip,
            model,
            promptLength: prompt?.length || 0,
            hasImageUrl: !!imageUrl
        });

        const input = {
            image_url: imageUrl,
            prompt: prompt || "",
            negative_prompt: options.negative_prompt || "",
            num_inference_steps: options.num_inference_steps || 30,
            guidance_scale: options.guidance_scale || 7.5,
            strength: options.strength || 0.7,
            seed: options.seed || Math.floor(Math.random() * 2147483647),
            scheduler: options.scheduler || "DDIM",
            disable_safety_checker: true
        };

        const result = await fal.subscribe('fal-ai/ip-adapter-face-id', {
            input,
            logs: true,
            onQueueUpdate: (update) => {
                if (update.status === 'COMPLETED') {
                    logger.debug("Image variation queue completed", {
                        queueSize: update.queue_size,
                        queuePosition: update.queue_position,
                        elapsedTime: update.elapsed_time
                    });
                }
            }
        });

        if (result.error) {
            throw new Error(`Image variation error: ${JSON.stringify(result.error)}`);
        }

        const duration = Date.now() - startTime;
        logger.info("Image variation completed", {
            requestType,
            ip,
            model,
            duration,
            success: true
        });

        return {
            images: result.images || [],
            seed: input.seed,
            model: 'ip-adapter',
            ...(result.reasoning && { fal_reasoning: result.reasoning })
        };
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error("Image variation failed", {
            requestType,
            ip,
            model,
            duration,
            error: error instanceof Error ? error.message : JSON.stringify(error)
        });
        throw error;
    }
}

// 处理图像修复（inpainting）
export async function handleImageInpainting(imageUrl, maskUrl, prompt, model, startTime, requestType, ip, options = {}) {
    try {
        logger.info("Starting image inpainting", {
            requestType,
            ip,
            model,
            promptLength: prompt?.length || 0,
            hasImageUrl: !!imageUrl,
            hasMaskUrl: !!maskUrl
        });

        const input = {
            image_url: imageUrl,
            mask_url: maskUrl,
            prompt: prompt || "",
            negative_prompt: options.negative_prompt || "",
            num_inference_steps: options.num_inference_steps || 30,
            guidance_scale: options.guidance_scale || 7.5,
            seed: options.seed || Math.floor(Math.random() * 2147483647),
            scheduler: options.scheduler || "DDIM",
            disable_safety_checker: true
        };

        const result = await fal.subscribe('fal-ai/sd-inpainting', {
            input,
            logs: true,
            onQueueUpdate: (update) => {
                if (update.status === 'COMPLETED') {
                    logger.debug("Inpainting queue completed", {
                        queueSize: update.queue_size,
                        queuePosition: update.queue_position,
                        elapsedTime: update.elapsed_time
                    });
                }
            }
        });

        if (result.error) {
            throw new Error(`Inpainting error: ${JSON.stringify(result.error)}`);
        }

        const duration = Date.now() - startTime;
        logger.info("Image inpainting completed", {
            requestType,
            ip,
            model,
            duration,
            success: true
        });

        return {
            images: result.images || [],
            seed: input.seed,
            model: 'sd-inpainting',
            ...(result.reasoning && { fal_reasoning: result.reasoning })
        };
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error("Image inpainting failed", {
            requestType,
            ip,
            model,
            duration,
            error: error instanceof Error ? error.message : JSON.stringify(error)
        });
        throw error;
    }
} 