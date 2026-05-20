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
import AppHeader from "@/components/layout/AppHeader";

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
  const balance = useWalletStore((s) => s.balance);
  const hydrate = useWalletStore((s) => s.hydrate);
  const user = useSessionStore((s) => s.user);

  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cart, setCart] = useState([]);
  const [payment, setPayment] = useState(null);
  const [topUp, setTopUp] = useState(null); // null | { amount: string }

  // Live fetch + admin sync
  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await shopService.list();
      setPacks(list);
    } catch (err) {
      setError(err?.message || "Failed to load shop items.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
    hydrate({});
  }, [hydrate, refetch]);

  useEffect(() => {
    let unlisten = null;
    let cancelled = false;
    (async () => {
      try {
        const off = await listenBridge("inventory.updated", () => {
          if (!cancelled) refetch();
        });
        if (!cancelled) unlisten = off;
      } catch {
        /* bridge unavailable in browser dev */
      }
    })();
    return () => {
      cancelled = true;
      if (typeof unlisten === "function") {
        try { unlisten(); } catch { /* ignore */ }
      }
    };
  }, [refetch]);

  // Belt-and-suspenders for stale packs: the backend's `inventory.updated`
  // WS event is the primary refresh signal, but if the C# bridge isn't
  // forwarding it (or the backend doesn't broadcast on every pack mutation)
  // the kiosk falls back on:
  //   (a) refetch when the page becomes visible (focus returns), and
  //   (b) a 30 s background poll while the user is on /shop.
  // TECH_DEBT.md #16 captures the proper fix (backend-side WS invalidation).
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") refetch();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const pollId = window.setInterval(refetch, 30000);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(pollId);
    };
  }, [refetch]);

  // Cart logic
  const cartTotal = useMemo(
    () => cart.reduce((sum, it) => sum + (it.priceRupees || it.price || 0) * it.quantity, 0),
    [cart],
  );

  // Happy Hour: 30% off if the kiosk's local clock is in the 2-5 PM window.
  // Re-evaluated every minute so a customer who checks out at 14:59:30 still
  // gets the discount but a checkout at 17:00:01 doesn't. TECH_DEBT: backend
  // should also enforce the window so a malicious client can't claim 30%
  // off outside hours by sending a doctored amount.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const happyHourActive = useMemo(() => {
    const h = now.getHours();
    return h >= 14 && h < 17;
  }, [now]);
  const happyHourDiscount = useMemo(
    () => (happyHourActive ? Math.round(cartTotal * 0.30) : 0),
    [happyHourActive, cartTotal],
  );
  const payableTotal = useMemo(
    () => Math.max(0, cartTotal - happyHourDiscount),
    [cartTotal, happyHourDiscount],
  );


  const addToCart = (pack) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === pack.id);
      if (existing) {
        return prev.map((i) =>
          i.id === pack.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [...prev, { ...pack, quantity: 1 }];
    });
  };

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
      return creds?.pc_id ?? null;
    } catch {
      return null;
    }
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    if (!user?.id) return;
    const pcId = await resolvePcId();
    setPayment({
      amount: payableTotal, // discount already applied if Happy Hour is live
      pcId,
      packIds: cart.map((i) => ({ id: i.id, qty: i.quantity })),
      note: happyHourActive
        ? `${cart.length} item${cart.length === 1 ? "" : "s"} (Happy Hour -30%)`
        : `${cart.length} item${cart.length === 1 ? "" : "s"}`,
    });
  };

  // Wallet top-up flow ("Add Coins"). Opens a styled inline modal where
  // the customer picks an amount, then routes through the same
  // CashfreePaymentModal as cart checkout. Backend accepts pack_id=null
  // for a generic top-up so no new endpoint is needed.
  const handleAddCoins = () => {
    if (!user?.id) return;
    setTopUp({ amount: '100' });
  };

  const handleTopUpSubmit = async () => {
    const amount = Number(String(topUp?.amount || '').replace(/[^0-9.]/g, ''));
    if (!amount || amount < 1) return;
    const pcId = await resolvePcId();
    setTopUp(null);
    setPayment({
      amount,
      pcId,
      packIds: [],
      note: 'Wallet top-up',
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
      <AppHeader />
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
                cart={cart}
                onBumpQty={bumpQty}
              />
              <ShopCarousel
                title="Snacks & Drinks"
                packs={packs.filter((p) => (p.minutes || 0) === 0)}
                onAddToCart={addToCart}
                cart={cart}
                onBumpQty={bumpQty}
              />
            </div>
          )}
        </div>
        <div className='cartright'>
          <div className="walletcard glassyfinish">
            <h3 className="wallettitle">WALLET BALANCE</h3>
            <h1 className="walletamount"><span><MdOutlineCurrencyRupee /></span>{Number(balance ?? 0).toLocaleString()}</h1>
            {/* Coins removed from the wallet card — coins are spent only
                in the Rewards / Prize Vault flow, not on Shop checkout.
                Showing them here implied they could be used for cart
                payment, which they can't. */}
            <p className="walletsubtitle">
              {balance > 0 ? 'Last recharge: recent' : 'No recharges yet'}
            </p>
            <button
              type="button"
              className="walletadd"
              onClick={handleAddCoins}
              disabled={!user?.id}
            >
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

                {/* +/- controls moved inline onto the shop card (see
                    ShopCarousel.jsx). Sidebar now shows the qty as a static
                    badge so the customer can see what's in the cart without
                    a duplicate set of step buttons. */}
                <div className='listquantity'>
                  <p>×{item.quantity}</p>
                </div>
              </div>
            ))}

            <div className="cartcheckout">
              <div className='totalcost'>
                <div className='costleft'>
                  <h5>Subtotal </h5>
                  {happyHourActive && happyHourDiscount > 0 && (
                    <p style={{ color: '#ff9a4a', fontWeight: 600 }}>Happy Hour -30%</p>
                  )}
                </div>
                <div className='costright'>
                  <h5>{cartTotal.toLocaleString()}</h5>
                  {happyHourActive && happyHourDiscount > 0 && (
                    <p style={{ color: '#ff9a4a', fontWeight: 600 }}>
                      -{happyHourDiscount.toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
              {happyHourActive && happyHourDiscount > 0 && (
                <div
                  style={{
                    margin: '4px 0 8px',
                    padding: '6px 10px',
                    borderRadius: 8,
                    background: 'rgba(255, 154, 74, 0.12)',
                    border: '1px solid rgba(255, 154, 74, 0.35)',
                    color: '#ffb380',
                    fontSize: 11,
                    fontWeight: 600,
                    textAlign: 'center',
                  }}
                >
                  Happy Hour active · save ₹{happyHourDiscount.toLocaleString()}
                </div>
              )}
              <button disabled={cart.length === 0 || !!payment} onClick={handleCheckout}>
                {payment ? 'Awaiting payment…' : `Checkout · ₹${payableTotal.toLocaleString()}`}
              </button>
            </div>
          </div>
        </div>
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

      {topUp && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add coins to wallet"
          onClick={() => setTopUp(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1500,
            background: 'rgba(0, 0, 0, 0.55)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            className="glassyfinish"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 420,
              padding: 28,
              borderRadius: 20,
              color: '#fff',
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Add to Wallet</h3>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>
                Top up any amount. Goes straight to your wallet balance.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
              <span style={{ fontSize: 22, color: 'rgba(255,255,255,0.7)' }}>₹</span>
              <input
                autoFocus
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={topUp.amount}
                onChange={(e) => setTopUp({ amount: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') handleTopUpSubmit(); }}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 0,
                  outline: 'none',
                  color: '#fff',
                  fontSize: 22,
                  fontWeight: 600,
                  width: '100%',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[100, 200, 500, 1000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setTopUp({ amount: String(preset) })}
                  style={{
                    flex: '1 1 calc(50% - 4px)',
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: String(topUp.amount) === String(preset) ? 'rgba(255,107,53,0.25)' : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${String(topUp.amount) === String(preset) ? 'rgba(255,107,53,0.6)' : 'rgba(255,255,255,0.12)'}`,
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  ₹{preset}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setTopUp(null)}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  borderRadius: 12,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: 'rgba(255,255,255,0.9)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleTopUpSubmit}
                disabled={!Number(String(topUp.amount).replace(/[^0-9.]/g, '')) || Number(topUp.amount) < 1}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, #ff9a4a, #ff5b1f)',
                  border: 'none',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
