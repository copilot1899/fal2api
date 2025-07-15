# Claude 4 模型使用示例

本文档展示如何使用新添加的 Claude 4 模型。

## 支持的 Claude 4 模型

- `anthropic/claude-sonnet-4` - 平衡性能和速度的模型
- `anthropic/claude-opus-4` - 高性能模型，适合复杂任务

## 使用示例

### 1. 基本聊天（Claude Sonnet 4）

```bash
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "anthropic/claude-sonnet-4",
    "messages": [
      {
        "role": "user",
        "content": "你好，请介绍一下自己。"
      }
    ],
    "stream": false
  }'
```

### 2. 流式响应（Claude Opus 4）

```bash
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "anthropic/claude-opus-4",
    "messages": [
      {
        "role": "system",
        "content": "你是一个专业的技术顾问。"
      },
      {
        "role": "user",
        "content": "请详细解释什么是微服务架构，以及它的优缺点。"
      }
    ],
    "stream": true
  }'
```

### 3. JavaScript 示例

```javascript
// 使用 fetch API 调用 Claude Sonnet 4
async function callClaudeSonnet4() {
  const response = await fetch('http://localhost:3001/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_API_KEY'
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4',
      messages: [
        {
          role: 'user',
          content: '请写一个简单的 Python 函数来计算斐波那契数列。'
        }
      ],
      stream: false
    })
  });

  const data = await response.json();
  console.log(data.choices[0].message.content);
}
```

### 4. Python 示例

```python
import requests
import json

def call_claude_sonnet_4():
    url = "http://localhost:3001/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer YOUR_API_KEY"
    }
    data = {
        "model": "anthropic/claude-sonnet-4",
        "messages": [
            {
                "role": "user",
                "content": "请解释一下机器学习中的过拟合现象。"
            }
        ],
        "stream": False
    }
    
    response = requests.post(url, headers=headers, json=data)
    result = response.json()
    print(result["choices"][0]["message"]["content"])

if __name__ == "__main__":
    call_claude_sonnet_4()
```

## 注意事项

1. **API 密钥**: 确保设置了正确的 `FAL_KEY` 和 `API_KEY` 环境变量
2. **模型可用性**: 这些模型需要 FAL.ai 平台支持，请确认您的账户有权限使用
3. **流式响应**: 使用 `stream: true` 可以获得实时响应，适合长文本生成
4. **错误处理**: 建议在生产环境中添加适当的错误处理逻辑

## 模型选择建议

- **Claude Sonnet 4**: 适合日常对话、代码生成、文档编写等平衡性任务
- **Claude Opus 4**: 适合复杂推理、创意写作、深度分析等高要求任务