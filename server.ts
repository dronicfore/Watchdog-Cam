import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = 3000;

interface Peer {
  ws: WebSocket;
  peerId: string;
  peerName: string;
  roomId: string;
  deviceRole: 'camera' | 'monitor' | 'walkie';
  isCameraStreaming: boolean;
  watchdogArmed: boolean;
  joinedAt: number;
}

interface Room {
  id: string;
  peers: Map<string, Peer>;
  activeAlarm: {
    active: boolean;
    triggerType: 'motion' | 'presence' | 'manual';
    senderId: string;
    senderName: string;
    timestamp: number;
    level: number;
    snapshot?: string;
  } | null;
}

const rooms = new Map<string, Room>();

function getOrCreateRoom(roomId: string): Room {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      id: roomId,
      peers: new Map(),
      activeAlarm: null,
    };
    rooms.set(roomId, room);
  }
  return room;
}

function broadcastToRoom(roomId: string, message: object, excludePeerId?: string) {
  const room = rooms.get(roomId);
  if (!room) return;
  const payload = JSON.stringify(message);

  for (const [peerId, peer] of room.peers.entries()) {
    if (excludePeerId && peerId === excludePeerId) continue;
    if (peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(payload);
    }
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // API endpoints
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      app: 'Watchdog Cam',
      time: new Date().toISOString(),
      activeRooms: rooms.size,
    });
  });

  app.get('/api/rooms', (req, res) => {
    const list = [];
    for (const [id, room] of rooms.entries()) {
      const peerSummaries = Array.from(room.peers.values()).map(p => ({
        peerId: p.peerId,
        peerName: p.peerName,
        deviceRole: p.deviceRole,
        isCameraStreaming: p.isCameraStreaming,
        watchdogArmed: p.watchdogArmed,
      }));
      list.push({
        id,
        peerCount: room.peers.size,
        peers: peerSummaries,
        alarmActive: !!room.activeAlarm?.active,
      });
    }
    res.json({ rooms: list });
  });

  const server = http.createServer(app);

  // WebSocket Server setup
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket, req) => {
    let currentPeerId: string | null = null;
    let currentRoomId: string | null = null;

    ws.on('message', (rawData) => {
      try {
        const msg = JSON.parse(rawData.toString());

        switch (msg.type) {
          case 'join-room': {
            const { roomId, peerId, peerName, deviceRole, isCameraStreaming, watchdogArmed } = msg;
            if (!roomId || !peerId) return;

            currentRoomId = roomId;
            currentPeerId = peerId;
            const room = getOrCreateRoom(roomId);

            const peer: Peer = {
              ws,
              peerId,
              peerName: peerName || `Peer-${peerId.slice(-4)}`,
              roomId,
              deviceRole: deviceRole || 'walkie',
              isCameraStreaming: !!isCameraStreaming,
              watchdogArmed: !!watchdogArmed,
              joinedAt: Date.now(),
            };

            room.peers.set(peerId, peer);

            // Send current room state back to newly joined peer
            const peerList = Array.from(room.peers.values()).map(p => ({
              peerId: p.peerId,
              peerName: p.peerName,
              deviceRole: p.deviceRole,
              isCameraStreaming: p.isCameraStreaming,
              watchdogArmed: p.watchdogArmed,
              joinedAt: p.joinedAt,
            }));

            ws.send(JSON.stringify({
              type: 'room-joined',
              roomId,
              peerId,
              peers: peerList,
              activeAlarm: room.activeAlarm,
            }));

            // Notify others
            broadcastToRoom(roomId, {
              type: 'peer-joined',
              peer: {
                peerId: peer.peerId,
                peerName: peer.peerName,
                deviceRole: peer.deviceRole,
                isCameraStreaming: peer.isCameraStreaming,
                watchdogArmed: peer.watchdogArmed,
                joinedAt: peer.joinedAt,
              }
            }, peerId);

            break;
          }

          case 'leave-room': {
            if (currentRoomId && currentPeerId) {
              const room = rooms.get(currentRoomId);
              if (room) {
                room.peers.delete(currentPeerId);
                broadcastToRoom(currentRoomId, {
                  type: 'peer-left',
                  peerId: currentPeerId,
                });
                if (room.peers.size === 0) {
                  rooms.delete(currentRoomId);
                }
              }
            }
            break;
          }

          case 'chat-message': {
            if (!msg.roomId) return;
            broadcastToRoom(msg.roomId, {
              type: 'chat-message',
              id: msg.id || `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              senderId: msg.senderId,
              senderName: msg.senderName,
              text: msg.text,
              snapshotUrl: msg.snapshotUrl,
              timestamp: msg.timestamp || Date.now(),
            });
            break;
          }

          case 'signal': {
            // WebRTC Signaling relay (offer, answer, ice-candidate)
            const { roomId, targetPeerId, signalData, senderId } = msg;
            if (!roomId || !targetPeerId) return;
            const room = rooms.get(roomId);
            if (room) {
              const targetPeer = room.peers.get(targetPeerId);
              if (targetPeer && targetPeer.ws.readyState === WebSocket.OPEN) {
                targetPeer.ws.send(JSON.stringify({
                  type: 'signal',
                  senderId,
                  signalData,
                }));
              }
            }
            break;
          }

          case 'video-frame': {
            // Low-latency frame broadcast fallback
            if (!msg.roomId) return;
            broadcastToRoom(msg.roomId, {
              type: 'video-frame',
              senderId: msg.senderId,
              senderName: msg.senderName,
              frameData: msg.frameData,
              timestamp: msg.timestamp || Date.now(),
            }, msg.senderId);
            break;
          }

          case 'walkie-audio': {
            // Push-to-talk audio chunk or voice burst
            if (!msg.roomId) return;
            broadcastToRoom(msg.roomId, {
              type: 'walkie-audio',
              senderId: msg.senderId,
              senderName: msg.senderName,
              audioData: msg.audioData,
              isStart: msg.isStart,
              isEnd: msg.isEnd,
              timestamp: msg.timestamp || Date.now(),
            }, msg.senderId);
            break;
          }

          case 'alarm-trigger': {
            if (!msg.roomId) return;
            const room = getOrCreateRoom(msg.roomId);
            room.activeAlarm = {
              active: true,
              triggerType: msg.triggerType || 'motion',
              senderId: msg.senderId,
              senderName: msg.senderName,
              timestamp: Date.now(),
              level: msg.level || 80,
              snapshot: msg.snapshot,
            };

            broadcastToRoom(msg.roomId, {
              type: 'alarm-trigger',
              alarm: room.activeAlarm,
            });
            break;
          }

          case 'alarm-dismiss': {
            if (!msg.roomId) return;
            const room = rooms.get(msg.roomId);
            if (room) {
              room.activeAlarm = null;
              broadcastToRoom(msg.roomId, {
                type: 'alarm-dismiss',
                senderId: msg.senderId,
                senderName: msg.senderName,
                timestamp: Date.now(),
              });
            }
            break;
          }

          case 'camera-status': {
            if (!msg.roomId || !msg.senderId) return;
            const room = rooms.get(msg.roomId);
            if (room) {
              const peer = room.peers.get(msg.senderId);
              if (peer) {
                if (typeof msg.isStreaming === 'boolean') peer.isCameraStreaming = msg.isStreaming;
                if (typeof msg.watchdogArmed === 'boolean') peer.watchdogArmed = msg.watchdogArmed;
                if (msg.deviceRole) peer.deviceRole = msg.deviceRole;
              }
              broadcastToRoom(msg.roomId, {
                type: 'camera-status',
                peerId: msg.senderId,
                isStreaming: msg.isStreaming,
                watchdogArmed: msg.watchdogArmed,
                deviceRole: msg.deviceRole,
              });
            }
            break;
          }

          case 'ping': {
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            break;
          }

          default:
            break;
        }
      } catch (err) {
        console.error('Failed to parse WS message:', err);
      }
    });

    ws.on('close', () => {
      if (currentRoomId && currentPeerId) {
        const room = rooms.get(currentRoomId);
        if (room) {
          room.peers.delete(currentPeerId);
          broadcastToRoom(currentRoomId, {
            type: 'peer-left',
            peerId: currentPeerId,
          });
          if (room.peers.size === 0) {
            rooms.delete(currentRoomId);
          }
        }
      }
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Watchdog Cam server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
