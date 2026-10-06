import React, { useState, useEffect } from 'react';
import {
  Wifi,
  Radio,
  QrCode,
  Copy,
  Check,
  Smartphone,
  Shield,
  Camera,
  RefreshCw,
  Bluetooth,
  ArrowRight,
  Info,
} from 'lucide-react';
import { DeviceRole, RoomSummary, PeerInfo } from '../types';

interface NetworkManagerProps {
  currentRoomId: string;
  onJoinRoom: (roomId: string) => void;
  deviceRole: DeviceRole;
  onChangeRole: (role: DeviceRole) => void;
  peerName: string;
  onChangePeerName: (name: string) => void;
  connectedPeers: PeerInfo[];
}

export const NetworkManager: React.FC<NetworkManagerProps> = ({
  currentRoomId,
  onJoinRoom,
  deviceRole,
  onChangeRole,
  peerName,
  onChangePeerName,
  connectedPeers,
}) => {
  const [inputRoom, setInputRoom] = useState(currentRoomId);
  const [copied, setCopied] = useState(false);
  const [activeRooms, setActiveRooms] = useState<RoomSummary[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [bluetoothSupported, setBluetoothSupported] = useState<boolean>(false);
  const [bluetoothScanning, setBluetoothScanning] = useState(false);
  const [bluetoothDeviceName, setBluetoothDeviceName] = useState<string | null>(null);

  useEffect(() => {
    setBluetoothSupported(typeof navigator !== 'undefined' && 'bluetooth' in navigator);
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    setLoadingRooms(true);
    try {
      const res = await fetch('/api/rooms');
      const data = await res.json();
      if (data.rooms) {
        setActiveRooms(data.rooms);
      }
    } catch {
      // Offline / local
    } finally {
      setLoadingRooms(false);
    }
  };

  const handleCopyLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', currentRoomId);
    navigator.clipboard.writeText(url.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const scanBluetooth = async () => {
    if (!('bluetooth' in navigator)) return;
    setBluetoothScanning(true);
    try {
      const navBt = (navigator as unknown as { bluetooth: { requestDevice: (options: unknown) => Promise<{ name?: string }> } }).bluetooth;
      const device = await navBt.requestDevice({
        acceptAllDevices: true,
      });
      if (device && device.name) {
        setBluetoothDeviceName(device.name);
      }
    } catch (e) {
      console.warn('Bluetooth pairing aborted:', e);
    } finally {
      setBluetoothScanning(false);
    }
  };

  return (
    <div
      id="watchdog-network-manager"
      className="flex flex-col gap-5 bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl"
    >
      {/* Device Mode & Role Selector */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold">
          Select This Device's Role (Walkietooth Mode)
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <button
            id="role-camera-btn"
            onClick={() => onChangeRole('camera')}
            className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
              deviceRole === 'camera'
                ? 'bg-emerald-950/70 border-emerald-500 text-white shadow-lg shadow-emerald-950/50'
                : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Camera className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold font-mono">WATCHDOG CAM</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-snug">
              Stationary sentry. Monitors motion/presence, streams video, and rings alarm siren.
            </p>
          </button>

          <button
            id="role-monitor-btn"
            onClick={() => onChangeRole('monitor')}
            className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
              deviceRole === 'monitor'
                ? 'bg-blue-950/70 border-blue-500 text-white shadow-lg shadow-blue-950/50'
                : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Smartphone className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-bold font-mono">HANDHELD MONITOR</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-snug">
              Portable receiver. Views live remote feed, receives alarms, and talks back via PTT.
            </p>
          </button>

          <button
            id="role-walkie-btn"
            onClick={() => onChangeRole('walkie')}
            className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
              deviceRole === 'walkie'
                ? 'bg-amber-950/70 border-amber-500 text-white shadow-lg shadow-amber-950/50'
                : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Radio className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold font-mono">TWO-WAY INTERCOM</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-snug">
              Full duplex. Simultaneous camera streaming, intercom walkie-talkie, and chat.
            </p>
          </button>
        </div>
      </div>

      {/* Network Channel / Room Setup */}
      <div className="flex flex-col gap-3 p-4 rounded-xl bg-slate-950 border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Wifi className="w-4 h-4 text-emerald-400" />
              Network Channel / Room Code
            </h4>
            <p className="text-[11px] text-slate-400">
              Both devices must join the same code over WiFi, Mobile Hotspot, or Local Subnet.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="copy-channel-link-btn"
              onClick={handleCopyLink}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-all cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Link Copied' : 'Share Link'}</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="network-room-input"
            type="text"
            value={inputRoom}
            onChange={(e) => setInputRoom(e.target.value.toUpperCase().replace(/\s+/g, '-'))}
            placeholder="e.g. LIVING-ROOM, CAM-01, SENTRY-A"
            className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs font-mono font-semibold text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 uppercase"
          />
          <button
            id="join-channel-btn"
            onClick={() => {
              if (inputRoom.trim()) onJoinRoom(inputRoom.trim());
            }}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all cursor-pointer shadow-md shadow-emerald-950/40"
          >
            Switch Channel
          </button>
        </div>

        {/* Device Alias Name */}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[11px] text-slate-400 font-mono">Device Name:</span>
          <input
            id="device-alias-input"
            type="text"
            value={peerName}
            onChange={(e) => onChangePeerName(e.target.value)}
            placeholder="e.g. Front Door Cam, Galaxy S23"
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Connected Peers in Current Room */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold">
            Connected Peers in Channel ({connectedPeers.length})
          </span>
          <button
            onClick={fetchRooms}
            className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Refresh peers"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingRooms ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {connectedPeers.length === 0 ? (
          <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 text-center text-xs text-slate-500">
            No other devices currently connected in channel "{currentRoomId}".
            <br />
            Open this URL on a second phone or tablet on the same WiFi/hotspot to pair!
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {connectedPeers.map((p) => (
              <div
                key={p.peerId}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <div>
                    <p className="font-semibold text-slate-200">{p.peerName}</p>
                    <p className="text-[10px] font-mono text-slate-400 uppercase">
                      ROLE: {p.deviceRole} • {p.isCameraStreaming ? 'CAM ACTIVE' : 'CAM OFF'}
                    </p>
                  </div>
                </div>

                {p.watchdogArmed && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-red-950 text-red-400 border border-red-800">
                    ARMED
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Walkietooth Network Setup Guide: WiFi, Hotspot, and Bluetooth */}
      <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-200 font-mono">
          <Info className="w-4 h-4 text-blue-400" />
          WALKIETOOTH ZERO-ROUTER CONNECTION MODES
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-400 leading-relaxed">
          <div className="p-3 rounded-lg bg-slate-900 border border-slate-800/80">
            <h5 className="font-semibold text-slate-200 mb-1 flex items-center gap-1.5">
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              1. Mobile Hotspot (No Internet/Router Needed)
            </h5>
            <p className="text-[11px] text-slate-400">
              Turn on Portable Wi-Fi Hotspot on Phone A. Connect Phone B to Phone A's hotspot. Both open Watchdog Cam on channel "{currentRoomId}" for direct peer audio, camera, and alarm!
            </p>
          </div>

          <div className="p-3 rounded-lg bg-slate-900 border border-slate-800/80">
            <h5 className="font-semibold text-slate-200 mb-1 flex items-center gap-1.5">
              <Bluetooth className="w-3.5 h-3.5 text-blue-400" />
              2. Bluetooth Tethering & Scanning
            </h5>
            <p className="text-[11px] text-slate-400 mb-2">
              Supports Bluetooth PAN tethering or Web Bluetooth discovery for pairing nearby audio peripherals and sensors.
            </p>
            {bluetoothSupported ? (
              <button
                id="scan-bluetooth-btn"
                onClick={scanBluetooth}
                disabled={bluetoothScanning}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-blue-900/40 hover:bg-blue-800/60 border border-blue-700/60 text-blue-300 text-[11px] font-mono cursor-pointer transition-all"
              >
                <Bluetooth className="w-3 h-3" />
                <span>{bluetoothScanning ? 'Scanning...' : 'Scan Bluetooth Device'}</span>
              </button>
            ) : (
              <span className="text-[10px] text-slate-500 font-mono">
                Web Bluetooth supported in Chrome/Edge.
              </span>
            )}
            {bluetoothDeviceName && (
              <p className="text-[10px] text-emerald-400 font-mono mt-1">
                Paired Bluetooth Device: {bluetoothDeviceName}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
