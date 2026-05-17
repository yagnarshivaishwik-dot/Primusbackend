import { formatRelative } from '@/utils/format';

export default function NotificationItem({ notification, onRead, onDismiss }) {
  return (
    <div
      style={{
        padding: '12px 14px',
        borderBottom: '1px solid #2E3033',
        background: notification.unread ? 'rgba(232, 54, 79, 0.06)' : 'transparent',
        cursor: 'pointer',
      }}
      onClick={() => onRead && onRead(notification.id)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, color: '#fff', fontSize: 14 }}>{notification.title}</div>
          <div style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>{notification.body}</div>
          <div style={{ color: '#6B7280', fontSize: 11, marginTop: 4 }}>
            {formatRelative(notification.createdAt)}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss && onDismiss(notification.id); }}
          style={{ background: 'transparent', border: 0, color: '#9CA3AF', cursor: 'pointer', fontSize: 16 }}
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}
