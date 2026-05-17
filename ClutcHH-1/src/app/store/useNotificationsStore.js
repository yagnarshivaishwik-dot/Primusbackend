import { create } from 'zustand';

const seed = [
  {
    id: 'n1',
    title: 'Daily check-in ready',
    body: 'Claim 25 coins + 50 XP for today.',
    unread: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
  },
  {
    id: 'n2',
    title: 'Streak Master at 86%',
    body: 'One more day for 750 coins.',
    unread: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },
  {
    id: 'n3',
    title: 'Friday Night LAN',
    body: 'Seats filling up — reserve yours.',
    unread: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
  },
];

const useNotificationsStore = create((set) => ({
  items: seed,
  unreadCount: seed.filter((n) => n.unread).length,

  markAllRead: () =>
    set((s) => ({
      items: s.items.map((n) => ({ ...n, unread: false })),
      unreadCount: 0,
    })),

  markRead: (id) =>
    set((s) => {
      const items = s.items.map((n) =>
        n.id === id ? { ...n, unread: false } : n,
      );
      return { items, unreadCount: items.filter((n) => n.unread).length };
    }),

  dismiss: (id) =>
    set((s) => {
      const items = s.items.filter((n) => n.id !== id);
      return { items, unreadCount: items.filter((n) => n.unread).length };
    }),
}));

export default useNotificationsStore;
