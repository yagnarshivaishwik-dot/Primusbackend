/**
 * Cashfree payment client for NoLag kiosk.
 *
 * Inventory v2 (Phase 4) — switched from SDK iframe to hosted-checkout
 * URL opened in a child WebView2 to bypass Cashfree's parent-origin
 * verification (which rejects the kiosk's virtual host
 * `kiosk.primustech.in`). The backend now returns a `payment_link` field
 * pointing at https://payments.cashfree.com/pg/view/sessions/checkout/web/...
 * The C# host opens that URL in a borderless, topmost child WebView and
 * intercepts the return URL to close itself.
 */

import { apiGet, apiPost } from '@/app/api/client';

/**
 * Create a new Cashfree order.
 * @param {{amount:number, pcId?:number|null, packId?:string|number|null, note?:string}} params
 * @returns {Promise<{
 *   order_id:string,
 *   payment_session_id:string,
 *   payment_link:string,
 *   environment:string,
 *   qr_data_uri:string|null,
 *   upi_link:string|null,
 *   amount:number,
 *   currency:string,
 *   status:string
 * }>}
 */
export function createOrder({ amount, pcId, packId, note }) {
  return apiPost('/api/v1/payment/cashfree/create-order', {
    amount: Number(amount),
    pc_id: pcId ?? null,
    pack_id: packId ?? null,
    note: note || null,
  });
}

/**
 * Poll the current Cashfree order status. Used as a fallback when the
 * realtime `payment_confirmed` event doesn't arrive.
 * @param {string} orderId
 * @returns {Promise<{order_id:string, status:string, amount:number, paid:boolean}>}
 */
export function getOrderStatus(orderId) {
  return apiGet(`/api/v1/payment/cashfree/order/${orderId}`);
}
