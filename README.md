# FAL API 代理服务

这是一个基于 Node.js 的 FAL AI API 代理服务，提供了与 OpenAI API 兼容的接口，支持图像生成和聊天功能。

## 功能特点

- 🖼️ 支持多种图像生成模型：
  - flux-1.1-ultra
  - recraft-v3
  - flux-1.1-pro
  - ideogram-v2
  - flux-dev

- 🤖 支持多种聊天模型：
  - **Anthropic Claude 系列**：
    - anthropic/claude-sonnet-4 ✨ (新增)
    - anthropic/claude-opus-4 ✨ (新增)
    - anthropic/claude-3.7-sonnet
    - anthropic/claude-3.5-sonnet
    - anthropic/claude-3-5-haiku
    - anthropic/claude-3-haiku
  - **Google Gemini 系列**：
    - google/gemini-2.5-pro ✨ (新增)
    - google/gemini-pro-1.5
    - google/gemini-flash-1.5
    - google/gemini-flash-1.5-8b
    - google/gemini-2.0-flash-001
  - **Moonshot AI 系列**：
    - moonshotai/kimi-k2 ✨ (新增)
  - **Meta Llama 系列**：
    - meta-llama/llama-3.2-1b-instruct
    - meta-llama/llama-3.2-3b-instruct
    - meta-llama/llama-3.1-8b-instruct
    - meta-llama/llama-3.1-70b-instruct
    - meta-llama/llama-4-maverick
    - meta-llama/llama-4-scout
  - **OpenAI GPT 系列**：
    - openai/gpt-4o-mini
    - openai/gpt-4o
  - **DeepSeek 系列**：
    - deepseek/deepseek-r1

- 💬 流式响应支持
  - 支持 SSE (Server-Sent Events)
  - 实时返回生成结果
  - 兼容 OpenAI 的流式响应格式

- 🔒 安全特性
  - API 密钥验证
  - 请求日志记录
  - 错误处理和重试机制

- 🐳 Docker 支持
  - 官方镜像支持
  - 环境隔离
  - 快速部署

## 快速开始

### 方式一：使用 Docker（推荐）

1. 拉取镜像：
   ```bash
   docker pull 8ybing/fal2api:latest
   ```

2. 运行容器：
   ```bash
   docker run -d \
     --name fal2api \
     -p 3001:3001 \
     -e FAL_KEY=your_fal_api_key \
     -e API_KEY=your_custom_api_key \
     -e PORT=3001 \
     -e NODE_ENV=production \
     -e DEBUG=false \
     8ybing/fal2api:latest
   ```

   环境变量说明：
   - `FAL_KEY`: FAL AI 的 API 密钥（必需）
   - `API_KEY`: 自定义 API 密钥，用于验证客户端请求（必需）
   - `PORT`: 服务端口号（可选，默认 3001）
   - `NODE_ENV`: 运行环境（可选，默认 production）
   - `DEBUG`: 是否开启调试模式（可选，默认 false）

3. 检查服务状态：
   ```bash
   docker logs fal2api
   ```

### 方式二：本地安装

### 环境要求

- Node.js >= 18
- npm >= 8

### 安装步骤

1. 克隆仓库：
   ```bash
   git clone [repository-url]
   cd fal2api
   ```

2. 安装依赖：
   ```bash
   npm install
   ```

3. 配置环境变量：
   ```bash
   cp .env.example .env
   ```
   编辑 `.env` 文件，设置以下参数：
   ```
   PORT=3001
   FAL_KEY=your_fal_api_key
   API_KEY=your_custom_api_key
   ```

4. 启动服务：
   ```bash
   npm start
   ```

## Docker 相关命令

# 使用新镜像启动容器
docker run -d \
  --name fal2api \
  -p 3001:3001 \
  -e FAL_KEY=your_fal_api_key \
  -e API_KEY=your_custom_api_key \
  -e PORT=3001 \
  -e NODE_ENV=production \
  8ybing/fal2api:latest
```

### 自定义构建
```bash
# 克隆仓库
git clone [repository-url]
cd fal2api

# 构建镜像
docker build -t fal2api .

# 运行自构建镜像
docker run -d \
  --name fal2api \
  -p 3001:3001 \
  -e FAL_KEY=your_fal_api_key \
  -e API_KEY=your_custom_api_key \
  -e PORT=3001 \
  -e NODE_ENV=production \
  fal2api
```

## API 端点

### 图像生成

```http
POST /v1/images/generations
```

请求体示例：
```json
{
  "model": "recraft-v3",
  "prompt": "一只可爱的猫咪",
  "n": 1,
  "size": "1024x1024",
  "stream": true
}
```

### 聊天完成

```http
POST /v1/chat/completions
```

请求体示例（使用新支持的Claude Sonnet 4模型）：
```json
{
  "model": "anthropic/claude-sonnet-4",
  "messages": [
    {
      "role": "system",
      "content": "你是一个有用的AI助手。"
    },
    {
      "role": "user",
      "content": "请解释一下量子计算的基本原理。"
    }
  ],
  "stream": true
}
```

请求体示例（使用Claude Opus 4模型）：
```json
{
  "model": "anthropic/claude-opus-4",
  "messages": [
    {
      "role": "user",
      "content": "写一首关于春天的诗。"
    }
  ],
  "stream": false
}
```

## 配置选项

| 环境变量 | 描述 | 默认值 |
|----------|------|--------|
| PORT | 服务端口 | 3001 |
| FAL_KEY | FAL AI API 密钥 | - |
| API_KEY | 自定义 API 密钥 | - |
| NODE_ENV | 运行环境 | development |

## 错误处理

服务会返回标准的错误响应：

```json
{
  "error": {
    "message": "错误描述",
    "type": "error_type",
    "param": "相关参数",
    "code": "错误代码"
  }
}
```

## 开发指南

### 目录结构

```
src/
├── config/         # 配置文件
├── controllers/    # 请求处理器
├── services/      # 业务逻辑
├── utils/         # 工具函数
└── app.js         # 应用入口
```

### 日志系统

使用分级日志系统记录信息：
- ERROR: 错误信息
- WARN: 警告信息
- INFO: 一般信息
- DEBUG: 调试信息

### 调试

设置环境变量开启调试模式：
```bash
DEBUG=true npm start
```

## 常见问题

1. **图片生成失败**
   - 检查 FAL API 密钥是否正确
   - 确认请求参数格式
   - 查看服务日志获取详细错误信息

2. **流式响应问题**
   - 确保客户端支持 SSE
   - 检查网络连接
   - 验证 stream 参数设置

## 许可证

MIT

## 贡献指南

1. Fork 项目
2. 创建特性分支
3. 提交改动
4. 发起 Pull Request

## 联系方式

如有问题或建议，请提交 Issue 或联系维护者。 