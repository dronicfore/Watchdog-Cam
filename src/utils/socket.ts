import { PeerInfo, ChatMessage, ActiveAlarmState, DeviceRole } from '../types';

export type SocketListener<T = unknown> = (data: T) => void;

export class SocketManager {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Set<SocketListener>> = new Map();
  private isReconnecting = false;
  private reconnectAttempts = 0;
  private currentRoomId = '';
  private currentPeerId = '';
  private currentPeerName = '';
  private currentRole: DeviceRole = 'walkie';
  private pingInterval: number | null = null;

  constructor() {
    // Generate persistent peerId for this browser session
    this.currentPeerId = `peer_${Math.random().toString(36).substring(2, 9)}`;
    const storedName = localStorage.getItem('watchdog_peer_name');
    this.currentPeerName = storedName || `CamUser_${this.currentPeerId.slice(-4)}`;
  }

  public getPeerId(): string {
    return this.currentPeerId;
  }

  public getPeerName(): string {
    return this.currentPeerName;
  }

  public setPeerName(name: string) {
    this.currentPeerName = name.trim() || `CamUser_${this.currentPeerId.slice(-4)}`;
    localStorage.setItem('watchdog_peer_name', this.currentPeerName);
  }

  public connect(roomId: string, role: DeviceRole = 'walkie', isStreaming = false, armed = false) {
    this.currentRoomId = roomId;
    this.currentRole = role;

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      // Already connecting or connected, just rejoin
      this.send({
        type: 'join-room',
        roomId: this.currentRoomId,
        peerId: this.currentPeerId,
        peerName: this.currentPeerName,
        deviceRole: this.currentRole,
        isCameraStreaming: isStreaming,
        watchdogArmed: armed,
      });
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.isReconnecting = false;
        this.emit('connection-status', { status: 'connected' });

        // Join room immediately
        this.send({
          type: 'join-room',
          roomId: this.currentRoomId,
          peerId: this.currentPeerId,
          peerName: this.currentPeerName,
          deviceRole: this.currentRole,
          isCameraStreaming: isStreaming,
          watchdogArmed: armed,
        });

        // Keep-alive heartbeat
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = window.setInterval(() => {
          this.send({ type: 'ping' });
        }, 15000);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.emit(msg.type, msg);
        } catch (e) {
          console.error('WS Parse Error:', e);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('WS error:', err);
        this.emit('connection-status', { status: 'error' });
      };

      this.ws.onclose = () => {
        this.emit('connection-status', { status: 'disconnected' });
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.scheduleReconnect(isStreaming, armed);
      };
    } catch (e) {
      console.error('WS connect failed:', e);
    }
  }

  private scheduleReconnect(isStreaming: boolean, armed: boolean) {
    if (this.isReconnecting || !this.currentRoomId) return;
    this.isReconnecting = true;
    const timeout = Math.min(6000, 1000 * Math.pow(1.5, this.reconnectAttempts++));
    setTimeout(() => {
      if (this.currentRoomId) {
        this.connect(this.currentRoomId, this.currentRole, isStreaming, armed);
      }
    }, timeout);
  }

  public disconnect() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.ws) {
      this.send({ type: 'leave-room' });
      this.ws.close();
      this.ws = null;
    }
    this.currentRoomId = '';
  }

  public send(data: Record<string, unknown>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  public sendChat(text: string, snapshotUrl?: string) {
    this.send({
      type: 'chat-message',
      roomId: this.currentRoomId,
      senderId: this.currentPeerId,
      senderName: this.currentPeerName,
      text,
      snapshotUrl,
      timestamp: Date.now(),
    });
  }

  public sendWalkieAudio(audioData: string, isStart = false, isEnd = false) {
    this.send({
      type: 'walkie-audio',
      roomId: this.currentRoomId,
      senderId: this.currentPeerId,
      senderName: this.currentPeerName,
      audioData,
      isStart,
      isEnd,
      timestamp: Date.now(),
    });
  }

  public sendVideoFrame(frameData: string) {
    this.send({
      type: 'video-frame',
      roomId: this.currentRoomId,
      senderId: this.currentPeerId,
      senderName: this.currentPeerName,
      frameData,
      timestamp: Date.now(),
    });
  }

  public triggerAlarm(triggerType: 'motion' | 'presence' | 'manual', level = 85, snapshot?: string) {
    this.send({
      type: 'alarm-trigger',
      roomId: this.currentRoomId,
      senderId: this.currentPeerId,
      senderName: this.currentPeerName,
      triggerType,
      level,
      snapshot,
    });
  }

  public dismissAlarm() {
    this.send({
      type: 'alarm-dismiss',
      roomId: this.currentRoomId,
      senderId: this.currentPeerId,
      senderName: this.currentPeerName,
    });
  }

  public updateCameraStatus(isStreaming: boolean, watchdogArmed: boolean, role?: DeviceRole) {
    this.send({
      type: 'camera-status',
      roomId: this.currentRoomId,
      senderId: this.currentPeerId,
      isStreaming,
      watchdogArmed,
      deviceRole: role,
    });
  }

  public on<T = unknown>(event: string, callback: SocketListener<T>) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as SocketListener);
    return () => {
      this.off(event, callback);
    };
  }

  public off<T = unknown>(event: string, callback: SocketListener<T>) {
    const list = this.listeners.get(event);
    if (list) {
      list.delete(callback as SocketListener);
    }
  }

  private emit(event: string, data: unknown) {
    const list = this.listeners.get(event);
    if (list) {
      list.forEach((cb) => {
        try {
          cb(data);
        } catch (e) {
          console.error(`Error in listener for ${event}:`, e);
        }
      });
    }
  }
}

export const socketManager = new SocketManager();
