const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 4000;
const BOT_NAME = '智能助手';

const app = express();
app.use(cors());
app.use(express.json());

const sseClients = new Map();
let sseClientId = 0;

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/chat' });

// 健康检查接口
app.get('/health', (_, res) => {
  res.json({ status: 'ok', transport: ['websocket', 'sse'] });
});

// SSE 事件流接口
app.get('/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const clientId = ++sseClientId;
  sseClients.set(clientId, res);

  res.write(`event: system\n`);
  res.write(`data: ${JSON.stringify({ message: 'SSE connected', clientId })}\n\n`);

  req.on('close', () => {
    sseClients.delete(clientId);
  });
});

function broadcastWebSocket(payload) {
  const message = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function broadcastSSE(eventName, payload) {
  const serialized = JSON.stringify(payload);
  sseClients.forEach((res) => {
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${serialized}\n\n`);
  });
}

function createBotReply(userText = '') {
  const fallbacks = [
    '我已经收到你的消息，正在处理中。',
    '这是一个模拟回复，展示 SSE 流式输出的效果。',
    '你可以继续输入内容，我会一直保持在线。',
  ];

  if (!userText) {
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  const trimmed = userText.trim();
  return `你刚才说的是「${trimmed}」，我会根据这个内容继续和你交流。这个示例演示了 Server-Sent Events 如何逐段推送数据。`;
}

function streamBotReply(sourceMessage) {
  const reply = createBotReply(sourceMessage);
  const words = reply.split(' ');
  const messageId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const chunks = [];
  for (let i = 0; i < words.length; i += 4) {
    chunks.push(words.slice(i, i + 4).join(' '));
  }

  if (chunks.length === 0) {
    chunks.push(reply);
  }

  chunks.forEach((chunk, index) => {
    setTimeout(() => {
      broadcastSSE('bot-chunk', {
        messageId,
        author: BOT_NAME,
        chunk,
        isFinal: index === chunks.length - 1,
        timestamp: Date.now(),
      });
    }, 600 * (index + 1));
  });
}

wss.on('connection', (socket) => {
  socket.send(JSON.stringify({ type: 'system', text: 'WebSocket connected' }));

  socket.on('message', (raw) => {
    try {
      const parsed = JSON.parse(raw.toString());
      const text = (parsed.text || '').trim();
      if (!text) {
        return;
      }

      const chatPayload = {
        type: 'chat',
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        author: parsed.author || '访客',
        text,
        timestamp: Date.now(),
      };

      broadcastWebSocket(chatPayload);
      streamBotReply(text);
    } catch (error) {
      socket.send(
        JSON.stringify({
          type: 'error',
          message: '消息格式不正确，必须是 JSON，例如 { "text": "你好" }',
        }),
      );
    }
  });

  socket.on('close', () => {
    socket.terminate();
  });
});

setInterval(() => {
  broadcastSSE('heartbeat', { timestamp: Date.now() });
}, 25_000);

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Realtime server ready on http://localhost:${PORT}`);
});

