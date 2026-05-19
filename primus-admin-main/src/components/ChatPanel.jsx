import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { X, Send } from 'lucide-react';
import { getApiBase, authHeaders, showToast } from '../utils/api';
import { subscribe as subscribeAdminWs } from '../utils/wsAdmin';

const ChatPanel = ({ pc, onClose }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!pc) return;

    const base = getApiBase().replace(/\/$/, '');

    // Normalise pc.id once so all comparisons are number-based. The PC list
    // payload sometimes ships id as a string ("3") while the WebSocket event
    // ships client_id as a number (3) — strict !== was silently dropping
    // every live update.
    const myPcId = Number(pc.id);

    const loadHistory = async () => {
      try {
        setLoading(true);
        const res = await axios.get(`${base}/api/chat/`, {
          headers: authHeaders(),
        });
        const all = res.data || [];
        const filtered = all
          .filter((m) => Number(m.pc_id) === myPcId)
          .sort(
            (a, b) =>
              new Date(a.timestamp || a.ts || 0).getTime() -
              new Date(b.timestamp || b.ts || 0).getTime()
          );
        setMessages(filtered);
      } catch (e) {
        console.error('Failed to load chat history', e);
        showToast('Failed to load chat history');
      } finally {
        setLoading(false);
      }
    };

    loadHistory();

    // Treat every chat.message WS event as a "something changed, refetch
    // history" signal. We don't try to mutate state from the WS payload
    // directly anymore — that path was fragile (filter false-negatives,
    // missing fields, stale-closure on pc.id). Refetching gives us the
    // authoritative server view with proper `from` attribution and no
    // duplicates from optimistic-vs-echo timing.
    const unsubscribe = subscribeAdminWs((msg) => {
      if (!msg || msg.event !== 'chat.message') return;
      const payload = msg.payload || {};
      const evPc = payload.client_id ?? payload.pc_id;
      if (evPc != null && Number(evPc) !== myPcId) return;
      loadHistory();
    });

    return () => {
      unsubscribe && unsubscribe();
    };
  }, [pc]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || !pc) return;

    try {
      setSending(true);
      const base = getApiBase().replace(/\/$/, '');
      await axios.post(
        `${base}/api/chat/`,
        {
          pc_id: pc.id,
          message: text,
        },
        {
          headers: {
            ...authHeaders(),
            'Content-Type': 'application/json',
          },
        }
      );
      setInput('');
      // The actual appended message will come from chat.message WS event
    } catch (e) {
      console.error('Failed to send chat message', e);
      showToast('Failed to send chat message');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!pc) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div
        className="w-full max-w-md rounded-xl flex flex-col max-h-[80vh]"
        style={{ background: '#111827', border: '1px solid #374151' }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <div>
            <div className="text-sm text-gray-400">Chat with</div>
            <div className="text-white font-semibold text-lg">{pc.name}</div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 px-4 py-3 overflow-y-auto space-y-3 min-h-[200px] max-h-[400px]">
          {loading && (
            <div className="text-xs text-gray-500">Loading conversation…</div>
          )}
          {!loading && messages.length === 0 && (
            <div className="text-xs text-gray-500">
              No messages yet. Start the conversation.
            </div>
          )}
          {messages.map((m) => {
            // The backend now stamps every chat row with a `from` field
            // ("admin" | "client") for both the live WebSocket broadcast
            // and the GET history response. Trust it as the source of
            // truth; the old fallback `to_user_id === null` was wrong
            // because customer broadcasts also have to_user_id null.
            const isFromAdmin = m.from === 'admin';
            const isFromClient = !isFromAdmin;

            return (
              <div
                key={m.id || `${m.timestamp}-${m.from_user_id || ''}`}
                className={`flex flex-col ${isFromAdmin ? 'items-end' : 'items-start'}`}
              >
                <div className="text-[11px] text-gray-500 mb-0.5 flex items-center gap-1">
                  <span className={`font-medium ${isFromClient ? 'text-green-400' : 'text-indigo-400'}`}>
                    {isFromClient ? (m.user_name || 'Client') : 'Admin'}
                  </span>
                  <span>•</span>
                  <span>{new Date(m.timestamp || m.ts || Date.now()).toLocaleTimeString()}</span>
                </div>
                <div
                  className={`inline-block text-sm px-3 py-2 rounded-lg max-w-[85%] whitespace-pre-wrap break-words ${isFromAdmin
                    ? 'bg-indigo-600/80 text-white rounded-br-sm'
                    : 'bg-gray-700/80 text-gray-100 rounded-bl-sm'
                    }`}
                >
                  {m.message}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
        <div className="px-4 py-3 border-t border-gray-700 flex items-center gap-2">
          <textarea
            rows={1}
            className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-400 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="Type a message…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            onClick={sendMessage}
            disabled={sending || !input.trim()}
            className="inline-flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 text-white rounded-lg px-3 py-2 text-sm transition-colors"
          >
            <Send size={16} className="mr-1" />
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;


