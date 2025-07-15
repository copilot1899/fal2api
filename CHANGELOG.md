# 更新日志

## [1.2.0] - 2025-07-15

### 新增
- ✨ 添加对 `moonshotai/kimi-k2` 模型的支持
- ✨ 添加对 `google/gemini-2.5-pro` 模型的支持

### 改进
- 📝 更新 README.md，添加新的模型提供商分组
- 📝 在文档中标记新增模型

### 技术细节
- 在 `src/config/constants.js` 中的 `FAL_SUPPORTED_MODELS` 数组中添加了两个新模型
- 新模型将通过现有的聊天完成API端点 `/v1/chat/completions` 提供服务
- 支持流式和非流式响应模式

---

## [1.1.0] - 2025-07-15

### 新增
- ✨ 添加对 `anthropic/claude-sonnet-4` 模型的支持
- ✨ 添加对 `anthropic/claude-opus-4` 模型的支持

### 改进
- 📝 更新 README.md，添加完整的支持模型列表
- 📝 添加新模型的使用示例
- 🧪 添加模型支持测试脚本

### 技术细节
- 在 `src/config/constants.js` 中的 `FAL_SUPPORTED_MODELS` 数组中添加了两个新模型
- 新模型将通过现有的聊天完成API端点 `/v1/chat/completions` 提供服务
- 支持流式和非流式响应模式

---

## [1.0.0] - 之前版本

### 功能特点
- 🖼️ 支持多种图像生成模型
- 💬 支持聊天完成功能
- 🔄 流式响应支持
- 🔒 API密钥验证
- 🐳 Docker支持