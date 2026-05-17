import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { IoSettingsOutline } from "react-icons/io5";
import { MdOutlineCurrencyRupee } from "react-icons/md";

import { shopService } from "@/features/shop/services/shopService";
import CashfreePaymentModal from "@/features/shop/components/CashfreePaymentModal";
import useWalletStore from "@/app/store/useWalletStore";
import useSessionStore from "@/app/store/useSessionStore";
import { invoke, hasBridge, listen as listenBridge } from "@/app/bridge/invoke";
import { ROUTES } from "@/app/routes/paths";

import ShopCarousel from "@/features/ShopCarousel/ShopCarousel";

import "./ShopPage.css";

/**
 * ShopPage — Pavan's NoLag design, with real backend data plugged in.
 *
 * Visual structure is Pavan's verbatim. Only the hardcoded values have
 * been swapped for live state:
 *   - "49:22:21"  →  --:--:--  (session timer; backend hookup TBD)
 *   - "ClutcHH"   →  "NoLag"   (logo)
 *   - "JD"        →  current user's initials
 *   - "3,200"     →  useWalletStore balance
 *   - 4× Coca-Cola  →  real cart state from addToCart()
 *   - "14550 / 14750" subtotal/balance after  →  computed from cart
 *   - 4× <ShopCarousel />  →  one <ShopCarousel packs={packs} ... />
 *
 * Backend services from ClutcHH-1 are reused as-is (shopService.list,
 * useWalletStore, CashfreePaymentModal, bridge invoke). No design changes.
 */
export default function ShopPage() {
  const navigate = useNavigate();
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
  const [cart, setCart] = useState([]);
  const [payment, setPayment] = useState(null);

  // Live fetch + admin sync
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
      setError(err?.message || "Failed to load shop items.");
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
        const off = await listenBridge("inventory.updated", () => {
        const off = await listenBridge('inventory.updated', () => {
          if (!cancelled) refetch();
        });
        if (!cancelled) unlisten = off;
      } catch {
        /* bridge unavailable in browser dev */
        /* bridge unavailable — kiosk stays static until next reload */
      }
    })();
    return () => {
      cancelled = true;
      if (typeof unlisten === "function") {
        try { unlisten(); } catch { /* ignore */ }
      if (typeof unlisten === 'function') {
        try {
          unlisten();
        } catch {
          /* ignore */
        }
      }
    };
  }, [refetch]);

  // Cart logic
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
  const balanceAfter = useMemo(
    () => Math.max(0, Number(balance || 0) - cartTotal),
    [balance, cartTotal],
  );

  const addToCart = (pack) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === pack.id);
      if (existing) {
        return prev.map((i) =>
          i.id === pack.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }

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
      const creds = await invoke("get_device_credentials");
      const creds = await invoke('get_device_credentials');
      return creds?.pc_id ?? null;
    } catch {
      return null;
    }
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    if (!user?.id) return;
    const pcId = await resolvePcId();
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
      note: `${cart.length} item${cart.length === 1 ? "" : "s"}`,
      note: `${cart.length} item${cart.length === 1 ? '' : 's'} (${cart.reduce((n, i) => n + i.quantity, 0)} qty)`,
    });
  };

  const handlePaymentSuccess = async () => {
    setCart([]);
    setPayment(null);
    try { await hydrate({}); } catch { /* ignore */ }
  };

  const handlePaymentClose = () => setPayment(null);

  // Display helpers
  const userInitials = useMemo(() => {
    const name = user?.name || user?.email || "";
    if (!name) return "U";
    const parts = name.split(/[\s@.]+/).filter(Boolean);
    return (parts[0]?.[0] || "U").toUpperCase() + (parts[1]?.[0] || "").toUpperCase();
  }, [user]);

  const totalItems = cart.reduce((n, i) => n + i.quantity, 0);

  // ── Pavan's JSX structure, verbatim where possible ─────────────────────
  return (
    <div className='ShopContainer'>
      <div className='cartheader glassyfinish'>
        <div className="sessionbadge">
          <div className="indicator"></div>
          <p>SESSION &nbsp;<span>--:--:--</span></p>
        </div>
        <div className="shoplogo">No<span>Lag</span></div>
        <div className="headerright">
          <div
            className="iconbtn"
            role="button"
            tabIndex={0}
            title="Settings"
            onClick={() => navigate(ROUTES.settingsHelp)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(ROUTES.settingsHelp); }}
          >
            <IoSettingsOutline />
          </div>
          <div
            className="useravatar"
            role="button"
            tabIndex={0}
            title="Profile"
            onClick={() => navigate(ROUTES.mainProfile)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(ROUTES.mainProfile); }}
          >
            {userInitials}
          </div>
        </div>
      </div>
      <div className='cartpannel'>
        <div className='cartleft'>
          {loading && <div style={{ padding: 40, color: '#A7A7A7' }}>Loading shop…</div>}
          {error && !loading && <div style={{ padding: 40, color: '#fca5a5' }}>{error}</div>}
          {!loading && !error && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <ShopCarousel
                title="Time Packs"
                packs={packs.filter((p) => (p.minutes || 0) > 0)}
                onAddToCart={addToCart}
              />
              <ShopCarousel
                title="Snacks & Drinks"
                packs={packs.filter((p) => (p.minutes || 0) === 0)}
                onAddToCart={addToCart}
              />
            </div>
          )}
        </div>
        <div className='cartright'>
          <div className="walletcard glassyfinish">
            <h3 className="wallettitle">WALLET BALANCE</h3>
            <h1 className="walletamount"><span><MdOutlineCurrencyRupee /></span>{Number(balance ?? 0).toLocaleString()}</h1>
            <p className="walletsubtitle">{balance > 0 ? 'Last recharge: recent' : 'No recharges yet'}</p>
            <button className="walletadd">
              <span>+</span>
              <p>Add Coins</p>
            </button>
          </div>
          <div className="cartcard glassyfinish">
            <div className='carttop'>
              <div className='cratheading'>Cart</div>
              <div className='cartquantity'>{totalItems} items</div>
            </div>

            {cart.length === 0 && (
              <div style={{ padding: 20, color: '#A7A7A7', fontSize: 13, textAlign: 'center' }}>
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
              <div key={item.id} className='cartlistitem'>
                <div className='cartlistitemleft'>
                  <div className='cartlistimg'>
                    {item.thumbnailUrl ? (
                      <img src={item.thumbnailUrl} alt={item.name} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)' }}>⏱</div>
                    )}
                  </div>
                  <div className='cartlistname'>
                    <h5>{item.name}</h5>
                    <p><span><MdOutlineCurrencyRupee /></span>{Number(item.priceRupees || item.price || 0).toLocaleString()}</p>
                  </div>
                </div>

                <div className='listquantity'>
                  <span onClick={() => bumpQty(item.id, -1)}>-</span>
                  <p>{item.quantity}</p>
                  <span onClick={() => bumpQty(item.id, +1)}>+</span>
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

            <div className="cartcheckout">
              <div className='totalcost'>
                <div className='costleft'>
                  <h5>Subtotal </h5>
                  <p>Balance after </p>
                </div>
                <div className='costright'>
                  <h5>{cartTotal.toLocaleString()}</h5>
                  <p>{balanceAfter.toLocaleString()}</p>
                </div>
              </div>
              <button disabled={cart.length === 0 || !!payment} onClick={handleCheckout}>
                {payment ? 'Awaiting payment…' : 'Checkout'}
              </button>
            </div>
          </div>
        </div>
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
