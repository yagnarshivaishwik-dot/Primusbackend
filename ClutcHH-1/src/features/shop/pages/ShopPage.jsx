import { useEffect, useMemo, useState, useCallback } from 'react';
import { shopService } from '@/features/shop/services/shopService';
import CashfreePaymentModal from '@/features/shop/components/CashfreePaymentModal';
import useWalletStore from '@/app/store/useWalletStore';
import useSessionStore from '@/app/store/useSessionStore';
import { invoke, hasBridge, listen as listenBridge } from '@/app/bridge/invoke';
import '../../../styles/shop.css';

/**
 * ShopPage — renders the admin-configured time packs from the live backend
 * and drives an end-to-end purchase flow through /api/v1/shop/purchase.
 *
 * Data source: /api/v1/shop/client/packs (with /api/v1/offer/ fallback).
 * Every visible tile comes from the admin's "Shop > Time Packs" editor.
 */
export default function ShopPage() {
  const coins = useWalletStore((s) => s.coins);
  const balance = useWalletStore((s) => s.balance);
  const hydrate = useWalletStore((s) => s.hydrate);
  const user = useSessionStore((s) => s.user);

  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeCategory, setActiveCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [purchasing, setPurchasing] = useState(false);
  const [payment, setPayment] = useState(null); // { amount, packIds[], pcId }

  // Single fetch routine reused by mount + realtime invalidation.
  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await shopService.list();
      setPacks(list);
    } catch (err) {
      setError(err?.message || 'Failed to load shop items.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
    hydrate({});
  }, [hydrate, refetch]);

  // Live admin sync: backend emits `inventory.updated` on every Offer
  // CRUD mutation (see endpoints/offer.py). When we hear it, drop our
  // cached packs and re-fetch — ensures the kiosk shop reflects admin
  // changes without a manual refresh.
  useEffect(() => {
    let unlisten = null;
    let cancelled = false;
    (async () => {
      try {
        const off = await listenBridge('inventory.updated', () => {
          if (!cancelled) refetch();
        });
        if (!cancelled) unlisten = off;
      } catch {
        /* bridge unavailable — kiosk stays static until next reload */
      }
    })();
    return () => {
      cancelled = true;
      if (typeof unlisten === 'function') {
        try {
          unlisten();
        } catch {
          /* ignore */
        }
      }
    };
  }, [refetch]);

  const categories = useMemo(() => {
    const set = new Set(['All']);
    packs.forEach((p) => p.category && set.add(p.category));
    return Array.from(set);
  }, [packs]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return packs.filter((p) => {
      if (activeCategory !== 'All' && p.category !== activeCategory) return false;
      if (q && !p.name.toLowerCase().includes(q) && !(p.description || '').toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [packs, activeCategory, search]);

  const cartTotal = useMemo(
    () => cart.reduce((sum, it) => sum + (it.priceRupees || it.price || 0) * it.quantity, 0),
    [cart],
  );

  const addToCart = (pack) => {
    setFeedback(null);
    setCart((prev) => {
      const existing = prev.find((i) => i.id === pack.id);
      if (existing) return prev.map((i) => (i.id === pack.id ? { ...i, quantity: i.quantity + 1 } : i));
      return [...prev, { ...pack, quantity: 1 }];
    });
  };

  const removeFromCart = (id) => setCart((prev) => prev.filter((i) => i.id !== id));
  const bumpQty = (id, delta) =>
    setCart((prev) =>
      prev
        .map((i) => (i.id === id ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i))
        .filter((i) => i.quantity > 0),
    );

  const resolvePcId = async () => {
    if (!hasBridge()) return null;
    try {
      const creds = await invoke('get_device_credentials');
      return creds?.pc_id ?? null;
    } catch {
      return null;
    }
  };

  const handleCheckout = async () => {
    if (purchasing || cart.length === 0) return;
    if (!user?.id) {
      setFeedback({ type: 'error', text: 'Sign in before checking out.' });
      return;
    }
    const pcId = await resolvePcId();
    if (!pcId) {
      setFeedback({
        type: 'error',
        text: 'Kiosk device is not registered yet — cannot process purchase.',
      });
      return;
    }
    // Open Cashfree UPI QR modal. Server-side webhook will credit the wallet
    // once the user completes payment on their phone; the modal closes on
    // the realtime event (or poll fallback) and we refresh balances here.
    setFeedback(null);
    setPayment({
      amount: cartTotal,
      pcId,
      packIds: cart.map((i) => ({ id: i.id, qty: i.quantity })),
      note: `${cart.length} item${cart.length === 1 ? '' : 's'} (${cart.reduce((n, i) => n + i.quantity, 0)} qty)`,
    });
  };

  const handlePaymentSuccess = async () => {
    // Clear cart + surface positive feedback + pull fresh wallet values.
    setCart([]);
    setPayment(null);
    setFeedback({
      type: 'ok',
      text: 'Payment received. Your balance has been updated.',
    });
    try {
      await hydrate({});
    } catch {
      /* ignore — the realtime wallet_updated event already nudged the store */
    }
  };

  const handlePaymentClose = () => {
    setPayment(null);
  };

  return (
    <div className="shop-page">
      <div className="app">
        <aside className="sidebar">
          <h2 className="sidebar-title">Browse by Category</h2>
          <nav>
            <ul className="sidebar-nav">
              {categories.map((c) => (
                <li
                  key={c}
                  className={`sidebar-item ${activeCategory === c ? 'active' : ''}`}
                  onClick={() => setActiveCategory(c)}
                >
                  {c}
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <main className="main-content">
          <input
            type="text"
            className="search-bar"
            placeholder="Search time packs, products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {feedback && (
            <div
              role="status"
              style={{
                margin: '12px 0',
                padding: '10px 14px',
                borderRadius: 10,
                fontSize: 13,
                background:
                  feedback.type === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                border: `1px solid ${feedback.type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
                color: feedback.type === 'error' ? '#fca5a5' : '#86efac',
              }}
            >
              {feedback.text}
            </div>
          )}

          <section className="section sectionBg">
            <div className="section-header">
              <h2 className="section-title">
                {activeCategory === 'All' ? 'All packs' : activeCategory}
              </h2>
              <div className="section-nav">
                <span style={{ color: '#9CA3AF', fontSize: 12 }}>
                  {visible.length} available
                </span>
              </div>
            </div>

            {loading && <div style={{ color: '#9CA3AF' }}>Loading shop…</div>}
            {error && !loading && <div style={{ color: '#fca5a5' }}>{error}</div>}
            {!loading && !error && visible.length === 0 && (
              <div style={{ color: '#9CA3AF' }}>
                No packs configured by admin yet. Add packs in the admin panel and they'll show up here.
              </div>
            )}

            {!loading && !error && visible.length > 0 && (
              <div className="product-grid">
                {visible.map((pack) => {
                  const inCart = cart.some((i) => i.id === pack.id);
                  const hasDiscount =
                    pack.discountPercent > 0 &&
                    pack.listPrice &&
                    pack.listPrice !== pack.price;
                  return (
                    <div key={pack.id} className="product-card">
                      <div
                        className="product-image"
                        style={{
                          background: pack.thumbnailUrl
                            ? `center/cover url("${pack.thumbnailUrl}")`
                            : '#1f2937',
                        }}
                      >
                        {pack.badge && (
                          <span className="product-badge">{pack.badge}</span>
                        )}
                        {!pack.thumbnailUrl && (
                          <span
                            className="product-icon"
                            role="img"
                            aria-label="pack"
                          >
                            {typeof pack.icon === 'string' && pack.icon.length <= 2
                              ? pack.icon
                              : '⏱'}
                          </span>
                        )}
                      </div>
                      <div className="product-info">
                        <h3 className="product-name">{pack.name}</h3>
                        {pack.description && (
                          <p
                            style={{
                              fontSize: 12,
                              color: '#9CA3AF',
                              marginTop: 2,
                              marginBottom: 4,
                            }}
                          >
                            {pack.description}
                          </p>
                        )}
                        <p className="product-price">
                          {hasDiscount && (
                            <span
                              style={{
                                color: '#9CA3AF',
                                textDecoration: 'line-through',
                                marginRight: 6,
                                fontSize: 13,
                              }}
                            >
                              ₹{Number(pack.listPrice).toLocaleString()}
                            </span>
                          )}
                          ₹{Number(pack.price || 0).toLocaleString()} ·{' '}
                          {pack.minutes} min
                          {pack.bonusMinutes > 0 && (
                            <span
                              style={{
                                color: '#34d399',
                                fontSize: 12,
                                marginLeft: 6,
                              }}
                            >
                              +{pack.bonusMinutes} bonus
                            </span>
                          )}
                        </p>
                        {pack.taxPercent > 0 && (
                          <p
                            style={{
                              fontSize: 11,
                              color: '#6B7280',
                              marginTop: -2,
                              marginBottom: 4,
                            }}
                          >
                            Inclusive of {pack.taxPercent}% GST
                          </p>
                        )}
                        <button
                          type="button"
                          className={`add-to-cart-btn ${inCart ? 'added' : ''}`}
                          onClick={() => addToCart(pack)}
                        >
                          {inCart ? '✓ Added' : 'Add to Cart'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </main>

        <aside className="right-panel">
          <div className="balance-section">
            <p className="balance-label">Your Balance</p>
            <div className="balance-amount">
              <span className="coin-icon">🪙</span>
              <span>{(coins ?? 0).toLocaleString()}</span>
            </div>
            <p style={{ color: '#9CA3AF', fontSize: 12, margin: '4px 0' }}>
              ₹ {Number(balance ?? 0).toLocaleString()} cash balance
            </p>
            <button type="button" className="add-coins-btn" disabled>
              Top up (ask staff)
            </button>
          </div>

          <div className="cart-section">
            <div className="cart-header">
              <h3 className="cart-title">Cart</h3>
              <span className="cart-count">{cart.length}</span>
            </div>

            {cart.length === 0 && (
              <div style={{ color: '#9CA3AF', fontSize: 13, padding: '10px 0' }}>
                Cart is empty — add a pack to get started.
              </div>
            )}

            {cart.map((item) => (
              <div key={item.id} className="cart-item">
                <div className="cart-item-icon">
                  {typeof item.icon === 'string' && item.icon.length <= 2 ? item.icon : '⏱'}
                </div>
                <div className="cart-item-details">
                  <p className="cart-item-name">{item.name}</p>
                  <p className="cart-item-price">
                    ₹{Number(item.priceRupees || item.price || 0).toLocaleString()}
                  </p>
                </div>
                <div className="cart-item-actions">
                  <button
                    type="button"
                    className="cart-item-remove"
                    onClick={() => removeFromCart(item.id)}
                    aria-label="Remove from cart"
                  >
                    ×
                  </button>
                  <div className="cart-item-quantity">
                    <button
                      type="button"
                      className="quantity-btn"
                      onClick={() => bumpQty(item.id, -1)}
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <span>{item.quantity}</span>
                    <button
                      type="button"
                      className="quantity-btn"
                      onClick={() => bumpQty(item.id, 1)}
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            ))}

            <div className="cart-total">
              <span className="total-label">Total</span>
              <span className="total-amount">₹ {cartTotal.toLocaleString()}</span>
            </div>

            <button
              type="button"
              className="checkout-btn"
              disabled={cart.length === 0 || purchasing || !!payment}
              onClick={handleCheckout}
            >
              {payment ? 'Awaiting payment…' : purchasing ? 'Starting…' : 'Pay with UPI'}
            </button>
          </div>
        </aside>
      </div>

      {payment && (
        <CashfreePaymentModal
          amount={payment.amount}
          pcId={payment.pcId}
          packId={payment.packIds?.[0]?.id}
          note={payment.note}
          onSuccess={handlePaymentSuccess}
          onClose={handlePaymentClose}
        />
      )}
    </div>
  );
}
