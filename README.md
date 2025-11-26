# 实时聊天演示（WebSocket + SSE）

该项目演示如何使用 Node.js 实现 WebSocket 与 Server-Sent Events（SSE）数据通道，并在 Vue 3 前端中模拟对话聊天。

## 目录结构

- `backend/`：Node.js + Express 服务，同时提供 WebSocket 与 SSE 连接。
- `frontend/`：Vue 3 + Vite 单页应用，展示聊天界面。

## 启动方式

1. **安装依赖**

   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   ```

2. **启动后端**

   ```bash
   cd backend
   npm run start
   ```

   默认端口：`http://localhost:4000`

3. **启动前端**

   ```bash
   cd frontend
   npm run dev
   ```

   默认端口：`http://localhost:5173`

## 功能说明

- WebSocket 通道 `/chat`：负责发送用户消息并在所有在线客户端之间广播。
- SSE 通道 `/events`：负责以流式方式推送模拟助手的回复，展示逐段输出效果。
- Vue 前端展示实时对话、连接状态与最新诊断信息。

## 自定义

- 修改 `backend/src/server.js` 中的 `createBotReply` 可调整机器人回复逻辑。
- 可通过设置环境变量 `PORT`、`VITE_API_URL`、`VITE_WS_URL` 调整前后端通信地址。


