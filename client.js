// client.js
const { io } = require('socket.io-client');

if (!process.argv[2] || !process.argv[3]) {
  console.log('Usage: node client.js <userId> <username>');
  process.exit(1);
}

const userId = process.argv[2];
const username = process.argv[3];
const socket = io('http://localhost:4000', {
  query: { userId, username }
});

const conversationId = '1'; // demo single conversation

socket.on('connect', () => {
  console.log(username, 'connected', socket.id);
  socket.emit('join_conversation', { conversationId });
});

socket.on('users_list', (list) => {
  console.log('> users_list', list);
});

socket.on('user_online', (u) => console.log('> user_online', u));
socket.on('user_offline', (u) => console.log('> user_offline', u));

socket.on('typing', (p) => console.log('> typing', p.username));
socket.on('stop_typing', (p) => console.log('> stop_typing', p.username));

socket.on('message_received', (msg) => {
  console.log(`\n${msg.senderId === userId ? 'You' : msg.senderId}: ${msg.text} (id:${msg.id})`);
  // auto-ack delivered (simulates client sending delivered ack)
  socket.emit('message_delivered', { messageId: msg.id });
});

socket.on('message_delivered', (p) => console.log('> message_delivered', p));
socket.on('message_seen', (p) => console.log('> message_seen', p));

const stdin = process.openStdin();
console.log('Type message and press enter. Type /typing to toggle typing, /seen <id> to mark seen.');

stdin.addListener('data', function(d) {
  const text = d.toString().trim();
  if (text === '/typing') {
    socket.emit('typing', { conversationId });
    return;
  }
  if (text === '/stop') {
    socket.emit('stop_typing', { conversationId });
    return;
  }
  if (text.startsWith('/seen ')) {
    const id = text.split(' ')[1];
    socket.emit('message_seen', { messageId: Number(id) });
    return;
  }
  // send message
  const tempId = Math.floor(Math.random()*1000000);
  socket.emit('send_message', { conversationId, text, tempId }, (ack) => {
    if (ack && ack.ok) {
      console.log('sent ack from server:', ack.message.id);
    } else {
      console.log('send failed', ack);
    }
  });
});
