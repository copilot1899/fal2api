import dotenv from 'dotenv';

dotenv.config();

export const config = {
    port: process.env.PORT || 3001,
    falKey: process.env.FAL_KEY,
    apiKey: process.env.API_KEY,
    nodeEnv: process.env.NODE_ENV || 'development',
    httpProxy: process.env.HTTP_PROXY,
    httpsProxy: process.env.HTTPS_PROXY,
    limits: {
        bodySize: '50mb',  // 可以根据需要调整
        promptLength: 4800,
        systemPromptLength: 4800
    }
};

// 验证必要的环境变量
const requiredEnvVars = ['FAL_KEY', 'API_KEY'];
for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
    }
} 