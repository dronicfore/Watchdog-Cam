import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera,
  CameraOff,
  SwitchCamera,
  Flashlight,
  Shield,
  ShieldAlert,
  Bell,
  Maximize2,
  Minimize2,
  Radio,
  Eye,
  Activity,
  AlertTriangle,
  Zap,
} from 'lucide-react';
import { VisionDetector, MotionResult } from '../utils/vision';
import { soundEngine } from '../utils/audio';
import { socketManager } from '../utils/socket';
import { WatchdogSettings, DeviceRole, IncidentLog } from '../types';

interface CameraStreamProps {
  role: DeviceRole;
  isStreaming: boolean;
  settings: WatchdogSettings;
  onToggleStreaming: (streaming: boolean) => void;
  onUpdateSettings: (settings: Partial<WatchdogSettings>) => void;
  onAddIncident: (incident: IncidentLog) => void;
  onTriggerAlarm: (type: 'motion' | 'presence' | 'manual', snapshot?: string) => void;
  activeAlarm: boolean;
  remoteVideoFrame: string | null;
  remotePeerName: string | null;
}

export const CameraStream: React.FC<CameraStreamProps> = ({
  role,
  isStreaming,
  settings,
  onToggleStreaming,
  onUpdateSettings,
  onAddIncident,
  onTriggerAlarm,
  activeAlarm,
  remoteVideoFrame,
  remotePeerName,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasOverlayRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const visionRef = useRef<VisionDetector>(new VisionDetector());

  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [torchActive, setTorchActive] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [motionData, setMotionData] = useState<MotionResult>({
    motionScore: 0,
    presenceScore: 0,
    hasMotion: false,
    hasPresence: false,
    boundingBox: null,
  });
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [streamFps, setStreamFps] = useState(0);
  const [armingCountdown, setArmingCountdown] = useState<number | null>(null);

  // Broadcast frame throttle
  const lastBroadcastRef = useRef<number>(0);
  const lastAlarmTriggerRef = useRef<number>(0);

  // Start local camera stream
  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false, // Walkie-talkie handles audio separately
      });

      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }

      // Check torch support
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const capabilities = videoTrack.getCapabilities?.() as { torch?: boolean };
        setTorchSupported(!!capabilities?.torch);
      }

      onToggleStreaming(true);
      socketManager.updateCameraStatus(true, settings.armed, role);
    } catch (err: unknown) {
      console.error('Camera access failed:', err);
      const errMsg = err instanceof Error ? err.message : 'Permission denied or no camera device found';
      setCameraError(errMsg);
      onToggleStreaming(false);
    }
  }, [facingMode, onToggleStreaming, settings.armed, role]);

  const stopCamera = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setTorchActive(false);
    onToggleStreaming(false);
    socketManager.updateCameraStatus(false, settings.armed, role);
  }, [onToggleStreaming, settings.armed, role]);

  // Handle Torch / Flashlight
  const toggleTorch = async () => {
    if (!mediaStreamRef.current) return;
    const track = mediaStreamRef.current.getVideoTracks()[0];
    if (track && torchSupported) {
      try {
        const nextState = !torchActive;
        await (track as unknown as { applyConstraints: (c: unknown) => Promise<void> }).applyConstraints({
          advanced: [{ torch: nextState }],
        });
        setTorchActive(nextState);
      } catch (e) {
        console.warn('Torch toggle failed', e);
      }
    }
  };

  // Flip camera (front / rear)
  const flipCamera = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  useEffect(() => {
    if (isStreaming) {
      startCamera();
    }
    return () => {
      stopCamera();
    };
  }, [facingMode]);

  // Fullscreen helper
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Vision detection loop
  useEffect(() => {
    let animationId: number;
    let frameCount = 0;
    let lastFpsUpdate = Date.now();

    const loop = () => {
      const video = videoRef.current;
      if (video && isStreaming && video.readyState >= 2) {
        // Frame analysis
        const threshold = settings.motionThreshold;
        const result = visionRef.current.analyzeFrame(video, threshold, 4);
        setMotionData(result);

        frameCount++;
        const now = Date.now();
        if (now - lastFpsUpdate >= 1000) {
          setStreamFps(frameCount);
          frameCount = 0;
          lastFpsUpdate = now;
        }

        // Draw bounding box and HUD overlays on overlay canvas
        const overlayCanvas = canvasOverlayRef.current;
        if (overlayCanvas) {
          overlayCanvas.width = video.videoWidth || 640;
          overlayCanvas.height = video.videoHeight || 480;
          const ctx = overlayCanvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

            if (result.boundingBox && (result.hasMotion || result.hasPresence)) {
              const bx = (result.boundingBox.x / 100) * overlayCanvas.width;
              const by = (result.boundingBox.y / 100) * overlayCanvas.height;
              const bw = (result.boundingBox.width / 100) * overlayCanvas.width;
              const bh = (result.boundingBox.height / 100) * overlayCanvas.height;

              // Draw tactical targeting box
              ctx.strokeStyle = result.hasPresence ? '#ef4444' : '#f59e0b';
              ctx.lineWidth = 3;
              ctx.strokeRect(bx, by, bw, bh);

              // Corner accents
              const cornerSize = 14;
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 4;
              // Top-left corner
              ctx.beginPath();
              ctx.moveTo(bx, by + cornerSize);
              ctx.lineTo(bx, by);
              ctx.lineTo(bx + cornerSize, by);
              ctx.stroke();

              // Top-right corner
              ctx.beginPath();
              ctx.moveTo(bx + bw - cornerSize, by);
              ctx.lineTo(bx + bw, by);
              ctx.lineTo(bx + bw, by + cornerSize);
              ctx.stroke();

              // Bottom-left corner
              ctx.beginPath();
              ctx.moveTo(bx, by + bh - cornerSize);
              ctx.lineTo(bx, by + bh);
              ctx.lineTo(bx + cornerSize, by + bh);
              ctx.stroke();

              // Bottom-right corner
              ctx.beginPath();
              ctx.moveTo(bx + bw - cornerSize, by + bh);
              ctx.lineTo(bx + bw, by + bh);
              ctx.lineTo(bx + bw, by + bh - cornerSize);
              ctx.stroke();

              // Label
              ctx.fillStyle = result.hasPresence ? '#ef4444' : '#f59e0b';
              ctx.fillRect(bx, Math.max(0, by - 22), 120, 20);
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 11px monospace';
              ctx.fillText(
                result.hasPresence ? 'TARGET: PRESENCE' : 'TARGET: MOTION',
                bx + 6,
                Math.max(14, by - 8)
              );
            }
          }
        }

        // Broadcast video frame over WebSocket to room peers (12-15 fps throttle)
        if (now - lastBroadcastRef.current > 75) {
          lastBroadcastRef.current = now;
          const frameJpeg = VisionDetector.getThumbnail(video, 400, 300);
          if (frameJpeg) {
            socketManager.sendVideoFrame(frameJpeg);
          }
        }

        // Check alarm conditions if Watchdog is Armed
        if (settings.armed && !activeAlarm && armingCountdown === null) {
          let triggerType: 'motion' | 'presence' | null = null;

          if (settings.mode === 'all') {
            if (result.hasPresence) triggerType = 'presence';
            else if (result.hasMotion) triggerType = 'motion';
          } else if (settings.mode === 'presence' && result.hasPresence) {
            triggerType = 'presence';
          } else if (settings.mode === 'passing' && result.hasMotion) {
            triggerType = 'motion';
          }

          if (triggerType && now - lastAlarmTriggerRef.current > 7000) {
            lastAlarmTriggerRef.current = now;
            const snapshot = VisionDetector.captureSnapshot(
              video,
              triggerType === 'presence' ? 'PRESENCE DETECTED' : 'MOTION PASSED'
            );

            // Play local ping or siren
            if (settings.alarmSoundEnabled) {
              soundEngine.startAlarmSiren(settings.alarmVolume, settings.sirenPattern);
            }

            // Log incident
            const incident: IncidentLog = {
              id: `inc_${Date.now()}`,
              timestamp: Date.now(),
              triggerType,
              motionScore: result.motionScore,
              snapshotUrl: snapshot,
              resolved: false,
            };
            onAddIncident(incident);

            // Trigger cross-network alarm
            onTriggerAlarm(triggerType, snapshot);
          }
        }
      }

      animationId = requestAnimationFrame(loop);
    };

    if (isStreaming) {
      animationId = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [isStreaming, settings, activeAlarm, armingCountdown, onAddIncident, onTriggerAlarm]);

  // Arming delay sequence
  const toggleArmed = () => {
    if (settings.armed) {
      onUpdateSettings({ armed: false });
      setArmingCountdown(null);
      socketManager.updateCameraStatus(isStreaming, false, role);
    } else {
      // 5-second arming delay so user can position device and exit
      setArmingCountdown(5);
      let count = 5;
      soundEngine.playAlertPing();
      const timer = setInterval(() => {
        count--;
        if (count <= 0) {
          clearInterval(timer);
          setArmingCountdown(null);
          onUpdateSettings({ armed: true });
          socketManager.updateCameraStatus(isStreaming, true, role);
          soundEngine.playWalkieChirp();
        } else {
          setArmingCountdown(count);
          soundEngine.playAlertPing();
        }
      }, 1000);
    }
  };

  const isShowingRemote = role === 'monitor' && remoteVideoFrame;

  return (
    <div
      ref={containerRef}
      id="watchdog-camera-stream-container"
      className="relative flex flex-col w-full bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl"
    >
      {/* Top HUD Header */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between p-3 bg-gradient-to-b from-slate-950/90 via-slate-950/40 to-transparent">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900/80 border border-slate-700/60 backdrop-blur-sm">
            <span
              className={`w-2 h-2 rounded-full ${
                activeAlarm
                  ? 'bg-red-500 animate-ping'
                  : isStreaming || isShowingRemote
                  ? 'bg-emerald-500 animate-pulse'
                  : 'bg-slate-500'
              }`}
            />
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-200">
              {activeAlarm
                ? 'ALARM TRIPPED'
                : isShowingRemote
                ? `REMOTE FEED: ${remotePeerName || 'CAM'}`
                : isStreaming
                ? 'LIVE SENTINEL'
                : 'STANDBY'}
            </span>
          </div>

          {/* Sentry Armed Badge */}
          <button
            id="toggle-armed-badge-button"
            onClick={toggleArmed}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-mono font-semibold transition-all backdrop-blur-sm cursor-pointer ${
              settings.armed
                ? 'bg-red-950/90 border border-red-500/80 text-red-300 shadow-sm shadow-red-900/50 hover:bg-red-900/80'
                : armingCountdown !== null
                ? 'bg-amber-950/90 border border-amber-500 text-amber-300 animate-pulse'
                : 'bg-slate-800/80 border border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            {settings.armed ? (
              <>
                <ShieldAlert className="w-3.5 h-3.5 text-red-400 animate-pulse" />
                <span>ARMED</span>
              </>
            ) : armingCountdown !== null ? (
              <>
                <Shield className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                <span>ARMING IN {armingCountdown}S</span>
              </>
            ) : (
              <>
                <Shield className="w-3.5 h-3.5 text-slate-400" />
                <span>DISARMED</span>
              </>
            )}
          </button>
        </div>

        {/* Quick actions top right */}
        <div className="flex items-center gap-1.5">
          {torchSupported && isStreaming && (
            <button
              id="camera-torch-toggle-button"
              onClick={toggleTorch}
              title="Toggle Flashlight / Torch"
              className={`p-2 rounded-lg border backdrop-blur-sm transition-all cursor-pointer ${
                torchActive
                  ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-md shadow-amber-500/30'
                  : 'bg-slate-900/80 border-slate-700/60 text-slate-300 hover:text-white'
              }`}
            >
              <Flashlight className="w-4 h-4" />
            </button>
          )}

          {isStreaming && (
            <button
              id="camera-flip-toggle-button"
              onClick={flipCamera}
              title="Flip Camera (Front/Back)"
              className="p-2 rounded-lg bg-slate-900/80 border border-slate-700/60 text-slate-300 hover:text-white backdrop-blur-sm cursor-pointer transition-all"
            >
              <SwitchCamera className="w-4 h-4" />
            </button>
          )}

          <button
            id="camera-fullscreen-button"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            className="p-2 rounded-lg bg-slate-900/80 border border-slate-700/60 text-slate-300 hover:text-white backdrop-blur-sm cursor-pointer transition-all"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Viewport Area */}
      <div className="relative w-full aspect-video min-h-[300px] sm:min-h-[420px] bg-slate-950 flex items-center justify-center overflow-hidden">
        {/* Remote Camera Feed Mode */}
        {isShowingRemote ? (
          <img
            src={remoteVideoFrame}
            alt="Remote Watchdog Camera Stream"
            className="w-full h-full object-contain"
          />
        ) : (
          /* Local Camera Feed Mode */
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-contain ${!isStreaming ? 'hidden' : ''}`}
            />
            <canvas
              ref={canvasOverlayRef}
              className={`absolute inset-0 pointer-events-none w-full h-full object-contain ${
                !isStreaming ? 'hidden' : ''
              }`}
            />
          </>
        )}

        {/* Tactical Crosshair Watermark */}
        {isStreaming && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-25">
            <div className="w-24 h-24 border border-dashed border-slate-500 rounded-full flex items-center justify-center">
              <div className="w-2 h-2 bg-slate-400 rounded-full" />
            </div>
          </div>
        )}

        {/* Standby / Off State */}
        {!isStreaming && !isShowingRemote && (
          <div className="flex flex-col items-center justify-center text-center p-6 z-10 max-w-sm">
            <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mb-4 shadow-inner">
              <CameraOff className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-semibold text-slate-200 mb-1">
              {role === 'monitor' ? 'Awaiting Remote Watchdog Cam' : 'Camera Sentinel Standby'}
            </h3>
            <p className="text-sm text-slate-400 mb-5 leading-relaxed">
              {role === 'monitor'
                ? 'Join a room code to receive real-time video feed and trigger walkie-talkie audio from any paired device.'
                : 'Activate camera to turn this device into a guard sentry that rings when someone passes or enters the room.'}
            </p>

            {role !== 'monitor' && (
              <button
                id="start-camera-stream-btn"
                onClick={startCamera}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-all shadow-lg shadow-emerald-950/40 cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span>Activate Camera Sentry</span>
              </button>
            )}

            {cameraError && (
              <div className="mt-4 p-3 rounded-lg bg-red-950/80 border border-red-800/80 text-red-300 text-xs text-left">
                <p className="font-semibold mb-0.5">Camera Error:</p>
                <p>{cameraError}</p>
              </div>
            )}
          </div>
        )}

        {/* Live Motion / Presence Bar Indicator (HUD Bottom Left) */}
        {isStreaming && (
          <div className="absolute bottom-16 left-3 z-20 flex flex-col gap-1.5 p-2 rounded-lg bg-slate-950/85 border border-slate-800/80 backdrop-blur-md shadow-lg pointer-events-none min-w-[150px]">
            {/* Motion Meter */}
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-300">
              <span className="flex items-center gap-1">
                <Activity className="w-3 h-3 text-amber-400" />
                MOTION
              </span>
              <span className={motionData.motionScore >= settings.motionThreshold ? 'text-amber-400 font-bold' : 'text-slate-400'}>
                {motionData.motionScore}%
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-75 ${
                  motionData.motionScore >= settings.motionThreshold ? 'bg-amber-500' : 'bg-slate-500'
                }`}
                style={{ width: `${Math.min(100, motionData.motionScore)}%` }}
              />
            </div>

            {/* Presence Meter */}
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-300 mt-1">
              <span className="flex items-center gap-1">
                <Eye className="w-3 h-3 text-red-400" />
                PRESENCE
              </span>
              <span className={motionData.hasPresence ? 'text-red-400 font-bold' : 'text-slate-400'}>
                {motionData.presenceScore}%
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-75 ${
                  motionData.hasPresence ? 'bg-red-500' : 'bg-blue-500'
                }`}
                style={{ width: `${Math.min(100, motionData.presenceScore)}%` }}
              />
            </div>
          </div>
        )}

        {/* FPS Indicator (Bottom Right) */}
        {isStreaming && (
          <div className="absolute bottom-16 right-3 z-20 px-2 py-1 rounded bg-slate-950/80 border border-slate-800/60 text-[10px] font-mono text-slate-400 backdrop-blur-sm pointer-events-none">
            {streamFps} FPS • {facingMode.toUpperCase()}
          </div>
        )}
      </div>

      {/* Bottom Camera Action Bar */}
      <div className="flex items-center justify-between p-3 bg-slate-900 border-t border-slate-800/80">
        <div className="flex items-center gap-2">
          {isStreaming ? (
            <button
              id="stop-camera-stream-btn"
              onClick={stopCamera}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-red-400 hover:text-red-300 text-xs font-semibold transition-all cursor-pointer border border-slate-700"
            >
              <CameraOff className="w-4 h-4" />
              <span>Stop Cam</span>
            </button>
          ) : (
            <button
              id="start-camera-stream-action-btn"
              onClick={startCamera}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-all cursor-pointer shadow-sm shadow-emerald-950/50"
            >
              <Camera className="w-4 h-4" />
              <span>Start Cam</span>
            </button>
          )}

          {/* Quick Arm / Disarm Button */}
          <button
            id="camera-arm-disarm-quick-btn"
            onClick={toggleArmed}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
              settings.armed
                ? 'bg-red-600 text-white border-red-500 shadow-md shadow-red-950/50 hover:bg-red-500'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'
            }`}
          >
            {settings.armed ? (
              <>
                <ShieldAlert className="w-4 h-4" />
                <span>Disarm Alarm</span>
              </>
            ) : (
              <>
                <Shield className="w-4 h-4" />
                <span>Arm Watchdog</span>
              </>
            )}
          </button>
        </div>

        {/* Snapshot & Manual Siren */}
        <div className="flex items-center gap-2">
          {isStreaming && (
            <button
              id="capture-manual-snapshot-btn"
              onClick={() => {
                if (videoRef.current) {
                  const snap = VisionDetector.captureSnapshot(videoRef.current, 'MANUAL SNAPSHOT');
                  socketManager.sendChat('Captured camera snapshot', snap);
                  soundEngine.playAlertPing();
                }
              }}
              title="Capture Snapshot to Chat"
              className="flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-all cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Snapshot</span>
            </button>
          )}

          <button
            id="manual-siren-trigger-btn"
            onClick={() => {
              if (activeAlarm) {
                socketManager.dismissAlarm();
                soundEngine.stopAlarmSiren();
              } else {
                let snap = '';
                if (videoRef.current && isStreaming) {
                  snap = VisionDetector.captureSnapshot(videoRef.current, 'MANUAL PANIC ALARM');
                }
                onTriggerAlarm('manual', snap);
              }
            }}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
              activeAlarm
                ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-500 animate-pulse'
                : 'bg-red-950/80 hover:bg-red-900 border-red-800 text-red-300'
            }`}
          >
            <Bell className="w-4 h-4 text-red-400" />
            <span>{activeAlarm ? 'Silence Siren' : 'Panic Siren'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
