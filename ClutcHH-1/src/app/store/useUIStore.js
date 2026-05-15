import { create } from 'zustand';

const useUIStore = create((set) => ({
  sidebarOpen: true,
  trackingModalOpen: false,
  notificationsOpen: false,

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  openTrackingModal: () => set({ trackingModalOpen: true }),
  closeTrackingModal: () => set({ trackingModalOpen: false }),

  openNotifications: () => set({ notificationsOpen: true }),
  closeNotifications: () => set({ notificationsOpen: false }),
  toggleNotifications: () => set((s) => ({ notificationsOpen: !s.notificationsOpen })),
}));

export default useUIStore;
