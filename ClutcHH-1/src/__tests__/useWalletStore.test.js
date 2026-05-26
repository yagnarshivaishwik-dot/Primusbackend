/**
 * Tests for the kiosk wallet zustand store.
 *
 * Forensic audit M19 + BUG #13 frontend mirror: the store must stay
 * consistent when realtime events arrive after a manual mutation. We
 * test the public surface (hydrate, applyWalletEvent, applyTimeEvent,
 * tickDown) without mocking the SUT itself.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/features/wallet/services/walletService', () => ({
  getBalance: vi.fn().mockResolvedValue({ balance: 250, coins: 30 }),
  estimateTimeLeft: vi.fn().mockResolvedValue({ minutes: 45 }),
}));

import useWalletStore from '@/app/store/useWalletStore.js';

const resetStore = () => {
  // Manually rewind because zustand has no .reset() helper.
  useWalletStore.setState({
    balance: 0,
    coins: 0,
    minutesLeft: 0,
    loaded: false,
  });
};

describe('useWalletStore', () => {
  beforeEach(() => {
    resetStore();
  });

  it('hydrate() populates balance/coins/minutesLeft from the API', async () => {
    await useWalletStore.getState().hydrate({ pcId: 1 });

    const s = useWalletStore.getState();
    expect(s.loaded).toBe(true);
    expect(s.balance).toBe(250);
    expect(s.coins).toBe(30);
    expect(s.minutesLeft).toBe(45);
  });

  it('applyWalletEvent merges balance/coins immutably', () => {
    useWalletStore.setState({ balance: 100, coins: 10 });
    useWalletStore.getState().applyWalletEvent({ balance: 175 });

    expect(useWalletStore.getState().balance).toBe(175);
    expect(useWalletStore.getState().coins).toBe(10);
  });

  it('applyTimeEvent converts seconds → floored minutes and clamps at 0', () => {
    useWalletStore.getState().applyTimeEvent({ remaining_seconds: 305 });
    expect(useWalletStore.getState().minutesLeft).toBe(5); // floor(305/60)

    useWalletStore.getState().applyTimeEvent({ remaining_seconds: -50 });
    expect(useWalletStore.getState().minutesLeft).toBe(0);
  });

  it('tickDown decrements minutesLeft but never goes below 0', () => {
    useWalletStore.setState({ minutesLeft: 2 });
    useWalletStore.getState().tickDown();
    expect(useWalletStore.getState().minutesLeft).toBe(1);
    useWalletStore.getState().tickDown();
    useWalletStore.getState().tickDown();
    expect(useWalletStore.getState().minutesLeft).toBe(0);
  });
});
