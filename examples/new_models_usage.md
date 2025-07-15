# 新增模型使用示例

本文档展示如何使用最新添加的模型。

## 新增模型

- `moonshotai/kimi-k2` - Moonshot AI 的 Kimi K2 模型
- `google/gemini-2.5-pro` - Google 最新的 Gemini 2.5 Pro 模型

## 使用示例

### 1. Moonshot AI Kimi K2 模型

#### 基本聊天
```bash
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "moonshotai/kimi-k2",
    "messages": [
      {
        "role": "user",
        "content": "请介绍一下中国的传统文化。"
      }
    ],
    "stream": false
  }'
```

#### 流式响应
```bash
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "moonshotai/kimi-k2",
    "messages": [
      {
        "role": "system",
        "content": "你是一个专业的中文写作助手。"
      },
      {
        "role": "user",
        "content": "请写一篇关于人工智能发展的文章。"
      }
    ],
    "stream": true
  }'
```

### 2. Google Gemini 2.5 Pro 模型

#### 基本聊天
```bash
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "google/gemini-2.5-pro",
    "messages": [
      {
        "role": "user",
        "content": "Explain the concept of quantum computing in simple terms."
      }
    ],
    "stream": false
  }'
```

#### 复杂推理任务
```bash
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "google/gemini-2.5-pro",
    "messages": [
      {
        "role": "system",
        "content": "You are an expert data scientist and machine learning engineer."
      },
      {
        "role": "user",
        "content": "Design a complete machine learning pipeline for predicting customer churn, including data preprocessing, feature engineering, model selection, and evaluation metrics."
      }
    ],
    "stream": true
  }'
```

## JavaScript 示例

```javascript
// 使用 Kimi K2 模型
async function callKimiK2() {
  const response = await fetch('http://localhost:3001/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_API_KEY'
    },
    body: JSON.stringify({
      model: 'moonshotai/kimi-k2',
      messages: [
        {
          role: 'user',
          content: '请解释一下区块链技术的基本原理。'
        }
      ],
      stream: false
    })
  });

  const data = await response.json();
  console.log(data.choices[0].message.content);
}

// 使用 Gemini 2.5 Pro 模型
async function callGemini25Pro() {
  const response = await fetch('http://localhost:3001/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_API_KEY'
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-pro',
      messages: [
        {
          role: 'user',
          content: 'Create a comprehensive business plan for a sustainable energy startup.'
        }
      ],
      stream: false
    })
  });

  const data = await response.json();
  console.log(data.choices[0].message.content);
}
```

## Python 示例

```python
import requests
import json

def call_kimi_k2():
    """调用 Moonshot AI Kimi K2 模型"""
    url = "http://localhost:3001/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer YOUR_API_KEY"
    }
    data = {
        "model": "moonshotai/kimi-k2",
        "messages": [
            {
                "role": "user",
                "content": "请分析一下当前人工智能技术的发展趋势。"
            }
        ],
        "stream": False
    }
    
    response = requests.post(url, headers=headers, json=data)
    result = response.json()
    print("Kimi K2 响应:")
    print(result["choices"][0]["message"]["content"])

def call_gemini_25_pro():
    """调用 Google Gemini 2.5 Pro 模型"""
    url = "http://localhost:3001/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer YOUR_API_KEY"
    }
    data = {
        "model": "google/gemini-2.5-pro",
        "messages": [
            {
                "role": "system",
                "content": "You are a senior software architect with expertise in distributed systems."
            },
            {
                "role": "user",
                "content": "Design a scalable microservices architecture for an e-commerce platform that can handle millions of users."
            }
        ],
        "stream": False
    }
    
    response = requests.post(url, headers=headers, json=data)
    result = response.json()
    print("Gemini 2.5 Pro 响应:")
    print(result["choices"][0]["message"]["content"])

if __name__ == "__main__":
    print("=== 新模型测试 ===\n")
    
    call_kimi_k2()
    print("\n" + "="*50 + "\n")
    call_gemini_25_pro()
```

## 模型特点和使用建议

### Moonshot AI Kimi K2
- **优势**: 对中文理解和生成能力强，适合中文内容创作
- **适用场景**: 中文写作、翻译、文档生成、中文对话
- **建议**: 处理中文相关任务时优先考虑

### Google Gemini 2.5 Pro
- **优势**: 强大的推理能力和多模态理解
- **适用场景**: 复杂推理、代码生成、技术分析、创意写作
- **建议**: 需要高质量输出和复杂推理的任务

## 注意事项

1. **模型可用性**: 确保您的 FAL.ai 账户有权限使用这些模型
2. **API 配置**: 正确设置 `FAL_KEY` 和 `API_KEY` 环境变量
3. **请求限制**: 注意各模型的请求频率和大小限制
4. **错误处理**: 在生产环境中实现适当的错误处理和重试机制