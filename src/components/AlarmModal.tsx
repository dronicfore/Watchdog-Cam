import React, { useEffect } from 'react';
import { ShieldAlert, VolumeX, Eye, Activity, BellOff } from 'lucide-react';
import { ActiveAlarmState } from '../types';
import { soundEngine } from '../utils/audio';

interface AlarmModalProps {
  alarm: ActiveAlarmState | null;
  onDismiss: () => void;
}

export const AlarmModal: React.FC<AlarmModalProps> = ({ alarm, onDismiss }) => {
  if (!alarm || !alarm.active) return null;

  return (
    <div
      id="watchdog-active-alarm-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-red-950/80 backdrop-blur-md animate-pulse"
    >
      <div className="relative w-full max-w-lg bg-slate-950 border-2 border-red-500 rounded-3xl p-6 shadow-2xl shadow-red-900/60 flex flex-col items-center text-center overflow-hidden">
        {/* Flashing Top Banner */}
        <div className="w-16 h-16 rounded-2xl bg-red-600/20 border border-red-500 flex items-center justify-center text-red-500 mb-3 shadow-lg shadow-red-600/30">
          <ShieldAlert className="w-10 h-10 animate-bounce" />
        </div>

        <span className="px-3 py-1 rounded-full bg-red-600 text-white font-mono font-black text-xs tracking-widest uppercase mb-2">
          WATCHDOG SECURITY ALERT
        </span>

        <h2 className="text-xl sm:text-2xl font-bold text-white mb-1">
          {alarm.triggerType === 'presence'
            ? 'HUMAN PRESENCE DETECTED!'
            : alarm.triggerType === 'motion'
            ? 'MOTION PASSING CAMERA DETECTED!'
            : 'MANUAL PANIC ALARM TRIPPED!'}
        </h2>

        <p className="text-xs sm:text-sm text-red-300 mb-4 max-w-md">
          {alarm.triggerType === 'presence'
            ? `Device "${alarm.senderName}" detected a person present in front of the camera.`
            : alarm.triggerType === 'motion'
            ? `Device "${alarm.senderName}" detected an object or person moving past the camera lens.`
            : `Triggered manually from "${alarm.senderName}".`}
        </p>

        {/* Captured Incident Photo Snapshot */}
        {alarm.snapshot && (
          <div className="w-full max-h-56 rounded-xl overflow-hidden border border-red-500/50 mb-5 shadow-lg bg-black">
            <img
              src={alarm.snapshot}
              alt="Intruder Snapshot"
              className="w-full h-full object-contain"
            />
          </div>
        )}

        <div className="flex items-center gap-4 text-xs font-mono text-slate-400 mb-6">
          <span className="flex items-center gap-1">
            {alarm.triggerType === 'presence' ? (
              <Eye className="w-3.5 h-3.5 text-red-400" />
            ) : (
              <Activity className="w-3.5 h-3.5 text-amber-400" />
            )}
            TRIGGER: {alarm.triggerType.toUpperCase()}
          </span>
          <span>•</span>
          <span>TIME: {new Date(alarm.timestamp).toLocaleTimeString()}</span>
        </div>

        {/* Big Dismiss / Silence Button */}
        <button
          id="dismiss-watchdog-alarm-btn"
          onClick={() => {
            soundEngine.stopAlarmSiren();
            onDismiss();
          }}
          className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-bold text-sm tracking-wide transition-all shadow-xl shadow-red-950/60 flex items-center justify-center gap-2 cursor-pointer"
        >
          <BellOff className="w-5 h-5" />
          <span>SILENCE & DISMISS ALARM</span>
        </button>
      </div>
    </div>
  );
};
