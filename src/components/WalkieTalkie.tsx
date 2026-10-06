import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Radio, Signal, Headphones } from 'lucide-react';
import { soundEngine } from '../utils/audio';
import { socketManager } from '../utils/socket';

interface WalkieTalkieProps {
  roomId: string;
  peerName: string;
  incomingSpeaker: string | null;
  isReceivingAudio: boolean;
}

export const WalkieTalkie: React.FC<WalkieTalkieProps> = ({
  roomId,
  peerName,
  incomingSpeaker,
  isReceivingAudio,
}) => {
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [micGranted, setMicGranted] = useState<boolean | null>(null);
  const [txLevel, setTxLevel] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isHoldingRef = useRef(false);

  // Request microphone on first user action
  const initMicStream = async () => {
    if (audioStreamRef.current) return audioStreamRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      audioStreamRef.current = stream;
      setMicGranted(true);

      // Setup analyser for voice level animation
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      src.connect(analyser);
      analyserRef.current = analyser;

      return stream;
    } catch (err) {
      console.warn('Microphone permission denied:', err);
      setMicGranted(false);
      return null;
    }
  };

  const startTransmitting = useCallback(async () => {
    if (isHoldingRef.current || isMuted) return;
    isHoldingRef.current = true;
    setIsTransmitting(true);

    soundEngine.playWalkieChirp();

    const stream = await initMicStream();
    if (!stream) {
      isHoldingRef.current = false;
      setIsTransmitting(false);
      return;
    }

    try {
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = async (e) => {
        if (e.data.size > 0 && isHoldingRef.current) {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = reader.result as string;
            socketManager.sendWalkieAudio(base64, false, false);
          };
          reader.readAsDataURL(e.data);
        }
      };

      recorder.start(120); // 120ms audio slices for responsive streaming
      socketManager.sendWalkieAudio('', true, false);

      // Voice level visualizer loop
      const updateLevel = () => {
        if (analyserRef.current && isHoldingRef.current) {
          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          setTxLevel(Math.min(100, Math.round((avg / 128) * 100)));
          animFrameRef.current = requestAnimationFrame(updateLevel);
        }
      };
      updateLevel();
    } catch (e) {
      console.error('Recording error:', e);
      setIsTransmitting(false);
      isHoldingRef.current = false;
    }
  }, [isMuted]);

  const stopTransmitting = useCallback(() => {
    if (!isHoldingRef.current) return;
    isHoldingRef.current = false;
    setIsTransmitting(false);
    setTxLevel(0);

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }

    socketManager.sendWalkieAudio('', false, true);
    soundEngine.playRogerBeep();
  }, []);

  // Keyboard shortcut: Spacebar hold to talk
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        startTransmitting();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        stopTransmitting();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [startTransmitting, stopTransmitting]);

  return (
    <div
      id="walkie-talkie-panel"
      className="flex flex-col bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden"
    >
      {/* Walkietooth Header Status Bar */}
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <Radio className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase">
                WALKIE-COM LINK
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <p className="text-[11px] font-mono text-slate-400">
              CH: {roomId || 'LOCAL'} • 433.92 MHz
            </p>
          </div>
        </div>

        {/* Volume & Mute */}
        <div className="flex items-center gap-2">
          <button
            id="walkie-mute-toggle-btn"
            onClick={() => setIsMuted((prev) => !prev)}
            title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
            className={`p-2 rounded-lg border transition-all cursor-pointer ${
              isMuted
                ? 'bg-red-950/80 border-red-800 text-red-400'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Realistic Radio LCD Display */}
      <div className="w-full bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-3 mb-5 font-mono text-xs flex flex-col gap-1.5 text-emerald-400 shadow-inner">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Signal className="w-3.5 h-3.5" />
            DUPLEX AUDIO
          </span>
          <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-emerald-900/50 border border-emerald-700/50">
            {isTransmitting ? 'TRANSMITTING (TX)' : isReceivingAudio ? 'RECEIVING (RX)' : 'IDLE (RX-READY)'}
          </span>
        </div>

        {/* Voice waveform or Speaker banner */}
        {isReceivingAudio ? (
          <div className="flex items-center gap-2 py-1 text-amber-300 animate-pulse">
            <Headphones className="w-4 h-4" />
            <span className="font-semibold">INCOMING VOICE: {incomingSpeaker || 'REMOTE PEER'}</span>
          </div>
        ) : isTransmitting ? (
          <div className="flex items-center gap-2 py-1 text-emerald-300">
            <Mic className="w-4 h-4 animate-pulse text-emerald-400" />
            <span>MIC LIVE: SENDING VOICE STREAM</span>
          </div>
        ) : (
          <div className="text-slate-400 text-[11px] py-1">
            Hold Push-To-Talk button or hold Spacebar to broadcast audio
          </div>
        )}

        {/* Signal Level Meter */}
        <div className="w-full h-1.5 bg-slate-950/80 rounded-full overflow-hidden mt-1">
          <div
            className={`h-full transition-all duration-75 ${
              isTransmitting ? 'bg-emerald-400' : isReceivingAudio ? 'bg-amber-400' : 'bg-emerald-800'
            }`}
            style={{ width: isTransmitting ? `${Math.max(15, txLevel)}%` : isReceivingAudio ? '75%' : '0%' }}
          />
        </div>
      </div>

      {/* Central Ergonomic PTT (Push-To-Talk) Button */}
      <div className="flex flex-col items-center justify-center my-2">
        <button
          id="walkie-ptt-button"
          onMouseDown={startTransmitting}
          onMouseUp={stopTransmitting}
          onMouseLeave={stopTransmitting}
          onTouchStart={(e) => {
            e.preventDefault();
            startTransmitting();
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            stopTransmitting();
          }}
          className={`relative group w-36 h-36 sm:w-40 sm:h-40 rounded-full flex flex-col items-center justify-center border-4 transition-all select-none cursor-pointer shadow-2xl active:scale-95 ${
            isTransmitting
              ? 'bg-gradient-to-b from-emerald-500 to-emerald-700 border-emerald-300 text-white shadow-emerald-500/50 ring-8 ring-emerald-500/25'
              : isReceivingAudio
              ? 'bg-gradient-to-b from-amber-600 to-amber-800 border-amber-400 text-white shadow-amber-500/40'
              : 'bg-gradient-to-b from-slate-800 to-slate-900 border-slate-700 text-slate-300 hover:border-emerald-500/50 hover:text-white shadow-black/60'
          }`}
        >
          <div
            className={`w-14 h-14 rounded-full flex items-center justify-center mb-1 transition-transform ${
              isTransmitting ? 'scale-110' : ''
            }`}
          >
            {isTransmitting ? (
              <Mic className="w-9 h-9 text-white animate-pulse" />
            ) : isMuted ? (
              <MicOff className="w-8 h-8 text-red-400" />
            ) : (
              <Radio className="w-8 h-8 group-hover:text-emerald-400 transition-colors" />
            )}
          </div>

          <span className="text-xs font-black tracking-widest uppercase font-mono">
            {isTransmitting ? 'TALKING' : 'PUSH TO TALK'}
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5 opacity-80">
            {isTransmitting ? 'RELEASE TO HEAR' : 'HOLD TO SPEAK'}
          </span>
        </button>

        <p className="text-xs text-slate-500 mt-3 font-mono">
          Tip: Press and hold <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">Space</kbd> on keyboard
        </p>

        {micGranted === false && (
          <div className="mt-3 p-2 rounded bg-red-950/70 border border-red-800 text-red-300 text-xs text-center">
            Microphone blocked. Please permit microphone access in browser settings.
          </div>
        )}
      </div>
    </div>
  );
};
