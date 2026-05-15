const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const http = createServer(app);
const io = new Server(http, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.get('/', (_, res) => res.send('Quoridor server running'));

const rooms = new Map(); // code -> { p1, p2, createdAt }

function genCode() {
  const ch = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 6; i++) c += ch[Math.floor(Math.random() * ch.length)];
  return c;
}

// Clean up rooms older than 2 hours
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [code, room] of rooms)
    if (room.createdAt < cutoff) rooms.delete(code);
}, 30 * 60 * 1000);

io.on('connection', (socket) => {

  socket.on('create-room', () => {
    let code;
    do { code = genCode(); } while (rooms.has(code));
    rooms.set(code, { p1: socket, p2: null, createdAt: Date.now() });
    socket.roomCode = code;
    socket.playerNum = 1;
    socket.emit('room-created', { code });
    console.log(`Room created: ${code}`);
  });

  socket.on('join-room', ({ code }) => {
    const key = (code || '').toUpperCase();
    const room = rooms.get(key);
    if (!room)      return socket.emit('join-error', { msg: 'Room not found. Check the code.' });
    if (room.p2)    return socket.emit('join-error', { msg: 'Room is already full.' });

    room.p2 = socket;
    socket.roomCode = key;
    socket.playerNum = 2;

    socket.emit('game-start', { playerNum: 2 });
    room.p1.emit('game-start', { playerNum: 1 });
    console.log(`Game started in room: ${key}`);
  });

  // Relay a move/wall action to the opponent
  socket.on('action', (data) => {
    const room = rooms.get(socket.roomCode);
    if (!room) return;
    const opp = socket.playerNum === 1 ? room.p2 : room.p1;
    if (opp) opp.emit('action', data);
  });

  socket.on('disconnect', () => {
    const room = socket.roomCode ? rooms.get(socket.roomCode) : null;
    if (!room) return;
    const opp = socket.playerNum === 1 ? room.p2 : room.p1;
    if (opp) opp.emit('opponent-disconnected');
    rooms.delete(socket.roomCode);
    console.log(`Room closed: ${socket.roomCode}`);
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Quoridor server on :${PORT}`));
