# SSE (Server-Sent Events) 调用方式对比

本文档对比两种常见的 SSE 调用方式：**EventSource API** 和 **Fetch API**，帮助开发者选择最适合项目需求的方案。

---

## 📋 目录

- [什么是 SSE](#什么是-sse)
- [方式一：EventSource API](#方式一eventsource-api)
- [方式二：Fetch API](#方式二fetch-api)
- [带认证和参数的完整示例](#带认证和参数的完整示例)
- [对比总结](#对比总结)
- [选择建议](#选择建议)

---

## 什么是 SSE

Server-Sent Events (SSE) 是一种服务器向客户端推送实时数据的技术，特点：

- **单向通信**：服务器 → 客户端
- **基于 HTTP**：使用标准 HTTP 协议
- **自动重连**：连接断开后浏览器会自动重连
- **文本格式**：传输 `text/event-stream` 格式数据

---

## 方式一：EventSource API

### 📝 基本示例

```javascript
// 创建 SSE 连接
const eventSource = new EventSource('http://localhost:4000/events')

// 监听连接打开事件
eventSource.onopen = () => {
  console.log('SSE 连接已建立')
}

// 监听默认消息事件
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data)
  console.log('收到消息:', data)
}

// 监听自定义事件类型
eventSource.addEventListener('system', (event) => {
  const data = JSON.parse(event.data)
  console.log('系统消息:', data.message)
})

eventSource.addEventListener('bot-chunk', (event) => {
  const data = JSON.parse(event.data)
  console.log('机器人回复片段:', data.chunk)
})

eventSource.addEventListener('heartbeat', (event) => {
  console.log('收到心跳')
})

// 监听错误事件
eventSource.onerror = (error) => {
  console.error('SSE 连接错误:', error)
  // 注意：浏览器会自动重连，除非调用 close()
}

// 关闭连接
// eventSource.close()
```

### 🔧 完整示例（Vue 3）

基于项目中 [App.vue](frontend/src/App.vue#L134-L163) 的实现：

```javascript
import { ref, onMounted, onBeforeUnmount } from 'vue'

const sseStatus = ref('disconnected')
let sse = null
let sseReconnectTimer = null
let sseAttempts = 0

function connectSSE() {
  clearTimeout(sseReconnectTimer)

  sseStatus.value = 'connecting'
  sse = new EventSource('http://localhost:4000/events')

  // 监听系统事件
  sse.addEventListener('system', (event) => {
    const data = JSON.parse(event.data)
    sseStatus.value = 'connected'
    sseAttempts = 0
    console.log('SSE 已连接:', data.message)
  })

  // 监听机器人消息片段
  sse.addEventListener('bot-chunk', (event) => {
    const data = JSON.parse(event.data)
    // 处理流式数据，拼接到现有消息
    updateBotMessage(data)
  })

  // 监听心跳
  sse.addEventListener('heartbeat', () => {
    if (sseStatus.value === 'connecting') {
      sseStatus.value = 'connected'
    }
  })

  // 错误处理与重连
  sse.onerror = () => {
    sseStatus.value = 'disconnected'
    sse.close()
    scheduleSseReconnect()
  }
}

function scheduleSseReconnect() {
  sseAttempts += 1
  const delay = Math.min(7000, 700 * sseAttempts) // 指数退避
  sseReconnectTimer = setTimeout(() => {
    connectSSE()
  }, delay)
}

onMounted(() => {
  connectSSE()
})

onBeforeUnmount(() => {
  clearTimeout(sseReconnectTimer)
  sse?.close()
})
```

### ✅ EventSource 优点

1. **自动重连**：连接断开后浏览器自动重试（默认 3 秒）
2. **简单易用**：API 简洁，无需手动处理流
3. **事件类型**：支持自定义事件名称（`event: system`）
4. **浏览器原生**：无需额外库，兼容性好
5. **Last-Event-ID**：自动发送上次事件 ID，支持断点续传

### ❌ EventSource 限制

1. **仅支持 GET 请求**：无法发送 POST 或自定义 body
2. **无法自定义请求头**：不支持 Authorization 等自定义头（需通过 URL 参数传递 token）
3. **同源限制**：跨域需要服务器 CORS 配置
4. **不支持 ReadableStream**：无法细粒度控制流

---

## 方式二：Fetch API

### 📝 基本示例

```javascript
async function connectSSEWithFetch() {
  try {
    const response = await fetch('http://localhost:4000/events', {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        console.log('流已结束')
        break
      }

      // 解码数据块
      const chunk = decoder.decode(value, { stream: true })

      // 处理 SSE 格式数据
      const lines = chunk.split('\n')
      let eventType = 'message'
      let data = ''

      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventType = line.slice(6).trim()
        } else if (line.startsWith('data:')) {
          data = line.slice(5).trim()
        } else if (line === '') {
          // 空行表示消息结束
          if (data) {
            handleSSEMessage(eventType, data)
            eventType = 'message'
            data = ''
          }
        }
      }
    }
  } catch (error) {
    console.error('Fetch SSE 错误:', error)
  }
}

function handleSSEMessage(eventType, data) {
  try {
    const parsed = JSON.parse(data)

    switch (eventType) {
      case 'system':
        console.log('系统消息:', parsed.message)
        break
      case 'bot-chunk':
        console.log('机器人回复片段:', parsed.chunk)
        break
      case 'heartbeat':
        console.log('收到心跳')
        break
      default:
        console.log('消息:', parsed)
    }
  } catch (error) {
    console.error('解析数据失败:', error)
  }
}
```

### 🔧 完整示例（带重连和缓冲处理）

```javascript
import { ref } from 'vue'

const sseStatus = ref('disconnected')
let abortController = null
let reconnectAttempts = 0

async function connectSSEWithFetch() {
  // 取消之前的连接
  if (abortController) {
    abortController.abort()
  }

  abortController = new AbortController()
  sseStatus.value = 'connecting'

  try {
    const response = await fetch('http://localhost:4000/events', {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'Authorization': 'Bearer YOUR_TOKEN', // 支持自定义请求头
      },
      signal: abortController.signal,
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    sseStatus.value = 'connected'
    reconnectAttempts = 0

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = '' // 处理跨块的不完整数据

    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        console.log('流结束')
        break
      }

      // 将新数据添加到缓冲区
      buffer += decoder.decode(value, { stream: true })

      // 按行分割，处理完整的消息
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // 保留不完整的最后一行

      let currentEvent = { type: 'message', data: '' }

      for (const line of lines) {
        if (line.startsWith('event:')) {
          currentEvent.type = line.slice(6).trim()
        } else if (line.startsWith('data:')) {
          currentEvent.data += line.slice(5).trim()
        } else if (line === '' && currentEvent.data) {
          // 空行表示消息完成
          handleSSEMessage(currentEvent.type, currentEvent.data)
          currentEvent = { type: 'message', data: '' }
        }
      }
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('连接已取消')
      return
    }

    console.error('Fetch SSE 错误:', error)
    sseStatus.value = 'disconnected'

    // 手动重连
    scheduleReconnect()
  }
}

function scheduleReconnect() {
  reconnectAttempts++
  const delay = Math.min(7000, 700 * reconnectAttempts)

  setTimeout(() => {
    connectSSEWithFetch()
  }, delay)
}

function handleSSEMessage(eventType, data) {
  try {
    const parsed = JSON.parse(data)

    switch (eventType) {
      case 'system':
        console.log('系统消息:', parsed.message)
        break
      case 'bot-chunk':
        updateBotMessage(parsed)
        break
      case 'heartbeat':
        console.log('心跳')
        break
    }
  } catch (error) {
    console.error('解析失败:', error)
  }
}

function disconnect() {
  abortController?.abort()
  sseStatus.value = 'disconnected'
}
```

### ✅ Fetch API 优点

1. **支持所有 HTTP 方法**：可使用 POST、PUT 等发送请求体
2. **自定义请求头**：支持 Authorization、自定义头等
3. **细粒度控制**：通过 ReadableStream 精确控制流
4. **取消请求**：使用 AbortController 随时取消
5. **更灵活**：可结合其他 Fetch 特性（如拦截器）

### ❌ Fetch API 限制

1. **需手动重连**：浏览器不会自动重连，需自己实现
2. **代码复杂**：需手动解析 SSE 格式（`event:`, `data:` 等）
3. **缓冲处理**：需处理跨数据块的不完整消息
4. **兼容性**：ReadableStream 在部分旧浏览器不支持

---

## 带认证和参数的完整示例

### 🔐 场景一：EventSource + URL 参数认证

由于 EventSource 不支持自定义请求头，需要通过 URL 参数传递认证信息。

#### 客户端实现

```javascript
// 1. 基础认证 - 传递 Token
const token = localStorage.getItem('authToken')
const userId = '12345'

const sse = new EventSource(
  `http://localhost:4000/events?token=${encodeURIComponent(token)}&userId=${userId}`
)

// 2. 多参数场景 - 聊天室订阅
function subscribeToRoom(roomId, username) {
  const params = new URLSearchParams({
    roomId: roomId,
    username: username,
    token: localStorage.getItem('authToken'),
    clientId: crypto.randomUUID(),
  })

  const sse = new EventSource(`http://localhost:4000/events?${params.toString()}`)

  sse.addEventListener('room-message', (event) => {
    const data = JSON.parse(event.data)
    console.log(`[${data.username}]: ${data.message}`)
  })

  sse.addEventListener('user-joined', (event) => {
    const data = JSON.parse(event.data)
    console.log(`${data.username} 加入了房间`)
  })

  sse.onerror = (error) => {
    console.error('连接失败:', error)
    sse.close()
  }

  return sse
}

// 使用示例
const chatSSE = subscribeToRoom('room-001', 'Alice')

// 离开房间时断开连接
function leaveRoom() {
  chatSSE.close()
}
```

#### 服务端实现（Node.js + Express）

```javascript
const express = require('express')
const jwt = require('jsonwebtoken')
const app = express()

const JWT_SECRET = 'your-secret-key'
const sseClients = new Map() // { roomId: [{ res, userId, username }] }

// SSE 端点 - 带认证和参数
app.get('/events', (req, res) => {
  // 1. 验证 Token
  const { token, roomId, username, userId, clientId } = req.query

  if (!token) {
    return res.status(401).json({ error: '缺少认证 token' })
  }

  try {
    // 验证 JWT Token
    const decoded = jwt.verify(token, JWT_SECRET)

    if (decoded.userId !== userId) {
      return res.status(403).json({ error: 'Token 与用户 ID 不匹配' })
    }
  } catch (error) {
    return res.status(401).json({ error: 'Token 无效或已过期' })
  }

  // 2. 验证必需参数
  if (!roomId || !username) {
    return res.status(400).json({ error: '缺少必需参数: roomId, username' })
  }

  // 3. 设置 SSE 响应头
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  // 4. 将客户端添加到房间
  if (!sseClients.has(roomId)) {
    sseClients.set(roomId, [])
  }

  const clientInfo = { res, userId, username, clientId }
  sseClients.get(roomId).push(clientInfo)

  // 5. 发送连接成功消息
  res.write(`event: system\n`)
  res.write(`data: ${JSON.stringify({
    message: `欢迎 ${username} 加入房间 ${roomId}`,
    roomId,
    onlineCount: sseClients.get(roomId).length
  })}\n\n`)

  // 6. 广播用户加入事件
  broadcastToRoom(roomId, 'user-joined', {
    username,
    userId,
    timestamp: Date.now()
  }, clientId)

  // 7. 客户端断开处理
  req.on('close', () => {
    const clients = sseClients.get(roomId)
    if (clients) {
      const index = clients.findIndex(c => c.clientId === clientId)
      if (index !== -1) {
        clients.splice(index, 1)

        // 广播用户离开事件
        broadcastToRoom(roomId, 'user-left', {
          username,
          userId,
          timestamp: Date.now()
        })

        console.log(`用户 ${username} 离开房间 ${roomId}`)
      }

      // 房间空了则删除
      if (clients.length === 0) {
        sseClients.delete(roomId)
      }
    }
  })
})

// 向指定房间广播消息（排除发送者）
function broadcastToRoom(roomId, eventName, data, excludeClientId = null) {
  const clients = sseClients.get(roomId)
  if (!clients) return

  const message = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`

  clients.forEach(client => {
    if (client.clientId !== excludeClientId) {
      client.res.write(message)
    }
  })
}

// 向房间内所有人发送消息（包括发送者）
function sendToRoom(roomId, eventName, data) {
  broadcastToRoom(roomId, eventName, data, null)
}

app.listen(4000)
```

---

### 🔐 场景二：Fetch API + JWT 认证 + POST 请求

Fetch 支持完整的 HTTP 请求能力，适合需要发送复杂数据的场景。

#### 客户端实现

```javascript
// 1. 基础 JWT 认证
async function connectWithAuth() {
  const token = localStorage.getItem('authToken')

  const response = await fetch('http://localhost:4000/events', {
    method: 'GET',
    headers: {
      'Accept': 'text/event-stream',
      'Authorization': `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    if (response.status === 401) {
      console.error('认证失败，请重新登录')
      // 跳转到登录页
      window.location.href = '/login'
      return
    }
    throw new Error(`HTTP ${response.status}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    let currentEvent = { type: 'message', data: '' }

    for (const line of lines) {
      if (line.startsWith('event:')) {
        currentEvent.type = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        currentEvent.data += line.slice(5).trim()
      } else if (line === '' && currentEvent.data) {
        handleSSEMessage(currentEvent.type, currentEvent.data)
        currentEvent = { type: 'message', data: '' }
      }
    }
  }
}

// 2. POST 请求 + 发送上下文数据（AI 对话场景）
async function streamAIResponse(userMessage, conversationHistory) {
  const token = localStorage.getItem('authToken')

  const response = await fetch('http://localhost:4000/api/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      message: userMessage,
      conversationId: '12345',
      history: conversationHistory.slice(-10), // 最近 10 条消息
      model: 'gpt-4',
      temperature: 0.7,
    }),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullResponse = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      console.log('AI 回复完成:', fullResponse)
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.startsWith('data:')) {
        const data = line.slice(5).trim()

        if (data === '[DONE]') {
          console.log('流结束标记')
          continue
        }

        try {
          const parsed = JSON.parse(data)

          if (parsed.type === 'content') {
            fullResponse += parsed.text
            // 实时更新 UI
            updateChatMessage(parsed.messageId, fullResponse)
          } else if (parsed.type === 'error') {
            console.error('AI 错误:', parsed.message)
          }
        } catch (error) {
          console.warn('解析失败:', data)
        }
      }
    }
  }

  return fullResponse
}

// 3. 完整封装 - 带重连、认证刷新
class SSEClient {
  constructor(url, options = {}) {
    this.url = url
    this.options = options
    this.abortController = null
    this.reconnectAttempts = 0
    this.maxReconnects = options.maxReconnects || 5
    this.listeners = new Map()
  }

  async connect() {
    if (this.abortController) {
      this.abortController.abort()
    }

    this.abortController = new AbortController()

    try {
      // 获取最新 Token（支持自动刷新）
      const token = await this.getToken()

      const response = await fetch(this.url, {
        method: this.options.method || 'GET',
        headers: {
          'Accept': 'text/event-stream',
          'Authorization': `Bearer ${token}`,
          ...this.options.headers,
        },
        body: this.options.body ? JSON.stringify(this.options.body) : undefined,
        signal: this.abortController.signal,
      })

      if (response.status === 401) {
        // Token 过期，尝试刷新
        const refreshed = await this.refreshToken()
        if (refreshed) {
          return this.connect() // 重试
        }
        throw new Error('认证失败')
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      this.reconnectAttempts = 0
      await this.readStream(response.body)

    } catch (error) {
      if (error.name === 'AbortError') return

      console.error('SSE 错误:', error)

      if (this.reconnectAttempts < this.maxReconnects) {
        this.reconnectAttempts++
        const delay = Math.min(10000, 1000 * Math.pow(2, this.reconnectAttempts))
        console.log(`${delay}ms 后重连（第 ${this.reconnectAttempts} 次）`)
        setTimeout(() => this.connect(), delay)
      } else {
        this.emit('max-reconnects-reached')
      }
    }
  }

  async readStream(stream) {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      let currentEvent = { type: 'message', data: '' }

      for (const line of lines) {
        if (line.startsWith('event:')) {
          currentEvent.type = line.slice(6).trim()
        } else if (line.startsWith('data:')) {
          currentEvent.data += line.slice(5).trim()
        } else if (line === '' && currentEvent.data) {
          this.emit(currentEvent.type, currentEvent.data)
          currentEvent = { type: 'message', data: '' }
        }
      }
    }
  }

  on(eventType, callback) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, [])
    }
    this.listeners.get(eventType).push(callback)
  }

  emit(eventType, data) {
    const callbacks = this.listeners.get(eventType)
    if (callbacks) {
      callbacks.forEach(cb => {
        try {
          const parsed = JSON.parse(data)
          cb(parsed)
        } catch {
          cb(data)
        }
      })
    }
  }

  async getToken() {
    return localStorage.getItem('authToken')
  }

  async refreshToken() {
    try {
      const refreshToken = localStorage.getItem('refreshToken')
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })

      if (response.ok) {
        const { token } = await response.json()
        localStorage.setItem('authToken', token)
        return true
      }
    } catch (error) {
      console.error('Token 刷新失败:', error)
    }
    return false
  }

  disconnect() {
    this.abortController?.abort()
  }
}

// 使用示例
const client = new SSEClient('http://localhost:4000/events', {
  method: 'POST',
  headers: {
    'X-Client-Version': '1.0.0',
  },
  body: {
    filters: ['news', 'updates'],
    language: 'zh-CN',
  },
  maxReconnects: 10,
})

client.on('notification', (data) => {
  console.log('收到通知:', data)
})

client.on('max-reconnects-reached', () => {
  console.error('达到最大重连次数')
})

client.connect()

// 断开连接
// client.disconnect()
```

#### 服务端实现（支持 POST 和 JWT）

```javascript
const express = require('express')
const jwt = require('jsonwebtoken')
const app = express()

app.use(express.json())

const JWT_SECRET = 'your-secret-key'

// JWT 验证中间件
function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '缺少认证 token' })
  }

  const token = authHeader.slice(7)

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded // { userId, username, email, ... }
    next()
  } catch (error) {
    return res.status(401).json({ error: 'Token 无效或已过期' })
  }
}

// SSE 端点 - GET 请求
app.get('/events', authenticateJWT, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
  })

  res.write(`event: system\n`)
  res.write(`data: ${JSON.stringify({
    message: `用户 ${req.user.username} 已连接`,
    userId: req.user.userId
  })}\n\n`)

  req.on('close', () => {
    console.log(`用户 ${req.user.userId} 断开连接`)
  })
})

// SSE 端点 - POST 请求（AI 流式对话）
app.post('/api/chat/stream', authenticateJWT, async (req, res) => {
  const { message, conversationId, history, model, temperature } = req.body

  // 验证请求体
  if (!message) {
    return res.status(400).json({ error: '缺少 message 参数' })
  }

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
  })

  // 模拟 AI 流式响应
  const responseText = `针对您的问题「${message}」，我的回答是：这是一个模拟的 AI 回复，展示了如何通过 POST 请求建立 SSE 连接。`
  const words = responseText.split('')

  for (let i = 0; i < words.length; i++) {
    await new Promise(resolve => setTimeout(resolve, 50))

    res.write(`event: content\n`)
    res.write(`data: ${JSON.stringify({
      type: 'content',
      text: words[i],
      messageId: conversationId,
      index: i,
    })}\n\n`)
  }

  // 发送完成标记
  res.write(`data: [DONE]\n\n`)
  res.end()
})

app.listen(4000, () => {
  console.log('服务运行在 http://localhost:4000')
})
```

---

### 📊 认证方式对比

| 认证方式 | EventSource | Fetch API | 安全性 | 适用场景 |
|---------|------------|-----------|--------|---------|
| **URL 参数** | ✅ 支持 | ✅ 支持 | ⚠️ 低（URL 可见） | 公开数据、临时 Token |
| **Authorization 头** | ❌ 不支持 | ✅ 支持 | ✅ 高 | 企业应用、敏感数据 |
| **Cookie** | ✅ 自动携带 | ✅ 支持（需 credentials） | 🟡 中 | 传统 Web 应用 |
| **自定义头** | ❌ 不支持 | ✅ 支持 | ✅ 高 | API Key、自定义协议 |

**安全建议**：
- 敏感场景避免将 Token 放在 URL（会被日志记录）
- 优先使用 HTTPS 加密传输
- JWT Token 设置合理的过期时间
- 实现 Token 刷新机制

---

## 对比总结

| 特性                | EventSource API       | Fetch API             |
|---------------------|----------------------|----------------------|
| **自动重连**        | ✅ 自动              | ❌ 需手动实现         |
| **自定义请求头**    | ❌ 不支持            | ✅ 完全支持           |
| **HTTP 方法**       | ❌ 仅 GET            | ✅ 所有方法           |
| **事件类型**        | ✅ 原生支持          | ⚠️ 需手动解析         |
| **取消连接**        | ✅ `close()`         | ✅ AbortController    |
| **代码复杂度**      | 🟢 简单              | 🟡 中等               |
| **流控制**          | ❌ 无法细粒度控制     | ✅ ReadableStream     |
| **跨域**            | ⚠️ 需 CORS           | ⚠️ 需 CORS            |
| **断点续传**        | ✅ Last-Event-ID     | ⚠️ 需手动实现         |
| **浏览器兼容性**    | 🟢 很好（IE 除外）    | 🟡 较好（ReadableStream）|

---

## 选择建议

### 使用 **EventSource** 的场景：

- ✅ **简单场景**：只需接收服务器推送的数据
- ✅ **无需自定义请求头**：不需要 Authorization 等认证（或通过 URL 参数传递）
- ✅ **不想处理重连逻辑**：希望浏览器自动重连
- ✅ **快速开发**：想用最少代码实现 SSE

**示例场景**：
- 实时通知推送
- 股票行情更新
- 日志流监控
- 简单的聊天应用

---

### 使用 **Fetch API** 的场景：

- ✅ **需要自定义请求头**：如 JWT Token 认证
- ✅ **需要 POST 请求**：发送请求体数据
- ✅ **精细控制流**：需要暂停、恢复、取消流
- ✅ **复杂重连策略**：需要自定义重连逻辑（如指数退避、最大重试次数）
- ✅ **与现有 Fetch 架构集成**：项目中已有统一的 Fetch 拦截器

**示例场景**：
- 需要 Token 认证的 SSE 服务
- AI 流式对话（需发送上下文）
- 文件上传进度流
- 企业级应用（需统一 API 管理）

---

## 服务端实现参考

基于项目 [server.js](backend/src/server.js#L24-L42) 的实现：

```javascript
const express = require('express')
const app = express()

// SSE 端点
app.get('/events', (req, res) => {
  // 设置 SSE 响应头
  res.set({
    'Content-Type': 'text/event-stream',      // SSE 必须
    'Cache-Control': 'no-cache, no-transform', // 禁止缓存
    'Connection': 'keep-alive',                // 保持连接
    'X-Accel-Buffering': 'no',                 // 禁止 Nginx 缓冲
  })

  // 发送初始连接消息
  res.write(`event: system\n`)
  res.write(`data: ${JSON.stringify({ message: 'SSE connected' })}\n\n`)

  // 定期发送心跳
  const heartbeat = setInterval(() => {
    res.write(`event: heartbeat\n`)
    res.write(`data: ${JSON.stringify({ timestamp: Date.now() })}\n\n`)
  }, 25000)

  // 客户端断开时清理
  req.on('close', () => {
    clearInterval(heartbeat)
    console.log('客户端断开连接')
  })
})

// 发送自定义事件
function sendBotMessage(res, data) {
  res.write(`event: bot-chunk\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

app.listen(4000, () => {
  console.log('SSE 服务运行在 http://localhost:4000')
})
```

### SSE 数据格式说明

```
event: system
data: {"message":"连接成功"}

event: bot-chunk
data: {"messageId":"123","chunk":"你好","isFinal":false}

event: heartbeat
data: {"timestamp":1234567890}

```

- `event:` 指定事件类型（可选，默认 `message`）
- `data:` 消息内容（必须）
- 每条消息以**两个换行符**（`\n\n`）结束

---

## 常见问题

### Q1: EventSource 如何传递 Token？

由于 EventSource 不支持自定义请求头，可以通过 URL 参数传递：

```javascript
const token = 'your-jwt-token'
const sse = new EventSource(`http://localhost:4000/events?token=${token}`)
```

服务端验证：

```javascript
app.get('/events', (req, res) => {
  const token = req.query.token
  if (!isValidToken(token)) {
    return res.status(401).end()
  }
  // 正常 SSE 逻辑
})
```

### Q2: Fetch 如何处理跨数据块的不完整消息？

使用 `buffer` 变量缓存不完整的行：

```javascript
let buffer = ''

while (true) {
  const { value } = await reader.read()
  buffer += decoder.decode(value, { stream: true })

  const lines = buffer.split('\n')
  buffer = lines.pop() || '' // 保留最后不完整的行

  // 处理完整的行
  for (const line of lines) {
    // ...
  }
}
```

### Q3: 如何检测 SSE 连接是否真的活跃？

**方法 1：服务端定期发送心跳**

```javascript
setInterval(() => {
  res.write(`event: heartbeat\ndata: ${Date.now()}\n\n`)
}, 25000)
```

**方法 2：客户端超时检测**

```javascript
let lastHeartbeat = Date.now()

sse.addEventListener('heartbeat', () => {
  lastHeartbeat = Date.now()
})

setInterval(() => {
  if (Date.now() - lastHeartbeat > 60000) {
    console.warn('超过 60 秒未收到心跳，重连')
    sse.close()
    reconnect()
  }
}, 30000)
```

---

## 总结

- **快速开发、简单场景** → 使用 **EventSource**
- **需要认证、复杂需求** → 使用 **Fetch API**
- 两者可以混合使用（如先用 Fetch 验证 Token，再用 EventSource 订阅事件）

根据项目实际需求选择最合适的方案，而不是追求"最佳实践"。
