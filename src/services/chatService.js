import { fal } from '@fal-ai/client';
import { config } from '../config/env.js';
import { FAL_SUPPORTED_MODELS } from '../config/constants.js';
import { logger } from '../utils/logger.js';

// 配置FAL客户端
fal.config({
    credentials: config.falKey,
    requestTimeout: 60000,     // 减少到60秒，加快超时响应
    proxyUrl: config.httpProxy || config.httpsProxy,
    retryAttempts: 1,         // 减少重试次数，避免等待
    retryDelay: 500,          // 减少重试延迟
    maxConcurrency: 5,        // 增加并发请求数
    keepAlive: true,          // 启用keep-alive
    connectionTimeout: 5000    // 连接超时设置为5秒
});

// 验证模型是否为聊天模型
export function isChatModel(model) {
    return FAL_SUPPORTED_MODELS.includes(model);
}

// 转换消息为FAL格式
export function convertMessagesToFalPrompt(messages) {
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
    if (fixed_system_prompt_content.length > config.limits.systemPromptLength) {
        const originalLength = fixed_system_prompt_content.length;
        fixed_system_prompt_content = fixed_system_prompt_content.substring(0, config.limits.systemPromptLength);
        logger.warn(`Combined system messages truncated from ${originalLength} to ${config.limits.systemPromptLength}`);
    }
    
    fixed_system_prompt_content = fixed_system_prompt_content.trim();

    // 3. 计算 system_prompt 中留给对话历史的剩余空间
    let space_occupied_by_fixed_system = 0;
    if (fixed_system_prompt_content.length > 0) {
        space_occupied_by_fixed_system = fixed_system_prompt_content.length + 4;
    }
    const remaining_system_limit = Math.max(0, config.limits.systemPromptLength - space_occupied_by_fixed_system);

    // 4. 反向填充 User/Assistant 对话历史
    const prompt_history_blocks = [];
    const system_prompt_history_blocks = [];
    let current_prompt_length = 0;
    let current_system_history_length = 0;
    let promptFull = false;
    let systemHistoryFull = (remaining_system_limit <= 0);

    for (let i = conversation_message_blocks.length - 1; i >= 0; i--) {
        const message_block = conversation_message_blocks[i];
        const block_length = message_block.length;

        if (promptFull && systemHistoryFull) break;

        if (!promptFull) {
            if (current_prompt_length + block_length <= config.limits.promptLength) {
                prompt_history_blocks.unshift(message_block);
                current_prompt_length += block_length;
                continue;
            } else {
                promptFull = true;
            }
        }

        if (!systemHistoryFull) {
            if (current_system_history_length + block_length <= remaining_system_limit) {
                system_prompt_history_blocks.unshift(message_block);
                current_system_history_length += block_length;
                continue;
            } else {
                systemHistoryFull = true;
            }
        }
    }

    // 5. 组合最终的 prompt 和 system_prompt
    const system_prompt_history_content = system_prompt_history_blocks.join('').trim();
    const final_prompt = prompt_history_blocks.join('').trim();
    const SEPARATOR = "\n\n-------下面是比较早之前的对话内容-----\n\n";
    let final_system_prompt = "";

    const hasFixedSystem = fixed_system_prompt_content.length > 0;
    const hasSystemHistory = system_prompt_history_content.length > 0;

    if (hasFixedSystem && hasSystemHistory) {
        final_system_prompt = fixed_system_prompt_content + SEPARATOR + system_prompt_history_content;
    } else if (hasFixedSystem) {
        final_system_prompt = fixed_system_prompt_content;
    } else if (hasSystemHistory) {
        final_system_prompt = system_prompt_history_content;
    }

    return {
        system_prompt: final_system_prompt,
        prompt: final_prompt
    };
}

// 处理流式响应
export async function handleStreamResponse(stream, res, model, startTime, requestType, ip) {
    let previousOutput = '';
    let chunkCount = 0;

    try {
        for await (const event of stream) {
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
                const errorChunk = { 
                    id: `chatcmpl-${Date.now()}-error`, 
                    object: "chat.completion.chunk", 
                    created: Math.floor(Date.now() / 1000), 
                    model: model, 
                    choices: [{ 
                        index: 0, 
                        delta: {}, 
                        finish_reason: "error", 
                        message: { 
                            role: 'assistant', 
                            content: `Fal Stream Error: ${JSON.stringify(errorInfo)}` 
                        } 
                    }] 
                };
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
                const openAIChunk = { 
                    id: `chatcmpl-${Date.now()}`, 
                    object: "chat.completion.chunk", 
                    created: Math.floor(Date.now() / 1000), 
                    model: model, 
                    choices: [{ 
                        index: 0, 
                        delta: { content: deltaContent }, 
                        finish_reason: isPartial === false ? "stop" : null 
                    }] 
                };
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
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error('Error during fal stream processing', {
            requestType,
            ip,
            model,
            duration,
            error: error instanceof Error ? error.message : JSON.stringify(error)
        });
        
        try {
            const errorDetails = (error instanceof Error) ? error.message : JSON.stringify(error);
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
            if (!res.writableEnded) { 
                res.end(); 
            }
        }
        throw error;
    }
}

// 处理非流式响应
export async function handleNonStreamResponse(falInput, model, startTime, requestType, ip) {
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
        throw new Error(`Fal-ai error: ${JSON.stringify(result.error)}`);
    }

    return {
        id: `chatcmpl-${result.requestId || Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: model,
        choices: [{
            index: 0,
            message: {
                role: "assistant",
                content: result.output || ""
            },
            finish_reason: "stop"
        }],
        usage: {
            prompt_tokens: null,
            completion_tokens: null,
            total_tokens: null
        },
        system_fingerprint: null,
        ...(result.reasoning && { fal_reasoning: result.reasoning })
    };
} 