// Single WebSocket endpoint; clients subscribe to named channels.
import { subscribe, unsubscribe, unsubscribeAll } from './hub.js';

const CHANNEL = /^(status|processes|metrics|events|jobs|logs:(all|\d+)|job:[\w-]+)$/;

export default async function wsRoutes(app) {
  app.get('/ws', { websocket: true }, (socket) => {
    socket.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (typeof msg?.ch !== 'string' || !CHANNEL.test(msg.ch)) return;
      if (msg.type === 'sub') subscribe(socket, msg.ch);
      else if (msg.type === 'unsub') unsubscribe(socket, msg.ch);
    });
    socket.on('close', () => unsubscribeAll(socket));
  });
}
