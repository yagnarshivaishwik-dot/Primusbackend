import useUIStore from '@/app/store/useUIStore';
import useNotificationsStore from '@/app/store/useNotificationsStore';
import NotificationItem from '@/features/notifications/components/NotificationItem';

export default function NotificationsPanel() {
  const { notificationsOpen, closeNotifications } = useUIStore();
  const { items, markRead, markAllRead, dismiss } = useNotificationsStore();

  if (!notificationsOpen) return null;

  return (
    <>
      <div
        onClick={closeNotifications}
        style={{ position: 'fixed', inset: 0, zIndex: 399, background: 'rgba(0,0,0,0.25)' }}
      />
      <aside
        style={{
          position: 'fixed',
          top: 56,
          right: 12,
          width: 360,
          maxHeight: 'calc(100vh - 80px)',
          overflowY: 'auto',
          background: '#1a1a2e',
          border: '1px solid #3a3d42',
          borderRadius: 12,
          zIndex: 400,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 16px',
            borderBottom: '1px solid #2E3033',
            color: '#fff',
          }}
        >
          <strong>Notifications</strong>
          <button
            onClick={markAllRead}
            style={{ background: 'transparent', border: 0, color: '#E8364F', cursor: 'pointer', fontSize: 12 }}
          >
            Mark all read
          </button>
        </div>
        {items.length === 0 ? (
          <div style={{ padding: 24, color: '#9CA3AF', textAlign: 'center' }}>All caught up!</div>
        ) : (
          items.map((n) => (
            <NotificationItem
              key={n.id}
              notification={n}
              onRead={markRead}
              onDismiss={dismiss}
            />
          ))
        )}
      </aside>
    </>
  );
}
