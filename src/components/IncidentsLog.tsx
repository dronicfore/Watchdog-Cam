import React, { useState } from 'react';
import { ShieldAlert, Eye, Activity, Download, Trash2, Clock, X } from 'lucide-react';
import { IncidentLog } from '../types';

interface IncidentsLogProps {
  incidents: IncidentLog[];
  onClearIncidents: () => void;
}

export const IncidentsLog: React.FC<IncidentsLogProps> = ({
  incidents,
  onClearIncidents,
}) => {
  const [selectedSnapshot, setSelectedSnapshot] = useState<string | null>(null);

  return (
    <div
      id="watchdog-incidents-log"
      className="flex flex-col bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl"
    >
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-red-950/80 border border-red-500/40 flex items-center justify-center text-red-400">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase">
              Incident & Intrusion Snapshots ({incidents.length})
            </h3>
            <p className="text-[11px] text-slate-400">
              Automatic photo captures triggered when motion or presence tripped the alarm
            </p>
          </div>
        </div>

        {incidents.length > 0 && (
          <button
            id="clear-incidents-history-btn"
            onClick={onClearIncidents}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-red-300 text-xs font-medium border border-slate-700 transition-all cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear History</span>
          </button>
        )}
      </div>

      {incidents.length === 0 ? (
        <div className="py-12 flex flex-col items-center justify-center text-center text-slate-500">
          <div className="w-12 h-12 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center mb-3">
            <Activity className="w-6 h-6 text-slate-600" />
          </div>
          <p className="text-xs font-semibold text-slate-400">No alarm incidents recorded yet.</p>
          <p className="text-[11px] text-slate-500 mt-1 max-w-xs">
            When Watchdog is armed, any passing motion or detected presence will trigger the alarm and save a snapshot here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {incidents.map((inc) => (
            <div
              key={inc.id}
              className="flex flex-col bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-md group hover:border-slate-700 transition-all"
            >
              {inc.snapshotUrl ? (
                <div
                  onClick={() => setSelectedSnapshot(inc.snapshotUrl || null)}
                  className="relative aspect-video w-full bg-black cursor-pointer overflow-hidden"
                >
                  <img
                    src={inc.snapshotUrl}
                    alt="Incident Capture"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-slate-950/80 border border-slate-700 text-[10px] font-mono text-slate-300 backdrop-blur-sm">
                    {new Date(inc.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              ) : (
                <div className="aspect-video w-full bg-slate-900 flex items-center justify-center text-slate-600">
                  <Eye className="w-8 h-8 opacity-40" />
                </div>
              )}

              <div className="p-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        inc.triggerType === 'presence' ? 'bg-red-500' : 'bg-amber-500'
                      }`}
                    />
                    <span className="text-xs font-mono font-bold text-slate-200 uppercase">
                      {inc.triggerType === 'presence' ? 'HUMAN PRESENCE' : 'PASSING MOTION'}
                    </span>
                  </div>
                  <p className="text-[10px] font-mono text-slate-400 mt-0.5">
                    Motion Delta: {inc.motionScore}% • {new Date(inc.timestamp).toLocaleDateString()}
                  </p>
                </div>

                {inc.snapshotUrl && (
                  <a
                    href={inc.snapshotUrl}
                    download={`watchdog_incident_${inc.timestamp}.jpg`}
                    title="Download Photo"
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Fullscreen Snapshot Modal */}
      {selectedSnapshot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          onClick={() => setSelectedSnapshot(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl p-2">
            <button
              onClick={() => setSelectedSnapshot(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-slate-900/80 text-white hover:bg-slate-800 border border-slate-700 z-10 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={selectedSnapshot}
              alt="Expanded Incident"
              className="max-h-[82vh] w-auto object-contain rounded-xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};
