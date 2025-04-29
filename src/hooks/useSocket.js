import { useEffect, useState } from 'react';
import io from 'socket.io-client';

export default function useSocket() {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const socketIo = io(process.env.API_BASE_URL, { reconnectionAttempts: 5 });
    setSocket(socketIo);

    socketIo.on('connect', () => console.log('Socket connected'));
    socketIo.on('connect_error', (error) => console.error('Socket error:', error));

    return () => socketIo.disconnect();
  }, []);

  return { socket };
}