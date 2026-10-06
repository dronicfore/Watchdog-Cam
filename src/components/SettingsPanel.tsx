import React, { useState } from 'react';
import { Sliders, Volume2, Shield, Bell, Eye, Activity, Play, Square } from 'lucide-react';
import { WatchdogSettings, DetectionMode, SensitivityLevel } from '../types';
import { soundEngine } from '../utils/audio';

interface SettingsPanelProps {
  settings: WatchdogSettings;
  onUpdateSettings: (settings: Partial<WatchdogSettings>) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  settings,
  onUpdateSettings,
}) => {
  const [testingSiren, setTestingSiren] = useState(false);

  const handleTestSiren = () => {
    if (testingSiren) {
      soundEngine.stopAlarmSiren();
      setTestingSiren(false);
    } else {
      setTestingSiren(true);
      soundEngine.startAlarmSiren(settings.alarmVolume, settings.sirenPattern);
    }
  };

  const setSensitivity = (level: SensitivityLevel) => {
    let threshold = 20;
    if (level === 'low') threshold = 32;
    if (level === 'medium') threshold = 20;
    if (level === 'high') threshold = 12;
    if (level === 'ultra') threshold = 6;

    onUpdateSettings({
      sensitivity: level,
      motionThreshold: threshold,
    });
  };

  return (
    <div
      id="watchdog-settings-panel"
      className="flex flex-col gap-5 bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl"
    >
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-950/80 border border-amber-500/40 flex items-center justify-center text-amber-400">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase">
              Watchdog Cam Alarm Engine
            </h3>
            <p className="text-[11px] text-slate-400">
              Configure detection thresholds, siren profiles, and automated triggers
            </p>
          </div>
        </div>
      </div>

      {/* Detection Mode */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-300">
          Alarm Trigger Condition
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <button
            onClick={() => onUpdateSettings({ mode: 'all' })}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              settings.mode === 'all'
                ? 'bg-red-950/70 border-red-500 text-white shadow-md shadow-red-950/50'
                : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center gap-1.5 font-bold font-mono text-xs mb-1">
              <Shield className="w-3.5 h-3.5 text-red-400" />
              PRESENCE & PASSING
            </div>
            <p className="text-[11px] text-slate-400 leading-snug">
              Alarms whenever someone enters view or walks/passes in front of camera.
            </p>
          </button>

          <button
            onClick={() => onUpdateSettings({ mode: 'passing' })}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              settings.mode === 'passing'
                ? 'bg-amber-950/70 border-amber-500 text-white shadow-md shadow-amber-950/50'
                : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center gap-1.5 font-bold font-mono text-xs mb-1">
              <Activity className="w-3.5 h-3.5 text-amber-400" />
              PASSING MOTION ONLY
            </div>
            <p className="text-[11px] text-slate-400 leading-snug">
              Alarms when an object or intruder swiftly crosses or passes by the camera frame.
            </p>
          </button>

          <button
            onClick={() => onUpdateSettings({ mode: 'presence' })}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              settings.mode === 'presence'
                ? 'bg-blue-950/70 border-blue-500 text-white shadow-md shadow-blue-950/50'
                : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center gap-1.5 font-bold font-mono text-xs mb-1">
              <Eye className="w-3.5 h-3.5 text-blue-400" />
              HUMAN PRESENCE ONLY
            </div>
            <p className="text-[11px] text-slate-400 leading-snug">
              Alarms when a person stays or is present in front of the lens for &gt;1.5 seconds.
            </p>
          </button>
        </div>
      </div>

      {/* Sensitivity */}
      <div className="flex flex-col gap-2 p-4 rounded-xl bg-slate-950 border border-slate-800">
        <div className="flex items-center justify-between">
          <label className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-300">
            Motion Sensitivity Level
          </label>
          <span className="text-xs font-mono font-bold text-amber-400 uppercase">
            {settings.sensitivity} (Delta Threshold: {settings.motionThreshold}%)
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2 mt-1">
          {(['low', 'medium', 'high', 'ultra'] as SensitivityLevel[]).map((level) => (
            <button
              key={level}
              onClick={() => setSensitivity(level)}
              className={`py-2 rounded-lg border text-xs font-mono font-bold uppercase transition-all cursor-pointer ${
                settings.sensitivity === level
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
              }`}
            >
              {level}
            </button>
          ))}
        </div>
      </div>

      {/* Siren & Sound Settings */}
      <div className="flex flex-col gap-3 p-4 rounded-xl bg-slate-950 border border-slate-800">
        <div className="flex items-center justify-between">
          <label className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Volume2 className="w-4 h-4 text-red-400" />
            Alarm Siren Sound Profile
          </label>

          <button
            id="test-alarm-siren-btn"
            onClick={handleTestSiren}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer border ${
              testingSiren
                ? 'bg-red-600 text-white border-red-500 animate-pulse'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
            }`}
          >
            {testingSiren ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{testingSiren ? 'STOP TEST' : 'TEST SIREN'}</span>
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { id: 'police', label: 'Police Wail' },
              { id: 'beeps', label: 'Urgent Beeps' },
              { id: 'sonar', label: 'Sonar Pulse' },
            ] as const
          ).map((pattern) => (
            <button
              key={pattern.id}
              onClick={() => onUpdateSettings({ sirenPattern: pattern.id })}
              className={`py-2 px-3 rounded-lg border text-xs font-mono font-semibold transition-all cursor-pointer text-center ${
                settings.sirenPattern === pattern.id
                  ? 'bg-red-950/80 border-red-500 text-red-300'
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
              }`}
            >
              {pattern.label}
            </button>
          ))}
        </div>

        {/* Volume Slider */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <span className="text-[11px] font-mono text-slate-400">Volume:</span>
          <input
            type="range"
            min="0.1"
            max="1.0"
            step="0.05"
            value={settings.alarmVolume}
            onChange={(e) => onUpdateSettings({ alarmVolume: parseFloat(e.target.value) })}
            className="flex-1 accent-red-500"
          />
          <span className="text-xs font-mono text-slate-300 w-10 text-right">
            {Math.round(settings.alarmVolume * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
};
