<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'
const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:4000/chat'

const createId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const messages = ref([])
const userInput = ref('')
const wsStatus = ref('disconnected')
const sseStatus = ref('disconnected')
const diagnostics = ref([]) // 诊断信息,用于显示最新状态,只保留最后4条
const chatBody = ref(null)

let ws
let sse
let wsReconnectTimer
let sseReconnectTimer
let wsAttempts = 0
let sseAttempts = 0

const canSend = computed(
  () => Boolean(userInput.value.trim()) && wsStatus.value === 'connected',
)

function statusText(status) {
  switch (status) {
    case 'connected':
      return '已连接'
    case 'connecting':
      return '连接中'
    default:
      return '已断开'
  }
}

function addDiagnostic(message) {
  diagnostics.value = [
    ...diagnostics.value,
    { id: createId(), message, timestamp: new Date().toLocaleTimeString() },
  ].slice(-4)
}

function pushMessage(entry) {
  messages.value = [...messages.value, entry].slice(-200) // 只保留最后200条消息
  nextTick(() => {
    if (chatBody.value) {
      chatBody.value.scrollTop = chatBody.value.scrollHeight
    }
  })
}

function upsertBotMessage(payload) {
  const chunk = payload.chunk ?? payload.text ?? ''
  if (!chunk) return

  const idx = messages.value.findIndex((msg) => msg.id === payload.messageId)
  if (idx === -1) {
    pushMessage({
      id: payload.messageId,
      author: payload.author ?? '助手',
      text: chunk,
      transport: 'sse',
      timestamp: payload.timestamp,
      streaming: !payload.isFinal,
    })
    return
  }

  const existing = messages.value[idx]
  const merged = {
    ...existing,
    text: existing.text ? `${existing.text} ${chunk}` : chunk,
    streaming: !payload.isFinal,
    timestamp: payload.timestamp,
  }
  messages.value.splice(idx, 1, merged)
}

function handleSocketMessage(event) {
  try {
    const payload = JSON.parse(event.data)
    if (payload.type === 'chat') {
      pushMessage({
        id: payload.id,
        author: payload.author ?? '访客',
        text: payload.text,
        transport: 'websocket',
        timestamp: payload.timestamp,
      })
    } else if (payload.type === 'system') {
      addDiagnostic(payload.text ?? 'WebSocket system message')
    } else if (payload.type === 'error') {
      addDiagnostic(payload.message)
    }
  } catch (error) {
    addDiagnostic(`WebSocket 数据解析失败: ${error}`)
  }
}

function connectWebSocket() {
  clearTimeout(wsReconnectTimer)

  wsStatus.value = 'connecting'
  ws = new WebSocket(WS_URL)
  ws.onopen = () => {
    wsAttempts = 0
    wsStatus.value = 'connected'
  }
  ws.onmessage = handleSocketMessage
  ws.onerror = () => {
    ws?.close()
  }
  ws.onclose = () => {
    wsStatus.value = 'disconnected'
    scheduleWsReconnect()
  }
}

function scheduleWsReconnect() {
  wsAttempts += 1
  const delay = Math.min(5000, 500 * wsAttempts)
  wsReconnectTimer = setTimeout(() => {
    connectWebSocket()
  }, delay)
}

function connectSSE() {
  clearTimeout(sseReconnectTimer)

  sseStatus.value = 'connecting'
  sse = new EventSource(`${API_BASE_URL}/events`)

  sse.addEventListener('system', (event) => {
    const data = JSON.parse(event.data)
    sseStatus.value = 'connected'
    sseAttempts = 0
    addDiagnostic(data.message ?? 'SSE connected')
  })

  sse.addEventListener('bot-chunk', (event) => {
    const data = JSON.parse(event.data)
    upsertBotMessage(data)
  })

  sse.addEventListener('heartbeat', () => {
    if (sseStatus.value === 'connecting') {
      sseStatus.value = 'connected'
    }
  })

  sse.onerror = () => {
    sseStatus.value = 'disconnected'
    sse.close()
    scheduleSseReconnect()
  }
}

function scheduleSseReconnect() {
  sseAttempts += 1
  const delay = Math.min(7000, 700 * sseAttempts)
  sseReconnectTimer = setTimeout(() => {
    connectSSE()
  }, delay)
}

function sendMessage() {
  if (!canSend.value || !ws) {
    return
  }

  const payload = {
    author: '我',
    text: userInput.value.trim(),
  }

  ws.send(JSON.stringify(payload))
  userInput.value = ''
}

function manualReconnect() {
  ws?.close()
  sse?.close()
  connectWebSocket()
  connectSSE()
}

onMounted(() => {
  connectWebSocket()
  connectSSE()
})

onBeforeUnmount(() => {
  clearTimeout(wsReconnectTimer)
  clearTimeout(sseReconnectTimer)
  ws?.close()
  sse?.close()
})
</script>

<template>
  <main class="page">
    <section class="panel">
      <header class="panel__header">
        <div>
          <p class="eyebrow">Socket + SSE</p>
          <h1>实时对话演示</h1>
          <p class="subtitle">WebSocket 负责发送，SSE 负责流式回复</p>
        </div>
        <div class="status-group">
          <span class="badge" :class="wsStatus">WS: {{ statusText(wsStatus) }}</span>
          <span class="badge" :class="sseStatus">SSE: {{ statusText(sseStatus) }}</span>
          <button type="button" class="ghost" @click="manualReconnect">
            重新连接
          </button>
        </div>
      </header>

      <div class="chat" ref="chatBody">
        <p v-if="messages.length === 0" class="placeholder">尚无消息，快来和助手聊聊吧。</p>
        <article
          v-for="message in messages"
          :key="message.id"
          class="bubble"
          :data-transport="message.transport"
          :data-streaming="message.streaming"
        >
          <header class="bubble__meta">
            <span class="author">{{ message.author }}</span>
            <span class="transport">{{ message.transport === 'sse' ? 'SSE' : 'WebSocket' }}</span>
          </header>
          <p class="bubble__text">{{ message.text }}</p>
          <small class="timestamp">
            {{ new Date(message.timestamp ?? Date.now()).toLocaleTimeString() }}
            <span v-if="message.streaming"> · 输入中…</span>
          </small>
        </article>
      </div>

      <form class="composer" @submit.prevent="sendMessage">
        <input
          v-model="userInput"
          type="text"
          autocomplete="off"
          placeholder="输入消息并回车"
          :disabled="wsStatus !== 'connected'"
        />
        <button type="submit" :disabled="!canSend">
          {{ wsStatus === 'connected' ? '发送' : '等待连接' }}
        </button>
      </form>

      <footer class="diagnostics" v-if="diagnostics.length">
        <p class="eyebrow">最新状态</p>
        <ul>
          <li v-for="entry in diagnostics" :key="entry.id">
            <span>{{ entry.timestamp }}</span>
            <span>{{ entry.message }}</span>
          </li>
        </ul>
      </footer>
    </section>
  </main>
</template>
