import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { X, Send } from 'lucide-react';
import { getApiBase, authHeaders, showToast } from '../utils/api';
import { subscribe as subscribeAdminWs } from '../utils/wsAdmin';
import { formatLocalTime } from '../utils/datetime';

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

    // ChatPanel is opened from two places in the admin UI, each passing
    // a slightly different `pc` prop shape:
    //   1. PCManagement card → full PC row from /api/admin/client_pcs,
    //      with `pc.id` set as an integer.
    //   2. NotificationBell dropdown → a stub built from the WS payload:
    //      `{ client_id, client_name, user_name }` — no `id` field.
    // Without normalising here, opening the panel from the bell left
    // `pc.id` undefined, which made the history filter
    // (`m.pc_id === pc.id`) reject every row → empty chat AND the live
    // WS subscriber rejected every incoming `chat.message` payload via
    // the same comparison → admin saw an empty thread that only
    // populated after close+reopen (because reopening from the card
    // gave the correct pc.id).
    // Number() coerces in case any path stores the id as a string.
    const pcId =
      pc?.id != null ? Number(pc.id)
      : pc?.client_id != null ? Number(pc.client_id)
      : null;

    const base = getApiBase().replace(/\/$/, '');

    const loadHistory = async () => {
      try {
        setLoading(true);
        const res = await axios.get(`${base}/api/chat/`, {
          headers: authHeaders(),
        });
        const all = res.data || [];
        const filtered = all
          .filter((m) => Number(m.pc_id) === pcId)
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

    const unsubscribe = subscribeAdminWs((msg) => {
      if (!msg || msg.event !== 'chat.message') return;
      const payload = msg.payload || {};
      // Same normalisation on the payload side — backend sends
      // `client_id` as the cafe-DB pc_id integer, but defensive
      // Number() coercion guards against any future shape drift.
      const payloadPcId =
        payload.client_id != null ? Number(payload.client_id)
        : payload.pc_id != null ? Number(payload.pc_id)
        : null;
      if (payloadPcId !== pcId) return;

      const incoming = {
        id: payload.message_id || payload.id,
        pc_id: payloadPcId,
        from_user_id: payload.from_user_id,
        to_user_id: payload.to_user_id,
        message: payload.text || payload.message,
        timestamp: new Date((payload.ts || Date.now() / 1000) * 1000).toISOString(),
        from: payload.from,  // 'client' or 'admin'
        user_name: payload.user_name,
      };
      setMessages((prev) => [...prev, incoming]);
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
                  <span>{formatLocalTime(m.timestamp || (m.ts ? m.ts * 1000 : Date.now()))}</span>
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


