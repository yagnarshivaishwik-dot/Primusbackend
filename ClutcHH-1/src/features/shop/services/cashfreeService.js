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

/**
 * Create a Cashfree Payment Link with a dynamic amount.
 *
 * Used when the embedded-checkout flow is blocked by the pending
 * merchant-domain whitelist. The backend returns a hosted-checkout URL
 * plus a base64 PNG QR data URI; the kiosk shows the QR and the customer
 * scans + pays on their phone. PAYMENT_SUCCESS_WEBHOOK fires the same
 * way as for orders.
 *
 * Same input shape as createOrder() so the modal can branch on a single
 * runtime flag.
 *
 * @returns {Promise<{
 *   link_id: string,
 *   cf_link_id: string,
 *   link_url: string,
 *   qr_data_uri: string | null,
 *   amount: number,
 *   expiry: string,
 *   status: string,
 * }>}
 */
export function createPaymentLink({ amount, pcId, packId, note }) {
  return apiPost('/api/v1/payment/cashfree/create-payment-link', {
    amount: Number(amount),
    pc_id: pcId ?? null,
    pack_id: packId ?? null,
    note: note || null,
  });
}

/**
 * Poll a Payment Link's status. Returned shape mirrors getOrderStatus
 * so the modal's polling loop is identical for both flows.
 *
 * @param {string} linkId
 * @returns {Promise<{link_id:string, status:string, amount:number, amount_paid:number, paid:boolean}>}
 */
export function getLinkStatus(linkId) {
  return apiGet(`/api/v1/payment/cashfree/link/${linkId}`);
}
