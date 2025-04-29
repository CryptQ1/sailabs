import { Server } from 'socket.io';
import { db } from './db';

export function initSocket(server) {
  const io = new Server(server, { cors: { origin: '*' } });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    let publicKey = null;

    socket.on('join', (key) => {
      publicKey = key;
      socket.join(publicKey);
      db.run(
        `UPDATE users SET lastConnected = ? WHERE publicKey = ?`,
        [Date.now(), publicKey],
        (err) => {
          if (err) console.error('Error updating lastConnected:', err);
        }
      );
    });

    socket.on('node-connect', (key) => {
      publicKey = key;
      // Sao chép logic từ server.js
    });

    socket.on('disconnect', () => {
      // Sao chép logic từ server.js
    });
  });

  return io;
}