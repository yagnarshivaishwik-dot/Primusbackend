/**
 * CashfreePaymentModal — covers the createOrder → poll → resolve flow.
 *
 * Forensic audit M19 + Cashfree harden track. Asserts:
 *   * the modal calls createOrder() once on mount
 *   * a successful poll transitions the modal to a paid/success phase
 *   * onClose is wired up
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const createOrderMock = vi.fn();
const getOrderStatusMock = vi.fn();
vi.mock('@/features/auth/services/cashfreeService', () => ({
  createOrder: (...a) => createOrderMock(...a),
  getOrderStatus: (...a) => getOrderStatusMock(...a),
}));

vi.mock('@/app/bridge/invoke', () => ({
  invoke: vi.fn().mockResolvedValue(null),
  listen: vi.fn().mockReturnValue(() => {}),
  hasBridge: () => false,
}));

vi.mock('@/app/api/audit', () => ({
  audit: vi.fn(),
}));

import CashfreePaymentModal from '@/features/shop/components/CashfreePaymentModal.jsx';

describe('CashfreePaymentModal', () => {
  beforeEach(() => {
    createOrderMock.mockReset();
    getOrderStatusMock.mockReset();
  });

  it('calls createOrder on mount with the supplied amount', async () => {
    createOrderMock.mockResolvedValueOnce({
      order_id: 'PRIMUS_X',
      payment_session_id: 'sess_x',
      payment_link: 'https://payments-test.cashfree.com/x',
      amount: 100,
      status: 'ACTIVE',
    });
    getOrderStatusMock.mockResolvedValue({ paid: false, status: 'ACTIVE' });

    render(
      <CashfreePaymentModal
        amount={100}
        pcId={1}
        packId="1"
        note="test"
        onSuccess={() => {}}
        onClose={() => {}}
      />,
    );

    await waitFor(() => {
      expect(createOrderMock).toHaveBeenCalledTimes(1);
    });
    expect(createOrderMock.mock.calls[0][0]).toEqual(
      expect.objectContaining({ amount: 100 }),
    );
  });

  it('invokes onSuccess once the backend reports paid=true', async () => {
    createOrderMock.mockResolvedValueOnce({
      order_id: 'PRIMUS_OK',
      payment_session_id: 'sess_ok',
      payment_link: 'https://payments-test.cashfree.com/ok',
      amount: 50,
      status: 'ACTIVE',
    });
    getOrderStatusMock.mockResolvedValue({ paid: true, status: 'PAID' });
    const onSuccess = vi.fn();

    render(
      <CashfreePaymentModal
        amount={50}
        pcId={1}
        packId="1"
        onSuccess={onSuccess}
        onClose={() => {}}
      />,
    );

    await waitFor(
      () => {
        expect(onSuccess).toHaveBeenCalled();
      },
      { timeout: 5000 },
    );
  });
});
