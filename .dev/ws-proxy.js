const { WebSocketServer } = require('ws');
const net = require('net');

const WS_PORT = parseInt(process.env.WS_PROXY_PORT || '80');
const PG_HOST = process.env.PG_HOST || 'localhost';
const PG_PORT = parseInt(process.env.PG_PORT || '5432');

const wss = new WebSocketServer({ port: WS_PORT });

wss.on('connection', (ws, req) => {
  const socket = net.createConnection({ host: PG_HOST, port: PG_PORT }, () => {
    // Connection established
  });

  socket.on('data', (data) => {
    if (ws.readyState === 1) ws.send(data);
  });

  ws.on('message', (data) => {
    socket.write(data);
  });

  socket.on('end', () => ws.close());
  socket.on('error', () => ws.close());
  ws.on('close', () => socket.destroy());
  ws.on('error', () => socket.destroy());
});

console.log(`WS-to-TCP proxy: ws://localhost:${WS_PORT} -> ${PG_HOST}:${PG_PORT}`);
