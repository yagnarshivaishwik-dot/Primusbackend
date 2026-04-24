import React, { useEffect, useState, useRef } from 'react';
import { Bell } from 'lucide-react';
import { subscribeNotifications, markNotificationsReadForClient } from '../store/notificationsStore';
import { subscribe as subscribeAdminWs } from '../utils/wsAdmin';

const NotificationBell = ({ onOpenThread }) => {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const unsubStore = subscribeNotifications(setNotifications);

    const unsubWs = subscribeAdminWs((msg) => {
      if (!msg || msg.event !== 'chat.message') return;
      const payload = msg.payload || {};
      const id = payload.message_id || payload.id;
      const clientId = payload.client_id;
      const clientName = payload.client_name || `PC-${clientId || ''}`;
      const userName = payload.user_name || 'Guest';
      const text = payload.text || payload.message || '';
      const ts = msg.ts || payload.ts || Math.floor(Date.now() / 1000);

      // When a thread for this client is open, ChatThread will handle it; we still
      // add a notification but allow the parent to clear it on open.
      if (text) {
        // dynamic import avoids potential circular deps
        import('../store/notificationsStore').then((mod) => {
          mod.addNotification({
            id,
            type: 'chat',
            client_id: clientId,
            client_name: clientName,
            user_name: userName,
            preview: text,
            ts,
          });
        });
      }
    });

    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      unsubStore && unsubStore();
      unsubWs && unsubWs();
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleItemClick = (n) => {
    setOpen(false);
    if (n.client_id && onOpenThread) {
      onOpenThread({
        client_id: n.client_id,
        client_name: n.client_name,
        user_name: n.user_name,
      });
      markNotificationsReadForClient(n.client_id);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        className="text-gray-400 hover:text-white relative"
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={24} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
            {unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div
          className="absolute right-0 mt-3 w-80 rounded-lg shadow-xl z-50"
          style={{ background: '#111827', border: '1px solid #374151' }}
        >
          <div className="px-3 py-2 border-b border-gray-700 text-xs text-gray-400">
            Notifications
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 && (
              <div className="px-4 py-3 text-xs text-gray-500">
                No notifications yet.
              </div>
            )}
            {notifications.map((n) => (
              <button
                key={n.id}
                className={`w-full text-left px-4 py-2 text-sm border-b border-gray-800 last:border-b-0 hover:bg-gray-800/60 ${
                  n.read ? 'text-gray-400' : 'text-gray-100'
                }`}
                onClick={() => handleItemClick(n)}
              >
                <div className="font-semibold text-white text-xs mb-0.5">
                  {n.client_name || 'Unknown PC'}{' '}
                  {n.user_name ? `— ${n.user_name}` : ''}
                </div>
                {n.preview && (
                  <div className="text-xs text-gray-300 truncate">{n.preview}</div>
                )}
                <div className="text-[10px] text-gray-500 mt-0.5">
                  {new Date(n.ts * 1000).toLocaleTimeString()}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;


