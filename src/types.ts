export type DeviceRole = 'camera' | 'monitor' | 'walkie';

export type DetectionMode = 'passing' | 'presence' | 'all';

export type SensitivityLevel = 'low' | 'medium' | 'high' | 'ultra';

export interface PeerInfo {
  peerId: string;
  peerName: string;
  deviceRole: DeviceRole;
  isCameraStreaming: boolean;
  watchdogArmed: boolean;
  joinedAt: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  snapshotUrl?: string;
  isSystem?: boolean;
}

export interface IncidentLog {
  id: string;
  timestamp: number;
  triggerType: 'motion' | 'presence' | 'manual';
  motionScore: number;
  snapshotUrl?: string;
  resolved: boolean;
}

export interface WatchdogSettings {
  armed: boolean;
  mode: DetectionMode;
  sensitivity: SensitivityLevel;
  alarmSoundEnabled: boolean;
  remoteAlertEnabled: boolean;
  alarmVolume: number;
  motionThreshold: number; // 5 to 40
  presenceHoldTimeMs: number; // e.g. 1500ms
  autoCaptureSnapshot: boolean;
  sirenPattern: 'police' | 'beeps' | 'sonar';
}

export interface ActiveAlarmState {
  active: boolean;
  triggerType: 'motion' | 'presence' | 'manual';
  senderId: string;
  senderName: string;
  timestamp: number;
  level: number;
  snapshot?: string;
}

export interface RoomSummary {
  id: string;
  peerCount: number;
  peers: PeerInfo[];
  alarmActive: boolean;
}
