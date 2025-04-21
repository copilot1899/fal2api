import express from 'express';
import { fal } from '@fal-ai/client';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { logger } from './logger.js';

// 加载环境变量
dotenv.config({ path: '.env.node' });

// 获取环境变量
const FAL_KEY = process.env.FAL_KEY;
const API_KEY = process.env.API_KEY;

// 验证环境变量
if (!FAL_KEY) {
    logger.error('FAL_KEY environment variable is required');
    process.exit(1);
}

if (!API_KEY) {
    logger.warn('API_KEY environment variable is not set. API authentication will be disabled.');
}

// 配置 fal 客户端
fal.config({
    credentials: FAL_KEY,
});

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 添加请求日志中间件
app.use((req, res, next) => {
    const startTime = Date.now();
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '-';
    const requestType = `${req.method} ${req.originalUrl}`;
    
    logger.info(`Incoming request`, {
        requestType,
        ip,
        method: req.method,
        url: req.originalUrl,
        userAgent: req.headers['user-agent'] || '-'
    });
    
    // 在响应完成后记录日志
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        const statusCode = res.statusCode;
        
        if (statusCode >= 400) {
            logger.warn(`Request completed with error`, {
                requestType,
                ip,
                method: req.method,
                url: req.originalUrl,
                statusCode,
                duration
            });
        } else {
            logger.info(`Request completed`, {
                requestType,
                ip,
                method: req.method,
                url: req.originalUrl,
                statusCode,
                duration
            });
        }
    });
    
    next();
});

// API 密钥验证中间件
app.use((req, res, next) => {
    // 跳过 OPTIONS 请求（用于 CORS 预检）
    if (req.method === 'OPTIONS') {
        return next();
    }
    
    const apiKey = req.headers['authorization'];
    const expectedApiKey = `Bearer ${API_KEY}`;
    
    // 如果设置了 API_KEY 环境变量，则验证请求中的 API 密钥
    if (API_KEY && apiKey !== expectedApiKey) {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '-';
        logger.warn(`Unauthorized access attempt`, {
            requestType: `${req.method} ${req.originalUrl}`,
            ip,
            providedKey: apiKey ? '(provided but invalid)' : '(not provided)'
        });
        
        return res.status(401).json({
            error: {
                message: "Invalid API key. Please check your API key and try again.",
                type: "invalid_request_error",
                param: null,
                code: "invalid_api_key"
            }
        });
    }
    
    next();
});

// CORS 中间件
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    
    next();
});

// === 全局定义限制 ===
const PROMPT_LIMIT = 4800;
const SYSTEM_PROMPT_LIMIT = 4800;
// === 限制定义结束 ===

// 定义 fal-ai/any-llm 支持的模型列表
const FAL_SUPPORTED_MODELS = [
    "anthropic/claude-3.7-sonnet",
    "anthropic/claude-3.5-sonnet",
    "anthropic/claude-3-5-haiku",
    "anthropic/claude-3-haiku",
    "google/gemini-pro-1.5",
    "google/gemini-flash-1.5",
    "google/gemini-flash-1.5-8b",
    "google/gemini-2.0-flash-001",
    "meta-llama/llama-3.2-1b-instruct",
    "meta-llama/llama-3.2-3b-instruct",
    "meta-llama/llama-3.1-8b-instruct",
    "meta-llama/llama-3.1-70b-instruct",
    "openai/gpt-4o-mini",
    "openai/gpt-4o",
    "deepseek/deepseek-r1",
    "meta-llama/llama-4-maverick",
    "meta-llama/llama-4-scout"
];

// 定义 fal-ai 支持的图像生成模型
const FAL_IMAGE_MODELS = [
    "flux-1.1-ultra",
    "recraft-v3",
    "flux-1.1-pro",
    "ideogram-v2",
    "flux-dev"
];

// 图像生成模型的 URL 配置
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

// Helper function to get owner from model ID
const getOwner = (modelId) => {
    if (modelId && modelId.includes('/')) {
        return modelId.split('/')[0];
    }
    return 'fal-ai';
}

// 判断是否为图像生成模型
const isImageModel = (model) => {
    return FAL_IMAGE_MODELS.includes(model);
};

// 判断是否为对话模型
const isChatModel = (model) => {
    return FAL_SUPPORTED_MODELS.includes(model);
};

// GET /v1/models endpoint
app.get('/v1/models', (req, res) => {
    logger.log("Received request for GET /v1/models");
    try {
        const modelsData = [...FAL_SUPPORTED_MODELS, ...FAL_IMAGE_MODELS].map(modelId => ({
            id: modelId, object: "model", created: 1700000000, owned_by: getOwner(modelId)
        }));
        res.json({ object: "list", data: modelsData });
        logger.log("Successfully returned model list.");
    } catch (error) {
        logger.error("Error processing GET /v1/models:", error);
        res.status(500).json({ error: "Failed to retrieve model list." });
    }
});

// === 修改后的 convertMessagesToFalPrompt 函数 (System置顶 + 分隔符 + 对话历史Recency) ===
function convertMessagesToFalPrompt(messages) {
    let fixed_system_prompt_content = "";
    const conversation_message_blocks = [];
    logger.log(`Original messages count: ${messages.length}`);

    // 1. 分离 System 消息，格式化 User/Assistant 消息
    for (const message of messages) {
        let content = (message.content === null || message.content === undefined) ? "" : String(message.content);
        switch (message.role) {
            case 'system':
                fixed_system_prompt_content += `System: ${content}\n\n`;
                break;
            case 'user':
                conversation_message_blocks.push(`Human: ${content}\n\n`);
                break;
            case 'assistant':
                conversation_message_blocks.push(`Assistant: ${content}\n\n`);
                break;
            default:
                logger.warn(`Unsupported role: ${message.role}`);
                continue;
        }
    }

    // 2. 截断合并后的 system 消息（如果超长）
    if (fixed_system_prompt_content.length > SYSTEM_PROMPT_LIMIT) {
        const originalLength = fixed_system_prompt_content.length;
        fixed_system_prompt_content = fixed_system_prompt_content.substring(0, SYSTEM_PROMPT_LIMIT);
        logger.warn(`Combined system messages truncated from ${originalLength} to ${SYSTEM_PROMPT_LIMIT}`);
    }
    // 清理末尾可能多余的空白，以便后续判断和拼接
    fixed_system_prompt_content = fixed_system_prompt_content.trim();


    // 3. 计算 system_prompt 中留给对话历史的剩余空间
    // 注意：这里计算时要考虑分隔符可能占用的长度，但分隔符只在需要时添加
    // 因此先计算不含分隔符的剩余空间
    let space_occupied_by_fixed_system = 0;
    if (fixed_system_prompt_content.length > 0) {
        // 如果固定内容不为空，计算其长度 + 后面可能的分隔符的长度（如果需要）
        // 暂时只计算内容长度，分隔符在组合时再考虑
         space_occupied_by_fixed_system = fixed_system_prompt_content.length + 4; // 预留 \n\n...\n\n 的长度
    }
     const remaining_system_limit = Math.max(0, SYSTEM_PROMPT_LIMIT - space_occupied_by_fixed_system);
    logger.log(`Trimmed fixed system prompt length: ${fixed_system_prompt_content.length}. Approx remaining system history limit: ${remaining_system_limit}`);


    // 4. 反向填充 User/Assistant 对话历史
    const prompt_history_blocks = [];
    const system_prompt_history_blocks = [];
    let current_prompt_length = 0;
    let current_system_history_length = 0;
    let promptFull = false;
    let systemHistoryFull = (remaining_system_limit <= 0);

    logger.log(`Processing ${conversation_message_blocks.length} user/assistant messages for recency filling.`);
    for (let i = conversation_message_blocks.length - 1; i >= 0; i--) {
        const message_block = conversation_message_blocks[i];
        const block_length = message_block.length;

        if (promptFull && systemHistoryFull) {
            logger.log(`Both prompt and system history slots full. Omitting older messages from index ${i}.`);
            break;
        }

        // 优先尝试放入 prompt
        if (!promptFull) {
            if (current_prompt_length + block_length <= PROMPT_LIMIT) {
                prompt_history_blocks.unshift(message_block);
                current_prompt_length += block_length;
                continue;
            } else {
                promptFull = true;
                logger.log(`Prompt limit (${PROMPT_LIMIT}) reached. Trying system history slot.`);
            }
        }

        // 如果 prompt 满了，尝试放入 system_prompt 的剩余空间
        if (!systemHistoryFull) {
            if (current_system_history_length + block_length <= remaining_system_limit) {
                 system_prompt_history_blocks.unshift(message_block);
                 current_system_history_length += block_length;
                 continue;
            } else {
                 systemHistoryFull = true;
                 logger.log(`System history limit (${remaining_system_limit}) reached.`);
            }
        }
    }

    // 5. *** 组合最终的 prompt 和 system_prompt (包含分隔符逻辑) ***
    const system_prompt_history_content = system_prompt_history_blocks.join('').trim();
    const final_prompt = prompt_history_blocks.join('').trim();

    // 定义分隔符
    const SEPARATOR = "\n\n-------下面是比较早之前的对话内容-----\n\n";

    let final_system_prompt = "";

    // 检查各部分是否有内容 (使用 trim 后的固定部分)
    const hasFixedSystem = fixed_system_prompt_content.length > 0;
    const hasSystemHistory = system_prompt_history_content.length > 0;

    if (hasFixedSystem && hasSystemHistory) {
        // 两部分都有，用分隔符连接
        final_system_prompt = fixed_system_prompt_content + SEPARATOR + system_prompt_history_content;
        logger.log("Combining fixed system prompt and history with separator.");
    } else if (hasFixedSystem) {
        // 只有固定部分
        final_system_prompt = fixed_system_prompt_content;
        logger.log("Using only fixed system prompt.");
    } else if (hasSystemHistory) {
        // 只有历史部分 (固定部分为空)
        final_system_prompt = system_prompt_history_content;
        logger.log("Using only history in system prompt slot.");
    }
    // 如果两部分都为空，final_system_prompt 保持空字符串 ""

    // 6. 返回结果
    const result = {
        system_prompt: final_system_prompt, // 最终结果不需要再 trim
        prompt: final_prompt              // final_prompt 在组合前已 trim
    };

    logger.log(`Final system_prompt length (Sys+Separator+Hist): ${result.system_prompt.length}`);
    logger.log(`Final prompt length (Hist): ${result.prompt.length}`);

    return result;
}
// === convertMessagesToFalPrompt 函数结束 ===


// POST /v1/chat/completions endpoint
app.post('/v1/chat/completions', async (req, res) => {
    const startTime = Date.now();
    const { model, messages, stream = false, reasoning = false, ...restOpenAIParams } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '-';
    const requestType = 'POST /v1/chat/completions';

    logger.info(`Received chat completion request`, {
        requestType,
        ip,
        model,
        stream,
        messageCount: messages?.length
    });

    // 智能路由：如果是图像模型，自动重定向到图像生成端点
    if (isImageModel(model)) {
        logger.info(`Redirecting image model to image generation endpoint`, {
            requestType,
            ip,
            model
        });
        
        // 从消息中提取提示词
        let prompt = "";
        if (messages && messages.length > 0) {
            // 使用最后一条用户消息作为提示词
            const userMessages = messages.filter(msg => msg.role === 'user');
            if (userMessages.length > 0) {
                prompt = userMessages[userMessages.length - 1].content;
            }
        }
        
        if (!prompt) {
            const duration = Date.now() - startTime;
            logger.warn("No valid prompt found in messages for image generation", {
                requestType,
                ip,
                model,
                duration
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
        
        try {
            // 调用图像生成函数
            logger.info(`Calling image generation function`, {
                requestType,
                ip,
                model,
                promptLength: prompt.length
            });
            
            const imageUrls = await generateImage(model, prompt, 1, "1024x1024", "url");
            const duration = Date.now() - startTime;
            
            logger.info(`Successfully generated image`, {
                requestType,
                ip,
                model,
                duration,
                imageCount: imageUrls.length
            });
            
            // 构建响应
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
                imageUrls.forEach((img, i) => {
                    if (i > 0) content += "\n\n";
                    content += `![Generated Image ${i + 1}](${img.url})`;
                });
                
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
                // 非流式响应
                let content = "";
                imageUrls.forEach((img, i) => {
                    if (i > 0) content += "\n\n";
                    content += `![Generated Image ${i + 1}](${img.url})`;
                });
                
                const response = {
                    id: `chatcmpl-${Math.floor(Date.now() / 1000)}`,
                    object: "chat.completion",
                    created: Math.floor(Date.now() / 1000),
                    model: model,
                    choices: [
                        {
                            index: 0,
                            message: {
                                role: "assistant",
                                content: content
                            },
                            finish_reason: "stop"
                        }
                    ],
                    usage: {
                        prompt_tokens: prompt.length,
                        completion_tokens: content.length,
                        total_tokens: prompt.length + content.length
                    }
                };
                
                res.json(response);
            }
            return;
        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error('Error generating image', {
                requestType,
                ip,
                model,
                duration,
                error: error.message
            });
            
            return res.status(500).json({
                error: {
                    message: error.message || "An error occurred during image generation",
                    type: "server_error",
                    param: null,
                    code: "image_generation_error"
                }
            });
        }
    }

    // 验证模型是否为聊天模型
    if (!isChatModel(model)) {
        const duration = Date.now() - startTime;
        logger.error(`Model is not a supported chat model`, {
            requestType,
            ip,
            model,
            duration
        });
        
        return res.status(400).json({
            error: {
                message: `Model '${model}' is not a supported chat model. Please use one of: ${FAL_SUPPORTED_MODELS.join(', ')}`,
                type: "invalid_request_error",
                param: "model",
                code: "model_not_found"
            }
        });
    }

    if (!FAL_SUPPORTED_MODELS.includes(model)) {
        logger.warn(`Requested model is not in the explicitly supported list`, {
            requestType,
            ip,
            model
        });
    }
    
    if (!model || !messages || !Array.isArray(messages) || messages.length === 0) {
        const duration = Date.now() - startTime;
        logger.error("Invalid request parameters", {
            requestType,
            ip,
            model: model || 'undefined',
            messagesType: Array.isArray(messages) ? `array[${messages.length}]` : typeof messages,
            duration
        });
        return res.status(400).json({ error: 'Missing or invalid parameters: model and messages array are required.' });
    }

    try {
        // *** 使用更新后的转换函数 ***
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
        
        logger.log("Fal Input:", JSON.stringify(falInput, null, 2));
        logger.log("Forwarding request to fal-ai with system-priority + separator + recency input:");
        logger.log("System Prompt Length:", system_prompt?.length || 0);
        logger.log("Prompt Length:", prompt?.length || 0);
        // 调试时取消注释可以查看具体内容
        logger.log("--- System Prompt Start ---");
        logger.log(system_prompt);
        logger.log("--- System Prompt End ---");
        logger.log("--- Prompt Start ---");
        logger.log(prompt);
        logger.log("--- Prompt End ---");


        // --- 流式/非流式处理逻辑 ---
        if (stream) {
            // ... 流式代码 ...
            res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.flushHeaders();

            let previousOutput = '';

            logger.info(`Starting stream request to fal-ai`, {
                requestType,
                ip,
                model,
                elapsedTime: Date.now() - startTime
            });

            const falStream = await fal.stream("fal-ai/any-llm", { input: falInput });

            try {
                let chunkCount = 0;
                for await (const event of falStream) {
                    chunkCount++;
                    const currentOutput = (event && typeof event.output === 'string') ? event.output : '';
                    const isPartial = (event && typeof event.partial === 'boolean') ? event.partial : true;
                    const errorInfo = (event && event.error) ? event.error : null;

                    if (errorInfo) {
                        logger.error("Error received in fal stream event", {
                            requestType,
                            ip,
                            model,
                            errorInfo,
                            elapsedTime: Date.now() - startTime
                        });
                        const errorChunk = { id: `chatcmpl-${Date.now()}-error`, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: model, choices: [{ index: 0, delta: {}, finish_reason: "error", message: { role: 'assistant', content: `Fal Stream Error: ${JSON.stringify(errorInfo)}` } }] };
                        res.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
                        break;
                    }

                    let deltaContent = '';
                    if (currentOutput.startsWith(previousOutput)) {
                        deltaContent = currentOutput.substring(previousOutput.length);
                    } else if (currentOutput.length > 0) {
                        logger.warn("Fal stream output mismatch detected", {
                            requestType,
                            ip,
                            model,
                            previousLength: previousOutput.length,
                            currentLength: currentOutput.length,
                            elapsedTime: Date.now() - startTime
                        });
                        deltaContent = currentOutput;
                        previousOutput = '';
                    }
                    previousOutput = currentOutput;

                    if (deltaContent || !isPartial) {
                        const openAIChunk = { id: `chatcmpl-${Date.now()}`, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: model, choices: [{ index: 0, delta: { content: deltaContent }, finish_reason: isPartial === false ? "stop" : null }] };
                        res.write(`data: ${JSON.stringify(openAIChunk)}\n\n`);
                        
                        if (chunkCount % 10 === 0) {
                            logger.debug(`Stream progress: ${chunkCount} chunks sent`, {
                                requestType,
                                ip,
                                model,
                                outputLength: previousOutput.length,
                                elapsedTime: Date.now() - startTime
                            });
                        }
                    }
                }
                res.write(`data: [DONE]\n\n`);
                res.end();
                
                const duration = Date.now() - startTime;
                logger.info("Stream completed successfully", {
                    requestType,
                    ip,
                    model,
                    duration,
                    chunkCount,
                    outputLength: previousOutput.length
                });

            } catch (streamError) {
                const duration = Date.now() - startTime;
                logger.error('Error during fal stream processing', {
                    requestType,
                    ip,
                    model,
                    duration,
                    error: streamError instanceof Error ? streamError.message : JSON.stringify(streamError)
                });
                
                try {
                    const errorDetails = (streamError instanceof Error) ? streamError.message : JSON.stringify(streamError);
                    res.write(`data: ${JSON.stringify({ error: { message: "Stream processing error", type: "proxy_error", details: errorDetails } })}\n\n`);
                    res.write(`data: [DONE]\n\n`);
                    res.end();
                } catch (finalError) {
                    logger.error('Error sending stream error message to client', {
                        requestType,
                        ip,
                        model,
                        duration,
                        error: finalError instanceof Error ? finalError.message : JSON.stringify(finalError)
                    });
                    if (!res.writableEnded) { res.end(); }
                }
            }
        } else {
            // --- 非流式处理 ---
            logger.info("Executing non-stream request", {
                requestType,
                ip,
                model,
                elapsedTime: Date.now() - startTime
            });
            
            const result = await fal.subscribe("fal-ai/any-llm", { input: falInput, logs: true });
            const duration = Date.now() - startTime;
            
            logger.debug("Received non-stream result from fal-ai", {
                requestType,
                ip,
                model,
                duration,
                outputLength: result?.output?.length || 0,
                hasError: !!result?.error
            });

            if (result && result.error) {
                logger.error("Fal-ai returned an error in non-stream mode", {
                    requestType,
                    ip,
                    model,
                    duration,
                    error: JSON.stringify(result.error)
                });
                return res.status(500).json({ object: "error", message: `Fal-ai error: ${JSON.stringify(result.error)}`, type: "fal_ai_error", param: null, code: null });
            }

            const openAIResponse = {
                id: `chatcmpl-${result.requestId || Date.now()}`, object: "chat.completion", created: Math.floor(Date.now() / 1000), model: model,
                choices: [{ index: 0, message: { role: "assistant", content: result.output || "" }, finish_reason: "stop" }],
                usage: { prompt_tokens: null, completion_tokens: null, total_tokens: null }, system_fingerprint: null,
                ...(result.reasoning && { fal_reasoning: result.reasoning }),
            };
            res.json(openAIResponse);
            
            logger.info("Returned non-stream response successfully", {
                requestType,
                ip,
                model,
                duration,
                outputLength: result?.output?.length || 0
            });
        }

    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error('Unhandled error in /v1/chat/completions', {
            requestType,
            ip,
            model,
            duration,
            error: error instanceof Error ? error.message : JSON.stringify(error)
        });
        
        if (!res.headersSent) {
            const errorMessage = (error instanceof Error) ? error.message : JSON.stringify(error);
            res.status(500).json({ error: 'Internal Server Error in Proxy', details: errorMessage });
        } else if (!res.writableEnded) {
            logger.error("Headers already sent, ending response", {
                requestType,
                ip,
                model,
                duration
            });
            res.end();
        }
    }
});

// 图像生成函数
async function generateImage(model, prompt, numImages = 1, size = "1024x1024", responseFormat = "url") {
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
        const [width, height] = size.split("x").map(Number);
        if (model === "flux-1.1-ultra" || model === "ideogram-v2") {
            const gcd = (a, b) => b ? gcd(b, a % b) : a;
            const divisor = gcd(width, height);
            requestBody.aspect_ratio = `${width / divisor}:${height / divisor}`;
        } else {
            requestBody.image_size = { width, height };
        }
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
                'Authorization': `Key ${FAL_KEY}`,
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
            throw new Error(`API request failed with status ${response.status}: ${errorText}`);
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
        
        const maxAttempts = 60;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            logger.debug(`Polling attempt ${attempt + 1}/${maxAttempts}`, {
                requestType: 'generateImage',
                model,
                requestId,
                attempt: attempt + 1,
                elapsedTime: Date.now() - startTime
            });
            
            // 检查状态
            const statusResponse = await fetch(statusUrl, {
                headers: {
                    'Authorization': `Key ${FAL_KEY}`
                }
            });
            
            if (!statusResponse.ok) {
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
                        'Authorization': `Key ${FAL_KEY}`
                    }
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
                        duration
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
            }
            
            // 等待后再次检查
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        const duration = Date.now() - startTime;
        logger.error(`Request timed out`, {
            requestType: 'generateImage',
            model,
            requestId,
            attempts: maxAttempts,
            duration
        });
        throw new Error("Request timed out after multiple polling attempts");
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

// POST /v1/images/generations endpoint
app.post('/v1/images/generations', async (req, res) => {
    const startTime = Date.now();
    const { model = "flux-dev", prompt, n = 1, size = "1024x1024", responseFormat = "url", user = "" } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '-';
    const requestType = 'POST /v1/images/generations';

    logger.info(`Received image generation request`, {
        requestType,
        ip,
        model,
        promptLength: prompt?.length,
        n,
        size
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
    if (!isImageModel(model)) {
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
        
        // 构建符合 OpenAI 格式的响应
        const response = {
            created: Math.floor(Date.now() / 1000),
            data: imageUrls,
            model: model
        };
        
        logger.info(`Successfully generated images`, {
            requestType,
            ip,
            model,
            imageCount: imageUrls.length,
            duration
        });
        
        res.json(response);
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
});

// 启动服务器
app.listen(PORT, () => {
    logger.info(`Server started successfully`, {
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        falKeyConfigured: !!FAL_KEY,
        apiKeyProtection: !!API_KEY
    });
    
    logger.info(`API endpoints available`, {
        models: `GET http://localhost:${PORT}/v1/models`,
        chat: `POST http://localhost:${PORT}/v1/chat/completions`,
        images: `POST http://localhost:${PORT}/v1/images/generations`
    });
});

// 根路径响应
app.get('/', (req, res) => {
    res.send('Fal OpenAI Proxy (System Top + Separator + Recency Strategy) is running.');
});