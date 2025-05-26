import express from 'express';
import { config } from './config/env.js';
import { logger } from './utils/logger.js';
import { handleImageGeneration } from './controllers/imageController.js';
import { handleChatCompletion } from './controllers/chatController.js';
import { FAL_SUPPORTED_MODELS, FAL_IMAGE_MODELS } from './config/constants.js';

const app = express();

// 中间件配置
app.use(express.json({ limit: config.limits.bodySize }));
app.use(express.urlencoded({ extended: true, limit: config.limits.bodySize }));
app.use(logger.requestLogger());

// CORS配置
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// 路由配置
app.get('/v1/models', (req, res) => {
    logger.info("Received request for GET /v1/models");
    try {
        const modelsData = [...FAL_SUPPORTED_MODELS, ...FAL_IMAGE_MODELS].map(modelId => ({
            id: modelId,
            object: "model",
            created: 1700000000,
            owned_by: modelId.split('/')[0]
        }));
        res.json({ object: "list", data: modelsData });
        logger.info("Successfully returned model list");
    } catch (error) {
        logger.error("Error processing GET /v1/models:", error);
        res.status(500).json({
            error: {
                message: "Failed to retrieve model list",
                type: "server_error"
            }
        });
    }
});

// 聊天完成接口
app.post('/v1/chat/completions', handleChatCompletion);

// 图像生成接口
app.post('/v1/images/generations', handleImageGeneration);

// 错误处理中间件
app.use((err, req, res, next) => {
    logger.error('Unhandled error:', err);
    res.status(500).json({
        error: {
            message: 'Internal server error',
            type: 'internal_error'
        }
    });
});

// 启动服务器
const port = config.port;
app.listen(port, () => {
    logger.info(`Server started successfully`, {
        port: port,
        environment: config.nodeEnv,
        falKeyConfigured: !!config.falKey,
        apiKeyProtection: !!config.apiKey
    });
    
    logger.info(`API endpoints available`, {
        models: `GET http://localhost:${port}/v1/models`,
        chat: `POST http://localhost:${port}/v1/chat/completions`,
        images: `POST http://localhost:${port}/v1/images/generations`
    });
}); 