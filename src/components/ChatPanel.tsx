import React, { useState, useRef, useEffect } from 'react';
import { Send, MessageSquare, Shield, Clock, Camera, Image as ImageIcon } from 'lucide-react';
import { ChatMessage } from '../types';
import { socketManager } from '../utils/socket';
import { soundEngine } from '../utils/audio';

interface ChatPanelProps {
  messages: ChatMessage[];
  currentPeerId: string;
  onSendSnapshot?: () => void;
}

const QUICK_SECURITY_MACROS = [
  "Who is there?",
  "I am watching this camera!",
  "Step away from the premises.",
  "All clear on this end.",
  "Roger that, monitor active.",
  "Alarm disarmed.",
];

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  currentPeerId,
  onSendSnapshot,
}) => {
  const [inputVal, setInputVal] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputVal.trim();
    if (!trimmed) return;

    socketManager.sendChat(trimmed);
    setInputVal('');
    soundEngine.playAlertPing();
  };

  const handleQuickMacro = (text: string) => {
    socketManager.sendChat(text);
    soundEngine.playAlertPing();
  };

  return (
    <div
      id="watchdog-chat-panel"
      className="flex flex-col h-[480px] sm:h-[520px] bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3.5 bg-slate-950/60 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-950/80 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <MessageSquare className="w-3.5 h-3.5" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
              Network Chat & Log
            </h4>
            <p className="text-[11px] text-slate-400">Encrypted Local Subnet Dispatch</p>
          </div>
        </div>

        {onSendSnapshot && (
          <button
            id="chat-send-snapshot-btn"
            onClick={onSendSnapshot}
            title="Send Live Camera Snapshot to Chat"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 cursor-pointer transition-all"
          >
            <Camera className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Send Photo</span>
          </button>
        )}
      </div>

      {/* Messages Feed */}
      <div className="flex-1 p-3 overflow-y-auto space-y-3 bg-slate-950/40">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-slate-500 p-4">
            <MessageSquare className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-xs">No chat messages yet in this channel.</p>
            <p className="text-[11px] text-slate-600 mt-1">
              Type a message or use quick security macros below.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === currentPeerId;
            return (
              <div
                key={msg.id}
                className={`flex flex-col max-w-[85%] ${
                  isMe ? 'ml-auto items-end' : 'mr-auto items-start'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] text-slate-400">
                  <span className="font-semibold text-slate-300">{isMe ? 'You' : msg.senderName}</span>
                  <span>•</span>
                  <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>

                <div
                  className={`p-3 rounded-2xl text-xs leading-relaxed ${
                    isMe
                      ? 'bg-blue-600 text-white rounded-br-xs'
                      : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-xs'
                  }`}
                >
                  {msg.snapshotUrl && (
                    <div className="mb-2 rounded-lg overflow-hidden border border-white/10 shadow-md">
                      <img
                        src={msg.snapshotUrl}
                        alt="Camera Snapshot"
                        className="w-full max-h-44 object-cover"
                      />
                    </div>
                  )}
                  <p>{msg.text}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Security Macros */}
      <div className="px-3 py-2 bg-slate-900 border-t border-slate-800/80 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {QUICK_SECURITY_MACROS.map((macro, idx) => (
          <button
            key={idx}
            onClick={() => handleQuickMacro(macro)}
            className="whitespace-nowrap px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-medium border border-slate-700 transition-all cursor-pointer"
          >
            {macro}
          </button>
        ))}
      </div>

      {/* Input Box */}
      <form
        onSubmit={handleSend}
        className="flex items-center gap-2 p-2.5 bg-slate-950 border-t border-slate-800"
      >
        <input
          id="chat-message-input"
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          placeholder="Broadcast text message to room..."
          className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
        />
        <button
          id="chat-send-message-btn"
          type="submit"
          disabled={!inputVal.trim()}
          className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white transition-all cursor-pointer"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
