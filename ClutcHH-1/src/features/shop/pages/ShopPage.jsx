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
  const balance = useWalletStore((s) => s.balance);
  const hydrate = useWalletStore((s) => s.hydrate);
  const user = useSessionStore((s) => s.user);

  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cart, setCart] = useState([]);
  const [payment, setPayment] = useState(null);

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
      amount: cartTotal,
      pcId,
      packIds: cart.map((i) => ({ id: i.id, qty: i.quantity })),
      note: `${cart.length} item${cart.length === 1 ? "" : "s"}`,
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
