import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MdChat, MdClose, MdSend } from 'react-icons/md';

import { listen as listenBridge } from '@/app/bridge/invoke';
import useSessionStore from '@/app/store/useSessionStore';
import { chatService } from '../services/chatService';

import './ChatWidget.css';

/**
 * ChatWidget — kiosk-side counterpart to admin's ChatPanel.
 *
 * Behaviour:
 *  - Floating bubble bottom-right. Shows unread badge when closed.
 *  - Click → opens panel: scrollable message list + input.
 *  - Incoming messages arrive via the C# bridge event `chat_message`
 *    (published by `PrimusWebSocketClient` → `JsBridge.PostEvent`).
 *  - Outgoing messages POST to `/api/chat/` with the customer's JWT.
 *
 * This widget is only rendered when:
 *   1. The kiosk has been provisioned (we know our pcId), and
 *   2. A user is logged in (so we have a JWT to send messages).
 * It's mounted at App level so it persists across route changes.
 */
export default function ChatWidget({ pcId }) {
  const user = useSessionStore((s) => s.user);

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);

  const listEndRef = useRef(null);

  const showWidget = !!user && !!pcId;

  // Merge-by-id helper: history wins for stored rows; optimistic local
  // sends are kept ONLY if the backend hasn't confirmed them yet.
  //
  // An optimistic "local-…" row is considered confirmed (and dropped) if
  // history contains any row with the same text + same from_user_id.
  // No timestamp comparison: the kiosk's local clock and the server clock
  // diverge enough (UTC vs IST display, NTP skew) that a time-window check
  // misclassifies the echo as a separate message and the same text renders
  // twice. Content+sender alone is sufficient because the customer can't
  // queue two identical messages faster than the optimistic insert clears.
  const mergeHistory = useCallback((history) => {
    setMessages((prev) => {
      const byId = new Map();
      for (const m of history) byId.set(String(m.id), m);
      for (const m of prev) {
        const key = String(m.id);
        if (!key.startsWith('local-')) continue;
        if (byId.has(key)) continue;
        const confirmed = history.some(
          (h) =>
            h.message === m.message
            && (h.from_user_id ?? null) === (m.from_user_id ?? null),
        );
        if (!confirmed) byId.set(key, m);
      }
      return Array.from(byId.values());
    });
  }, []);

  // First-mount load: also re-runs on user change so a session swap doesn't
  // leak the previous customer's chat into view.
  useEffect(() => {
    if (!showWidget) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const history = await chatService.list(pcId);
        if (!cancelled) mergeHistory(history);
      } catch {
        /* network errors are non-fatal */
      }
    })();
    return () => { cancelled = true; };
  }, [showWidget, pcId, user?.id, mergeHistory]);

  // Refresh whenever the panel is reopened — catches any messages that
  // arrived while WS was briefly disconnected or were missed before the
  // C# bridge finished wiring up after a relaunch.
  useEffect(() => {
    if (!showWidget || !open) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const history = await chatService.list(pcId);
        if (!cancelled) mergeHistory(history);
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, [showWidget, pcId, open, mergeHistory]);

  // Subscribe to admin → kiosk pushes. We treat the bridge event purely
  // as a "something changed — pull fresh history" signal. Why: the kiosk's
  // C# `ChatMessageDto` is currently stuck on an old payload shape
  // (sender/body/from_admin) while the backend sends the modern shape
  // (text/from/message_id), so the live DTO arrives with empty fields.
  // Refetching from `/api/chat/` after each WS ping is self-healing and
  // gives us the authoritative row, including the real `from` attribution,
  // regardless of what the bridge stripped out.
  useEffect(() => {
    if (!showWidget) return undefined;
    let off = null;
    let inflight = false;
    const refresh = async () => {
      if (inflight) return;
      inflight = true;
      try {
        const history = await chatService.list(pcId);
        mergeHistory(history);
        // If the panel is closed and the newest row is from admin,
        // bump the unread badge so the customer notices.
        const latest = history[history.length - 1];
        if (latest && latest.from === 'admin' && !open) {
          setUnread((n) => n + 1);
        }
      } catch {
        /* ignore — next WS ping or panel-open will retry */
      } finally {
        inflight = false;
      }
    };
    (async () => {
      try {
        off = await listenBridge('chat_message', () => { refresh(); });
      } catch {
        /* bridge unavailable (browser dev) — silently no-op */
      }
    })();
    return () => {
      if (typeof off === 'function') {
        try { off(); } catch { /* ignore */ }
      }
    };
  }, [showWidget, pcId, open, mergeHistory]);

  // Auto-scroll to bottom on every new message.
  useEffect(() => {
    if (open) {
      listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open]);

  // Clear unread when the user opens the panel.
  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || !pcId || sending) return;
    setSending(true);

    // Optimistic insert so the customer sees their message immediately,
    // even before the WS echo arrives.
    const optimistic = {
      id: `local-${Date.now()}`,
      pc_id: pcId,
      from_user_id: user?.id ?? null,
      message: text,
      timestamp: new Date().toISOString(),
      from: 'client',
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft('');

    try {
      await chatService.send({ pcId, message: text });
    } catch {
      // Mark the optimistic message as failed so the customer knows.
      setMessages((prev) =>
        prev.map((m) =>
          m.id === optimistic.id ? { ...m, failed: true } : m,
        ),
      );
    } finally {
      setSending(false);
    }
  }, [draft, pcId, sending, user?.id]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const sorted = useMemo(
    () =>
      [...messages].sort(
        (a, b) =>
          new Date(a.timestamp || 0).getTime() -
          new Date(b.timestamp || 0).getTime(),
      ),
    [messages],
  );

  if (!showWidget) return null;

  return (
    <>
      {/* Floating launcher */}
      {!open && (
        <button
          type="button"
          className="chatwidget-launcher glassyfinish"
          aria-label="Open chat with cafe staff"
          onClick={() => setOpen(true)}
        >
          <MdChat />
          {unread > 0 && (
            <span className="chatwidget-badge" aria-label={`${unread} unread messages`}>
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          className="chatwidget-panel"
          role="dialog"
          aria-label="Chat with cafe staff"
        >
          <div className="chatwidget-header">
            <div>
              <div className="chatwidget-title">Cafe Support</div>
              <div className="chatwidget-subtitle">We usually reply in a few minutes</div>
            </div>
            <button
              type="button"
              className="chatwidget-close"
              aria-label="Close chat"
              onClick={() => setOpen(false)}
            >
              <MdClose />
            </button>
          </div>

          <div className="chatwidget-thread">
            {sorted.length === 0 && (
              <div className="chatwidget-empty">
                Say hi — staff will get back to you shortly.
              </div>
            )}
            {sorted.map((m) => {
              // Backend (post-fix) stamps every message with `from`. Use it
              // as primary truth. Fall back to id comparison only for the
              // optimistic local insert where `from` is set to 'client'
              // before the WS echo arrives.
              const mine =
                m.from === 'client'
                || (m.from === undefined && m.from_user_id === user?.id);
              return (
                <div
                  key={m.id}
                  className={`chatwidget-bubble ${mine ? 'chatwidget-bubble--mine' : 'chatwidget-bubble--theirs'}${m.failed ? ' chatwidget-bubble--failed' : ''}`}
                >
                  <div className="chatwidget-bubble-text">{m.message}</div>
                  <div className="chatwidget-bubble-meta">
                    {new Date(m.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {m.failed ? ' • failed to send' : ''}
                  </div>
                </div>
              );
            })}
            <div ref={listEndRef} />
          </div>

          <div className="chatwidget-input">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Type a message…"
              maxLength={5000}
              disabled={sending}
            />
            <button
              type="button"
              className="chatwidget-send"
              onClick={send}
              disabled={!draft.trim() || sending}
              aria-label="Send message"
            >
              <MdSend />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
