// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = 4000;

// In-memory (demo) stores
const users = new Map(); // userId -> { username, sockets: Set }
const rooms = new Map(); // roomId -> Set(userId)

// Helper
function broadcastUserList() {
  const list = Array.from(users.values()).map(u => ({ username: u.username }));
  io.emit('users_list', list);
}

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  // handshake: { userId, username }
  const { userId, username } = socket.handshake.query;
  if (!userId || !username) {
    socket.disconnect();
    return;
  }

  // register user
  if (!users.has(userId)) users.set(userId, { username, sockets: new Set() });
  users.get(userId).sockets.add(socket.id);
  io.emit('user_online', { userId, username });
  broadcastUserList();

  // join room (client will emit)
  socket.on('join_conversation', ({ conversationId }) => {
    const room = `conv_${conversationId}`;
    socket.join(room);
    if (!rooms.has(room)) rooms.set(room, new Set());
    rooms.get(room).add(userId);
    console.log(`${username} joined ${room}`);
  });

  // typing
  socket.on('typing', ({ conversationId }) => {
    socket.to(`conv_${conversationId}`).emit('typing', { conversationId, userId, username });
  });
  socket.on('stop_typing', ({ conversationId }) => {
    socket.to(`conv_${conversationId}`).emit('stop_typing', { conversationId, userId, username });
  });

  // send_message
  // payload { conversationId, text, tempId }
  socket.on('send_message', (payload, ack) => {
    const { conversationId, text, tempId } = payload || {};
    if (!conversationId || !text) return ack && ack({ error: 'invalid' });

    // fake DB id and created_at
    const messageId = Date.now() + Math.floor(Math.random()*1000);
    const created_at = new Date().toISOString();

    const message = {
      id: messageId,
      conversationId,
      senderId: userId,
      text,
      created_at,
      tempId // client-side id so client can match ack
    };

    // broadcast to room
    io.to(`conv_${conversationId}`).emit('message_received', message);

    // respond ack to sender that server saved (sent)
    ack && ack({ ok: true, message });

    // (in real app: create message_status rows here)
  });

  // delivered ack (clients should emit when they receive message_received)
  socket.on('message_delivered', ({ messageId, forUserId }) => {
    // notify original sender's sockets that message delivered
    // for demo we just broadcast delivered notification
    io.emit('message_delivered', { messageId, deliveredTo: userId });
  });

  // seen ack
  socket.on('message_seen', ({ messageId }) => {
    io.emit('message_seen', { messageId, seenBy: userId });
  });

  socket.on('disconnect', () => {
    console.log('socket disconnected', socket.id);
    // remove socket from user's set
    const u = users.get(userId);
    if (u) {
      u.sockets.delete(socket.id);
      if (u.sockets.size === 0) {
        users.delete(userId);
        io.emit('user_offline', { userId, username });
      }
    }
    broadcastUserList();
  });
});

app.get('/', (req, res) => res.send('Chat demo server running'));
server.listen(PORT, () => console.log(`Server listening ${PORT}`));
