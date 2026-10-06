import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Shield,
  ShieldAlert,
  Camera,
  Radio,
  MessageSquare,
  History,
  Wifi,
  Sliders,
  Bell,
  Activity,
  Users,
  Eye,
  AlertTriangle,
} from 'lucide-react';
import { CameraStream } from './components/CameraStream';
import { WalkieTalkie } from './components/WalkieTalkie';
import { ChatPanel } from './components/ChatPanel';
import { AlarmModal } from './components/AlarmModal';
import { NetworkManager } from './components/NetworkManager';
import { IncidentsLog } from './components/IncidentsLog';
import { SettingsPanel } from './components/SettingsPanel';
import { socketManager } from './utils/socket';
import { soundEngine } from './utils/audio';
import {
  DeviceRole,
  PeerInfo,
  ChatMessage,
  IncidentLog,
  WatchdogSettings,
  ActiveAlarmState,
} from './types';

type ActiveTab = 'cam' | 'walkie' | 'chat' | 'incidents' | 'network' | 'settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('cam');
  const [roomId, setRoomId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('room') || 'WATCHDOG-01';
  });

  const [deviceRole, setDeviceRole] = useState<DeviceRole>('camera');
  const [peerName, setPeerName] = useState<string>(socketManager.getPeerName());
  const [connectedPeers, setConnectedPeers] = useState<PeerInfo[]>([]);
  const [isCameraStreaming, setIsCameraStreaming] = useState<boolean>(false);

  const [remoteVideoFrame, setRemoteVideoFrame] = useState<string | null>(null);
  const [remotePeerName, setRemotePeerName] = useState<string | null>(null);

  const [incomingSpeaker, setIncomingSpeaker] = useState<string | null>(null);
  const [isReceivingAudio, setIsReceivingAudio] = useState(false);
  const audioClearTimerRef = useRef<number | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [incidents, setIncidents] = useState<IncidentLog[]>(() => {
    try {
      const saved = localStorage.getItem('watchdog_incidents');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [activeAlarm, setActiveAlarm] = useState<ActiveAlarmState | null>(null);

  const [settings, setSettings] = useState<WatchdogSettings>({
    armed: false,
    mode: 'all',
    sensitivity: 'medium',
    alarmSoundEnabled: true,
    remoteAlertEnabled: true,
    alarmVolume: 0.85,
    motionThreshold: 20,
    presenceHoldTimeMs: 1500,
    autoCaptureSnapshot: true,
    sirenPattern: 'police',
  });

  const updateSettings = useCallback((newSettings: Partial<WatchdogSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  }, []);

  const addIncident = useCallback((incident: IncidentLog) => {
    setIncidents((prev) => {
      const updated = [incident, ...prev].slice(0, 50);
      try {
        localStorage.setItem('watchdog_incidents', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  // Connect to room via WebSocket
  useEffect(() => {
    socketManager.connect(roomId, deviceRole, isCameraStreaming, settings.armed);

    const unsubRoomJoined = socketManager.on<{
      roomId: string;
      peerId: string;
      peers: PeerInfo[];
      activeAlarm: ActiveAlarmState | null;
    }>('room-joined', (data) => {
      const others = data.peers.filter((p) => p.peerId !== socketManager.getPeerId());
      setConnectedPeers(others);
      if (data.activeAlarm && data.activeAlarm.active) {
        setActiveAlarm(data.activeAlarm);
        if (settings.alarmSoundEnabled) {
          soundEngine.startAlarmSiren(settings.alarmVolume, settings.sirenPattern);
        }
      }
    });

    const unsubPeerJoined = socketManager.on<{ peer: PeerInfo }>('peer-joined', (data) => {
      setConnectedPeers((prev) => {
        if (prev.some((p) => p.peerId === data.peer.peerId)) return prev;
        return [...prev, data.peer];
      });
      soundEngine.playAlertPing();
    });

    const unsubPeerLeft = socketManager.on<{ peerId: string }>('peer-left', (data) => {
      setConnectedPeers((prev) => prev.filter((p) => p.peerId !== data.peerId));
    });

    const unsubChatMessage = socketManager.on<ChatMessage>('chat-message', (data) => {
      setChatMessages((prev) => [...prev, data]);
      if (data.senderId !== socketManager.getPeerId()) {
        soundEngine.playAlertPing();
      }
    });

    const unsubVideoFrame = socketManager.on<{
      senderId: string;
      senderName: string;
      frameData: string;
    }>('video-frame', (data) => {
      setRemoteVideoFrame(data.frameData);
      setRemotePeerName(data.senderName);
    });

    const unsubWalkieAudio = socketManager.on<{
      senderId: string;
      senderName: string;
      audioData: string;
      isStart?: boolean;
      isEnd?: boolean;
    }>('walkie-audio', (data) => {
      if (data.senderId === socketManager.getPeerId()) return;

      if (data.isStart) {
        setIncomingSpeaker(data.senderName);
        setIsReceivingAudio(true);
        soundEngine.playWalkieChirp();
      } else if (data.isEnd) {
        setIsReceivingAudio(false);
        soundEngine.playRogerBeep();
      } else if (data.audioData) {
        setIncomingSpeaker(data.senderName);
        setIsReceivingAudio(true);
        try {
          const sound = new Audio(data.audioData);
          sound.volume = settings.alarmVolume;
          sound.play().catch(() => {});
        } catch {}

        if (audioClearTimerRef.current) clearTimeout(audioClearTimerRef.current);
        audioClearTimerRef.current = window.setTimeout(() => {
          setIsReceivingAudio(false);
        }, 1200);
      }
    });

    const unsubAlarmTrigger = socketManager.on<{ alarm: ActiveAlarmState }>('alarm-trigger', (data) => {
      setActiveAlarm(data.alarm);
      if (settings.alarmSoundEnabled) {
        soundEngine.startAlarmSiren(settings.alarmVolume, settings.sirenPattern);
      }

      // Add to incident log
      addIncident({
        id: `inc_${data.alarm.timestamp}`,
        timestamp: data.alarm.timestamp,
        triggerType: data.alarm.triggerType,
        motionScore: data.alarm.level,
        snapshotUrl: data.alarm.snapshot,
        resolved: false,
      });
    });

    const unsubAlarmDismiss = socketManager.on<{ senderName: string }>('alarm-dismiss', () => {
      setActiveAlarm(null);
      soundEngine.stopAlarmSiren();
    });

    const unsubCameraStatus = socketManager.on<{
      peerId: string;
      isStreaming?: boolean;
      watchdogArmed?: boolean;
      deviceRole?: DeviceRole;
    }>('camera-status', (data) => {
      setConnectedPeers((prev) =>
        prev.map((p) => {
          if (p.peerId === data.peerId) {
            return {
              ...p,
              isCameraStreaming: data.isStreaming ?? p.isCameraStreaming,
              watchdogArmed: data.watchdogArmed ?? p.watchdogArmed,
              deviceRole: data.deviceRole ?? p.deviceRole,
            };
          }
          return p;
        })
      );
    });

    return () => {
      unsubRoomJoined();
      unsubPeerJoined();
      unsubPeerLeft();
      unsubChatMessage();
      unsubVideoFrame();
      unsubWalkieAudio();
      unsubAlarmTrigger();
      unsubAlarmDismiss();
      unsubCameraStatus();
    };
  }, [roomId, deviceRole, addIncident, settings.alarmSoundEnabled, settings.alarmVolume, settings.sirenPattern]);

  const handleJoinRoom = (newRoomId: string) => {
    setRoomId(newRoomId);
    socketManager.connect(newRoomId, deviceRole, isCameraStreaming, settings.armed);
    const url = new URL(window.location.href);
    url.searchParams.set('room', newRoomId);
    window.history.replaceState({}, '', url.toString());
  };

  const handleChangeRole = (role: DeviceRole) => {
    setDeviceRole(role);
    socketManager.updateCameraStatus(isCameraStreaming, settings.armed, role);
  };

  const handleChangePeerName = (name: string) => {
    setPeerName(name);
    socketManager.setPeerName(name);
  };

  const handleTriggerAlarm = (type: 'motion' | 'presence' | 'manual', snapshot?: string) => {
    socketManager.triggerAlarm(type, 85, snapshot);
  };

  const handleDismissAlarm = () => {
    socketManager.dismissAlarm();
    setActiveAlarm(null);
    soundEngine.stopAlarmSiren();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-red-500/30 selection:text-red-200">
      {/* Top Tactical Navigation Header */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between">
          {/* Brand & Mode */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-amber-600 p-0.5 shadow-lg shadow-red-950/50 flex items-center justify-center">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <ShieldAlert className="w-5 h-5 text-red-500" />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-black text-sm tracking-wider uppercase text-white">
                  WATCHDOG CAM
                </span>
                <span className="hidden sm:inline px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 border border-emerald-700/60 text-emerald-400">
                  WALKIETOOTH READY
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                CH: <span className="text-slate-200 font-semibold">{roomId}</span> • ROLE:{' '}
                <span className="text-slate-200 font-semibold uppercase">{deviceRole}</span>
              </p>
            </div>
          </div>

          {/* Header Action Badges */}
          <div className="flex items-center gap-2">
            {/* Alarm Quick Status Indicator */}
            {activeAlarm && (
              <button
                id="header-active-alarm-badge"
                onClick={handleDismissAlarm}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-mono text-xs font-bold animate-pulse shadow-lg shadow-red-600/40 cursor-pointer"
              >
                <Bell className="w-3.5 h-3.5" />
                <span>ALARM ACTIVE</span>
              </button>
            )}

            {/* Connected Peers Counter */}
            <button
              id="header-peers-counter-btn"
              onClick={() => setActiveTab('network')}
              title="Connected devices in room"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-mono cursor-pointer transition-all"
            >
              <Users className="w-3.5 h-3.5 text-blue-400" />
              <span>{connectedPeers.length + 1} ONLINE</span>
            </button>
          </div>
        </div>

        {/* Tactical Tab Navigation Bar */}
        <div className="max-w-6xl mx-auto px-3 sm:px-6 flex items-center gap-1 overflow-x-auto no-scrollbar border-t border-slate-800/60 pt-1 pb-1.5">
          <button
            id="tab-camera-btn"
            onClick={() => setActiveTab('cam')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'cam'
                ? 'bg-red-950/90 text-red-300 border border-red-700/60 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Sentry Cam</span>
          </button>

          <button
            id="tab-walkie-btn"
            onClick={() => setActiveTab('walkie')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'walkie'
                ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-700/60 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Walkie PTT</span>
            {isReceivingAudio && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
            )}
          </button>

          <button
            id="tab-chat-btn"
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'chat'
                ? 'bg-blue-950/90 text-blue-300 border border-blue-700/60 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chat ({chatMessages.length})</span>
          </button>

          <button
            id="tab-incidents-btn"
            onClick={() => setActiveTab('incidents')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'incidents'
                ? 'bg-amber-950/90 text-amber-300 border border-amber-700/60 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Incident Log ({incidents.length})</span>
          </button>

          <button
            id="tab-network-btn"
            onClick={() => setActiveTab('network')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'network'
                ? 'bg-purple-950/90 text-purple-300 border border-purple-700/60 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Wifi className="w-3.5 h-3.5" />
            <span>WiFi / Hotspot / BT</span>
          </button>

          <button
            id="tab-settings-btn"
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-slate-800 text-slate-100 border border-slate-600 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Alarm Settings</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-3 sm:p-6 flex flex-col gap-6">
        {/* View 1: Sentry Camera Feed */}
        {activeTab === 'cam' && (
          <div className="flex flex-col gap-6">
            <CameraStream
              role={deviceRole}
              isStreaming={isCameraStreaming}
              settings={settings}
              onToggleStreaming={setIsCameraStreaming}
              onUpdateSettings={updateSettings}
              onAddIncident={addIncident}
              onTriggerAlarm={handleTriggerAlarm}
              activeAlarm={!!activeAlarm?.active}
              remoteVideoFrame={remoteVideoFrame}
              remotePeerName={remotePeerName}
            />

            {/* Quick Walkie & Intercom Dock under Camera */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <WalkieTalkie
                roomId={roomId}
                peerName={peerName}
                incomingSpeaker={incomingSpeaker}
                isReceivingAudio={isReceivingAudio}
              />
              <ChatPanel
                messages={chatMessages}
                currentPeerId={socketManager.getPeerId()}
              />
            </div>
          </div>
        )}

        {/* View 2: Walkie-Talkie Intercom Only */}
        {activeTab === 'walkie' && (
          <div className="max-w-xl mx-auto w-full flex flex-col gap-4">
            <WalkieTalkie
              roomId={roomId}
              peerName={peerName}
              incomingSpeaker={incomingSpeaker}
              isReceivingAudio={isReceivingAudio}
            />
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400 leading-relaxed">
              <p className="font-semibold text-slate-200 mb-1">Walkietooth Push-To-Talk Guide:</p>
              Hold the large button above (or press and hold Spacebar) to talk directly to all devices in channel <span className="text-emerald-400 font-mono">{roomId}</span>. Audio transmits with realistic radio squelch and roger-beeps.
            </div>
          </div>
        )}

        {/* View 3: Chat */}
        {activeTab === 'chat' && (
          <div className="max-w-2xl mx-auto w-full">
            <ChatPanel
              messages={chatMessages}
              currentPeerId={socketManager.getPeerId()}
            />
          </div>
        )}

        {/* View 4: Incident Log */}
        {activeTab === 'incidents' && (
          <IncidentsLog
            incidents={incidents}
            onClearIncidents={() => {
              setIncidents([]);
              localStorage.removeItem('watchdog_incidents');
            }}
          />
        )}

        {/* View 5: Network, WiFi, Hotspot, Bluetooth */}
        {activeTab === 'network' && (
          <NetworkManager
            currentRoomId={roomId}
            onJoinRoom={handleJoinRoom}
            deviceRole={deviceRole}
            onChangeRole={handleChangeRole}
            peerName={peerName}
            onChangePeerName={handleChangePeerName}
            connectedPeers={connectedPeers}
          />
        )}

        {/* View 6: Alarm Settings */}
        {activeTab === 'settings' && (
          <div className="max-w-2xl mx-auto w-full">
            <SettingsPanel
              settings={settings}
              onUpdateSettings={updateSettings}
            />
          </div>
        )}
      </main>

      {/* Fullscreen Emergency Alarm Siren Modal */}
      <AlarmModal
        alarm={activeAlarm}
        onDismiss={handleDismissAlarm}
      />
    </div>
  );
}
