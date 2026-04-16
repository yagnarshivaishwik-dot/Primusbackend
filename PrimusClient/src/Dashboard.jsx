import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { getApiBase, authHeaders, postWithQueue, showToast, csrfHeaders } from "./utils/api";
import { invoke } from './utils/invoke';
import { escapeHtml } from "./utils/escapeHtml";

// --- Helper Components for Icons ---
// Using inline SVGs to avoid external dependencies and ensure they always load.
const CircuitLogo = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const UserIcon = ({ className }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
  </svg>
);

const QrCodeIcon = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
  </svg>
);

// --- Game Data with Working URLs ---
const GAMES = [
  {
    id: 1,
    name: "Among Us",
    logo: "https://logos-world.net/wp-content/uploads/2020/11/Among-Us-Logo.png",
    cover: "https://cdn.cloudflare.steamstatic.com/steam/apps/945360/header.jpg",
    character: "https://i.pinimg.com/originals/8b/8b/9c/8b8b9c4c4c4d4e4f4g4h4i4j4k4l4m4n.png",
    background: "https://wallpaperaccess.com/full/2632286.jpg",
  },
  {
    id: 2,
    name: "Counter-Strike 2",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Counter-Strike_2_logo.svg/1280px-Counter-Strike_2_logo.svg.png",
    cover: "https://cdn.cloudflare.steamstatic.com/steam/apps/730/header.jpg",
    character: "https://icons.iconarchive.com/icons/3xhumed/mega-games-pack-05/256/Counter-Strike-Condition-Zero-2-icon.png",
    background: "https://wallpaperaccess.com/full/8484419.jpg",
  },
  {
    id: 3,
    name: "Fortnite",
    logo: "https://commons.wikimedia.org/wiki/File:Fortnite.png", // ✅ WORKING
    cover: "https://wallpapers.com/images/high/fortnite-battle-royale-desktop-je916qob1cowomqp.webp", // ✅ WORKING
    character: "https://www.pngplay.com/image/404146", // ✅ WORKING
    background: "https://images.alphacoders.com/953/953575.jpg", // ✅ WORKING
  },
  {
    id: 4,
    name: "Apex Legends",
    logo: "https://logos-world.net/wp-content/uploads/2020/03/Apex-Legends-Logo.png",
    cover: "https://cdn.cloudflare.steamstatic.com/steam/apps/1172470/header.jpg",
    character: "https://i.pinimg.com/originals/55/55/43/555543c_apex_legends_wraith.png",
    background: "https://wallpaperaccess.com/full/1565665.jpg",
  },
];

const NAV_LINKS = ["Home", "Games", "Arcade", "Apps", "Shop", "Prize Vault"];

function Balance() {
  const [balance, setBalance] = useState(null);
  useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get(`${getApiBase()}/api/wallet/balance`, { headers: authHeaders() });
        setBalance(res.data.balance);
      } catch { }
    };
    load();
  }, []);
  return (
    <div className="flex justify-between"><span>Wallet</span><span>{balance == null ? '—' : `$${balance.toFixed(2)}`}</span></div>
  );
}

function Coins() {
  const [coins, setCoins] = useState(null);
  useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get(`${getApiBase()}/api/offer/coins/balance`, { headers: authHeaders() });
        setCoins(res.data.coins);
      } catch { }
    };
    load();
  }, []);
  return (
    <div className="flex justify-between"><span>Coins</span><span>{coins == null ? '—' : coins}</span></div>
  );
}

function BuyTime() {
  const [offers, setOffers] = useState([]);
  const [busy, setBusy] = useState(false);
  const reloadOffers = async () => {
    try {
      const res = await axios.get(`${getApiBase()}/api/offer/`, { headers: authHeaders() });
      setOffers(res.data || []);
    } catch { }
  };
  useEffect(() => { reloadOffers(); }, []);
  const buy = async (id) => {
    try {
      setBusy(true);
      await axios.post(`${getApiBase()}/api/offer/buy/${id}`, null, { headers: { ...authHeaders(), ...csrfHeaders() } });
      alert('Time added to your account.');
      setBusy(false);
    } catch (e) {
      setBusy(false);
      alert(e?.response?.data?.detail || 'Purchase failed');
    }
  };
  if (!offers.length) return null;
  return (
    <div className="mt-4">
      <h4 className="text-white font-semibold mb-2">Buy Time</h4>
      <div className="grid grid-cols-2 gap-3">
        {offers.map(o => (
          <button key={o.id} disabled={busy} onClick={() => buy(o.id)} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm">
            {o.name} — {o.hours}h for ${o.price}
          </button>
        ))}
      </div>
    </div>
  );
}

function Shop() {
  const [products, setProducts] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get(`${getApiBase()}/api/payment/product`, { headers: authHeaders() });
        setProducts(res.data || []);
      } catch { }
    };
    load();
  }, []);
  const buy = async (productId) => {
    try {
      setBusy(true);
      await axios.post(`${getApiBase()}/api/payment/order`, { items: [{ product_id: productId, quantity: 1 }] }, { headers: { ...authHeaders(), 'Content-Type': 'application/json', ...csrfHeaders() } });
      alert('Purchased');
      setBusy(false);
    } catch (e) {
      setBusy(false);
      alert(e?.response?.data?.detail || 'Purchase failed');
    }
  };
  if (!products.length) return null;
  return (
    <div>
      <h3 className="text-white font-semibold mb-3">Shop</h3>
      <div className="space-y-2">
        {products.map(p => (
          <button key={p.id} disabled={busy} onClick={() => buy(p.id)} className="w-full text-left glass-card hover:bg-white/10 text-white px-4 py-2 rounded-lg border border-white/10">
            {p.name} — ${p.price}
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Main UI Components ---
export function AppHeader({ onLogout, currentUser, minutesLeft, active, networkOnline, onNavigate, activePage }) {
  return (
    <header className="flex justify-between items-center p-6 glass-header">
      <div className="flex items-center space-x-4">
        <CircuitLogo />
        <h1 className="text-2xl font-bold text-white">PRIMUS</h1>
      </div>

      <nav className="flex space-x-8">
        {NAV_LINKS.map((link) => (
          <button
            key={link}
            onClick={() => onNavigate?.(link.toLowerCase())}
            className={`transition-colors ${activePage === link.toLowerCase() ? 'text-primary' : 'text-gray-300 hover:text-white'}`}
          >
            {link}
          </button>
        ))}
      </nav>

      <div className="flex items-center space-x-4">
        <span className={`flex items-center gap-2 text-xs px-2 py-0.5 rounded ${networkOnline ? 'bg-emerald-700/70' : 'bg-red-700/70'} text-white`}>
          {!networkOnline && <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          {networkOnline ? 'Connected' : 'Reconnecting...'}
        </span>
        {active && (
          <span className="text-xs bg-emerald-600/80 text-white px-3 py-1 rounded-full">
            {minutesLeft != null ? `${minutesLeft} min left` : 'Session active'}
          </span>
        )}
        {/* Profile button */}
        <button onClick={() => document.getElementById('primus-profile')?.classList.toggle('hidden')} className="flex items-center space-x-2 text-white hover:text-primary">
          <UserIcon className="w-5 h-5" />
          <span>{currentUser?.username || 'User'}</span>
        </button>
        <button
          onClick={onLogout}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded transition-colors"
        >
          Logout
        </button>
      </div>
    </header>
  );
}

// Quick Launch box placed on the main homepage (not in a sidebar, not scrollable)
function QuickLaunch() {
  return (
    <div className="glass-card p-4">
      <h3 className="text-white font-semibold mb-3">Quick Launch</h3>
      <div className="flex flex-wrap gap-3">
        <button
          className="bg-primary/30 hover:bg-primary text-white px-4 py-2 rounded"
          onClick={() => {
            const base = prompt('Backend URL', localStorage.getItem('primus_api_base') || (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'));
            if (base) {
              localStorage.setItem('primus_api_base', base.replace(/\/$/, ''));
              alert('Backend URL saved. Restart client to apply.');
            }
          }}
        >
          Set Backend URL
        </button>
        <button
          className="bg-gray-900/50 hover:bg-gray-800 text-white px-4 py-2 rounded border border-gray-700"
          onClick={() => {
            const name = prompt('PC Name', localStorage.getItem('primus_pc_name') || '');
            if (name != null) localStorage.setItem('primus_pc_name', name);
            alert('Saved. Will register on next login if needed.');
          }}
        >
          Device Settings
        </button>
      </div>
    </div>
  );
}

function StatsBar({ wallet, minutesLeft, currentUser, sessionStart }) {
  const [elapsed, setElapsed] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const lastMinutesRef = useRef(null);

  // Update remaining seconds when minutesLeft changes from API
  useEffect(() => {
    if (minutesLeft != null && minutesLeft !== lastMinutesRef.current) {
      setRemainingSeconds(Math.max(0, Math.floor(minutesLeft * 60)));
      lastMinutesRef.current = minutesLeft;
    }
  }, [minutesLeft]);

  // Real-time countdown every second
  useEffect(() => {
    if (remainingSeconds === null || remainingSeconds <= 0) return;

    const timer = setInterval(() => {
      setRemainingSeconds(prev => {
        if (prev === null || prev <= 0) return 0;
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [remainingSeconds]);

  useEffect(() => {
    if (!sessionStart) {
      setElapsed(0);
      return;
    }
    const start = new Date(sessionStart).getTime();
    const updateElapsed = () => {
      const now = Date.now();
      setElapsed(Math.floor((now - start) / 1000));
    };
    updateElapsed();
    const timer = setInterval(updateElapsed, 1000);
    return () => clearInterval(timer);
  }, [sessionStart]);

  const formatTime = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${s}s`;
  };

  const formatRemaining = (secs) => {
    if (secs === null) return '—';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    const pad = (n) => String(n).padStart(2, '0');
    if (h > 0) {
      return `${pad(h)}:${pad(m)}:${pad(s)}`;
    }
    return `${pad(m)}:${pad(s)}`;
  };

  const isLowTime = remainingSeconds != null && remainingSeconds <= 600; // 10 minutes
  const isCritical = remainingSeconds != null && remainingSeconds <= 300; // 5 minutes

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
      <div className="glass-card p-4">
        <div className="text-gray-400 text-xs">Wallet Balance</div>
        <div className="text-white text-xl font-semibold">{wallet == null ? '—' : `₹${wallet.toFixed(2)}`}</div>
      </div>
      <div className={`glass-card p-4 ${isCritical ? 'border-2 border-red-500/50 bg-red-500/10 animate-pulse' : isLowTime ? 'border-2 border-yellow-500/50 bg-yellow-500/10' : ''}`}>
        <div className="text-gray-400 text-xs">Time Remaining</div>
        <div className={`text-2xl font-bold font-mono tracking-wider ${isCritical ? 'text-red-400' : isLowTime ? 'text-yellow-400' : 'text-emerald-400'}`}>
          {formatRemaining(remainingSeconds)}
        </div>
        {isCritical && <div className="text-red-500 text-xs mt-1 animate-pulse">⚠️ CRITICAL - Add time now!</div>}
        {isLowTime && !isCritical && <div className="text-yellow-500 text-xs mt-1">⚠️ Low time!</div>}
      </div>
      <div className="glass-card p-4">
        <div className="text-gray-400 text-xs">Session Duration</div>
        <div className="text-white text-xl font-semibold font-mono">
          {sessionStart ? formatTime(elapsed) : '—'}
        </div>
      </div>
      <div className="glass-card p-4">
        <div className="text-gray-400 text-xs">Signed in as</div>
        <div className="text-white text-xl font-semibold truncate">{currentUser?.username || 'User'}</div>
      </div>
    </div>
  );
}

function RightSidebar() {
  return (
    <aside className="w-full p-0">
      <div className="space-y-6">
        <div className="glass-card p-4">
          <h3 className="text-white font-semibold mb-3">Account</h3>
          <div className="space-y-2 text-gray-300">
            <Balance />
            <Coins />
            <button onClick={() => document.getElementById('primus-profile')?.classList.toggle('hidden')} className="text-xs text-primary underline">View profile</button>
          </div>
        </div>

        <div className="glass-card p-4">
          <Shop />
        </div>

        <div className="glass-card p-4">
          <div className="space-y-6">
            <Announcements />
            <Notifications />
            <div>
              <SupportQuick />
              <div className="mt-4">
                <ChatWithStaff />
              </div>
            </div>
          </div>
        </div>

        <div className="glass-card p-4">
          <PrizeVault />
        </div>

        <div className="glass-card p-4">
          <Leaderboards />
        </div>

        <div className="glass-card p-4">
          <EventsPanel />
        </div>

        <div className="glass-card p-4">
          <h3 className="text-white font-semibold mb-3">Quick Connect</h3>
          <QrCodeIcon className="w-24 h-24 text-gray-600 mx-auto" />
          <p className="text-gray-400 text-center text-sm mt-2">
            Scan to connect mobile device
          </p>
        </div>
        <ProfileDrawer />
      </div>
    </aside>
  );
}

function GameSelector({ games, selectedGame, onSelect, canLaunch, age, minutesLeft, activeSessionId, setActiveSessionId, setSessionStart, pcId, currentUser, setWallet }) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="mb-6">
        <h2 className="text-4xl font-bold text-white mb-2">Your Gaming Universe</h2>
        <p className="text-gray-400">Choose your adventure and dive into immersive worlds</p>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden pr-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mb-8">
          {games.map((game) => (
            <div
              key={game.id}
              onClick={() => onSelect(game)}
              className={`relative cursor-pointer rounded-xl overflow-hidden transition-all duration-300 glass-card ${selectedGame?.id === game.id
                ? 'ring-4 ring-primary scale-105'
                : 'hover:scale-102'
                }`}
            >
              <img
                src={game.cover}
                alt={game.name}
                className="w-full h-48 object-cover"
                onError={(e) => {
                  e.target.src = 'https://via.placeholder.com/400x200/1f2937/ffffff?text=' + game.name;
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end">
                <div className="p-4">
                  <div className="flex items-center gap-2">
                    <img
                      src={game.logo}
                      alt={game.name}
                      className="h-8 mb-2"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'block';
                      }}
                    />
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-700/80 text-gray-200">{game.is_free ? 'Free' : 'Requires account'}</span>
                    {typeof game.min_age === 'number' && (
                      <span className="text-xs px-2 py-0.5 rounded bg-red-700/80 text-white">{game.min_age}+</span>
                    )}
                  </div>
                  <h3 className="text-white font-semibold" style={{ display: 'none' }}>{game.name}</h3>
                </div>
              </div>
              <div className="mt-3">
                {canLaunch && (selectedGame?.id === game.id) && (game.exe_path) && (
                  <button
                    className="text-xs bg-primary/80 hover:bg-primary text-white px-3 py-1 rounded disabled:opacity-50"
                    disabled={typeof game.min_age === 'number' && typeof age === 'number' && age < game.min_age}
                    onClick={(e) => { e.stopPropagation(); alert('Launch is available in the Windows client.'); }}
                  >
                    {typeof game.min_age === 'number' && typeof age === 'number' && age < game.min_age ? 'Age restricted' : 'Launch'}
                  </button>
                )}
              </div>
            </div>
          ))}

        </div>

        {selectedGame && (
          <div className="glass-card p-6 mt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-bold text-white mb-2">{selectedGame.name}</h3>
                <p className="text-gray-400">{minutesLeft != null ? `${minutesLeft} min available` : 'Ready to launch'}</p>
              </div>
              <button
                className="bg-primary hover:opacity-90 text-white px-8 py-3 rounded-lg font-semibold transition-colors"
                onClick={async () => {
                  try {
                    const base = getApiBase();
                    if (!activeSessionId) {
                      const res = await axios.post(`${base}/api/session/start`, { pc_id: pcId, user_id: currentUser.id }, { headers: authHeaders() });
                      setActiveSessionId(res.data.id);
                      setSessionStart(new Date().toISOString());
                      try { localStorage.setItem('primus_active_session_id', String(res.data.id)); } catch { }
                      // Launch is handled by the Windows client; web build starts the session only
                    } else {
                      try {
                        await axios.post(`${base}/api/session/stop/${activeSessionId}`, null, { headers: authHeaders() });
                      } catch {
                        // If stop fails due to offline, queue a command to stop later when back online
                        await postWithQueue(`${base}/api/session/stop/${activeSessionId}`, {}, { headers: authHeaders() });
                      }
                      setActiveSessionId(null);
                      setSessionStart(null);
                      try { localStorage.removeItem('primus_active_session_id'); } catch { }
                      try { const w = await axios.get(`${base}/api/wallet/balance`, { headers: authHeaders() }); setWallet(w.data.balance); } catch { }
                    }
                  } catch (e) { }
                }}
              >
                {activeSessionId ? 'STOP SESSION' : 'PLAY NOW'}
              </button>
            </div>
            <BuyTime />
          </div>
        )}
      </div>
    </div>
  );
}

function PrizeVault() {
  const [prizes, setPrizes] = useState([]);
  const load = async () => {
    try { const res = await axios.get(`${getApiBase()}/api/prize/`, { headers: authHeaders() }); setPrizes(res.data || []); } catch { }
  };
  useEffect(() => { load(); }, []);
  if (!prizes.length) return null;
  return (
    <div>
      <h3 className="text-white font-semibold mb-3">Prize Vault</h3>
      <div className="space-y-2">
        {prizes.map(p => (
          <div key={p.id} className="flex items-center justify-between text-sm text-gray-200">
            <div>
              <div>{p.name}</div>
              <div className="text-gray-400">{p.coin_cost} coins</div>
            </div>
            <button onClick={async () => { try { await axios.post(`${getApiBase()}/api/prize/redeem/${p.id}`, null, { headers: { ...authHeaders(), ...csrfHeaders() } }); showToast('Prize redeemed. Please contact staff.'); } catch (e) { showToast(e?.response?.data?.detail || 'Redeem failed'); } }} className="bg-primary/80 hover:bg-primary text-white px-3 py-1 rounded text-sm">Redeem</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Leaderboards() {
  const [lbs, setLbs] = useState([]);
  const [entries, setEntries] = useState([]);
  const [sel, setSel] = useState(null);
  useEffect(() => { const load = async () => { try { const res = await axios.get(`${getApiBase()}/api/leaderboard/`, { headers: authHeaders() }); setLbs(res.data || []); } catch { } }; load(); }, []);
  useEffect(() => { const load = async () => { if (!sel) return; try { const res = await axios.get(`${getApiBase()}/api/leaderboard/${sel}`, { headers: authHeaders() }); setEntries(res.data || []); } catch { } }; load(); }, [sel]);
  if (!lbs.length) return null;
  return (
    <div>
      <h3 className="text-white font-semibold mb-3">Leaderboards</h3>
      <select value={sel || ''} onChange={e => setSel(e.target.value)} className="w-full bg-gray-700/50 border border-gray-600 rounded p-2 text-white text-sm mb-2">
        <option value="">Select...</option>
        {lbs.map(l => <option key={l.id} value={l.id}>{l.name} ({l.scope})</option>)}
      </select>
      {entries.length > 0 && (
        <ul className="text-sm text-gray-200 max-h-40 overflow-auto space-y-2">
          {entries.map(e => (
            <li key={e.id} className="glass-item">{e.user_id}: {e.value}</li>
          ))}
        </ul>
      )}
      {sel && (
        <button onClick={async () => { try { await axios.post(`${getApiBase()}/api/leaderboard/record/${sel}?value=60`, null, { headers: { ...authHeaders(), ...csrfHeaders() } }); showToast('Recorded 60 points'); const res = await axios.get(`${getApiBase()}/api/leaderboard/${sel}`, { headers: authHeaders() }); setEntries(res.data || []); } catch { } }} className="mt-2 bg-primary/80 hover:bg-primary text-white px-3 py-1 rounded text-sm">Add 60 points</button>
      )}
    </div>
  );
}

function EventsPanel() {
  const [events, setEvents] = useState([]);
  useEffect(() => { const load = async () => { try { const res = await axios.get(`${getApiBase()}/api/event/`, { headers: authHeaders() }); setEvents(res.data || []); } catch { } }; load(); }, []);
  if (!events.length) return null;
  return (
    <div>
      <h3 className="text-white font-semibold mb-3">Events</h3>
      <ul className="space-y-2">
        {events.map(ev => (
          <li key={ev.id} className="text-sm text-gray-200 flex items-center justify-between glass-item">
            <div>
              <div>{ev.name}</div>
              <div className="text-gray-400 text-xs">{ev.type}</div>
            </div>
            <button onClick={async () => { try { await axios.post(`${getApiBase()}/api/event/progress/${ev.id}?delta=10`, null, { headers: { ...authHeaders(), ...csrfHeaders() } }); showToast('Event progress +10'); } catch { } }} className="bg-primary/80 hover:bg-primary text-white px-3 py-1 rounded text-sm">+10</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Announcements() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get(`${getApiBase()}/api/announcement/`, { headers: authHeaders() });
        setItems(res.data || []);
      } catch { }
    };
    load();
  }, []);
  if (!items.length) return null;
  return (
    <div className="glass-card p-4">
      <h3 className="text-white font-semibold mb-3">Announcements</h3>
      <ul className="space-y-2 text-sm text-gray-200 max-h-40 overflow-auto">
        {items.map(a => (
          <li key={a.id} className="glass-item">{a.content}</li>
        ))}
      </ul>
    </div>
  );
}

function Notifications() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get(`${getApiBase()}/api/notification/`, { headers: authHeaders() });
        setItems(res.data || []);
      } catch { }
    };
    load();
  }, []);
  if (!items.length) return null;
  return (
    <div className="glass-card p-4">
      <h3 className="text-white font-semibold mb-3">Notifications</h3>
      <ul className="space-y-2 text-sm text-gray-200 max-h-40 overflow-auto">
        {items.slice(0, 5).map(n => (
          <li key={n.id} className="glass-item"><span>{n.content}</span></li>
        ))}
      </ul>
    </div>
  );
}

function SupportQuick() {
  const [text, setText] = useState("");
  const [pcId, setPcIdState] = useState(null);
  useEffect(() => { setPcIdState(localStorage.getItem('primus_pc_id') || null); }, []);
  const send = async () => {
    if (!text.trim()) return;
    try {
      await postWithQueue(`${getApiBase()}/api/support/`, { pc_id: pcId ? parseInt(pcId) : null, issue: text.trim() }, { headers: { ...authHeaders(), ...csrfHeaders() } });
      setText("");
      showToast('Support ticket sent.');
    } catch { }
  };
  return (
    <div className="glass-card p-4">
      <h3 className="text-white font-semibold mb-3">Need help?</h3>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Describe the issue" className="w-full glass-textarea text-sm mb-3 h-24" />
      <button onClick={send} className="w-full bg-primary/80 hover:bg-primary text-white px-4 py-2 rounded text-sm">Send</button>
    </div>
  );
}

function ChatWithStaff() {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef(null);
  const load = async () => {
    try {
      const res = await axios.get(`${getApiBase()}/api/chat/`, { headers: authHeaders() });
      setMessages(res.data || []);
    } catch { }
  };
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);
  useEffect(() => {
    try { if (listRef.current) { listRef.current.scrollTop = listRef.current.scrollHeight; } } catch { }
  }, [messages]);
  const send = async () => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const pcId = localStorage.getItem('primus_pc_id');
      await postWithQueue(`${getApiBase()}/api/chat/`, {
        message: text.trim(),
        pc_id: pcId ? parseInt(pcId) : null
      }, { headers: { ...authHeaders(), ...csrfHeaders() } });
      setText("");
      await load();
    } catch { } finally { setLoading(false); }
  };
  return (
    <div id="primus-chat">
      <h3 className="text-white font-semibold mb-3">Chat with Staff</h3>
      <div ref={listRef} className="bg-gray-900/50 border border-gray-700 rounded p-2 h-40 overflow-auto mb-2 text-sm text-gray-200">
        {messages.length ? messages.slice(-50).map(m => (
          <div key={m.id} className="mb-1">
            <span className="text-gray-400">[{new Date(m.timestamp).toLocaleTimeString()}]</span> <span>{escapeHtml(m.message)}</span>
          </div>
        )) : <div className="text-gray-500">No messages yet.</div>}
      </div>
      <div className="relative">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Type a message"
          className="w-full pr-20 text-sm h-9 bg-white text-black border border-gray-300 rounded-lg px-3 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button onClick={send} disabled={loading} className="absolute right-1 top-1 h-7 px-3 bg-primary/80 hover:bg-primary text-white rounded text-xs">Send</button>
      </div>
    </div>
  );
}

function ProfileDrawer() {
  const [offers, setOffers] = useState([]);
  const [txs, setTxs] = useState([]);
  const [packages, setPackages] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [topup, setTopup] = useState('');
  const [coupon, setCoupon] = useState('');
  const [dob, setDob] = useState('');
  useEffect(() => {
    const load = async () => {
      try {
        const [o, t, pkgs, mine] = await Promise.all([
          axios.get(`${getApiBase()}/api/offer/mine`, { headers: authHeaders() }),
          axios.get(`${getApiBase()}/api/wallet/transactions`, { headers: authHeaders() }),
          axios.get(`${getApiBase()}/api/membership/package`, { headers: authHeaders() }),
          axios.get(`${getApiBase()}/api/membership/mine`, { headers: authHeaders() })
        ]);
        setOffers(o.data || []);
        setTxs(t.data || []);
        setPackages(pkgs.data || []);
        setMemberships(mine.data || []);
      } catch { }
    };
    load();
  }, []);
  return (
    <div id="primus-profile" className="hidden fixed right-6 bottom-24 w-80 glass-card p-4 text-white z-50">
      <div className="flex justify-between items-center mb-3">
        <h4 className="font-semibold">Profile</h4>
        <button className="text-gray-400" onClick={() => document.getElementById('primus-profile')?.classList.add('hidden')}>✕</button>
      </div>
      <div>
        <h5 className="text-sm text-gray-400 mb-1">Active Time</h5>
        <ul className="text-sm mb-3">
          {offers.length ? offers.map(o => (
            <li key={o.id}>{o.offer_id} — {o.hours_remaining}h remaining</li>
          )) : <li className="text-gray-500">No active time offers</li>}
        </ul>
        <div className="mb-3">
          <h5 className="text-sm text-gray-400 mb-1">Memberships</h5>
          <ul className="text-sm mb-2">
            {memberships.length ? memberships.map(m => (
              <li key={m.id}>#{m.id} — pkg {m.package_id} {m.end_date ? `(until ${new Date(m.end_date).toLocaleDateString()})` : ''}</li>
            )) : <li className="text-gray-500">No memberships</li>}
          </ul>
          <div className="max-h-24 overflow-auto border border-gray-700 rounded p-2">
            {packages.length ? packages.map(p => (
              <div key={p.id} className="flex items-center justify-between text-sm mb-1">
                <div>
                  <div className="text-gray-200">{p.name}</div>
                  <div className="text-gray-400">${p.price}{p.hours_included ? ` · ${p.hours_included}h` : ''}{p.valid_days ? ` · ${p.valid_days}d` : ''}</div>
                </div>
                <button onClick={async () => {
                  try { await axios.post(`${getApiBase()}/api/membership/buy/${p.id}`, null, { headers: { ...authHeaders(), ...csrfHeaders() } }); showToast('Membership purchased.'); } catch (e) { showToast(e?.response?.data?.detail || 'Purchase failed'); }
                }} className="bg-primary/80 hover:bg-primary text-white px-2 py-1 rounded text-xs">Buy</button>
              </div>
            )) : <div className="text-gray-500 text-sm">No membership packages</div>}
          </div>
        </div>
        <div className="mb-3">
          <h5 className="text-sm text-gray-400 mb-1">Add Funds</h5>
          <div className="flex gap-2">
            <input value={topup} onChange={e => setTopup(e.target.value)} placeholder="$ Amount" className="flex-1 glass-input text-sm" />
            <button onClick={async () => {
              const amt = parseFloat(topup)
              if (!amt || amt <= 0) return;
              try {
                await axios.post(`${getApiBase()}/api/wallet/topup`, { amount: amt, type: 'topup', description: 'self-topup' }, { headers: { ...authHeaders(), ...csrfHeaders() } })
                setTopup('')
                const rootId = 'primus-toast-root';
                let root = document.getElementById(rootId);
                if (!root) { root = document.createElement('div'); root.id = rootId; root.className = 'primus-toast'; document.body.appendChild(root); }
                const item = document.createElement('div'); item.className = 'primus-toast-item'; item.textContent = 'Funds added.'; root.appendChild(item); setTimeout(() => { try { root.removeChild(item); } catch { } }, 4000);
              } catch { }
            }} className="bg-primary/80 hover:bg-primary text-white px-3 py-1 rounded text-sm">Add</button>
          </div>
        </div>
        <div className="mb-3">
          <h5 className="text-sm text-gray-400 mb-1">Birthdate (YYYY-MM-DD)</h5>
          <div className="flex gap-2">
            <input value={dob} onChange={e => setDob(e.target.value)} placeholder="2005-09-30" className="flex-1 glass-input text-sm" />
            <button onClick={async () => { try { await axios.post(`${getApiBase()}/api/auth/me`, { birthdate: new Date(dob).toISOString() }, { headers: { ...authHeaders(), 'Content-Type': 'application/json', ...csrfHeaders() } }); showToast('Birthdate updated'); } catch { showToast('Invalid date'); } }} className="bg-primary/80 hover:bg-primary text-white px-3 py-1 rounded text-sm">Save</button>
          </div>
        </div>
        <div className="mb-3">
          <h5 className="text-sm text-gray-400 mb-1">Redeem Coupon</h5>
          <div className="flex gap-2">
            <input value={coupon} onChange={e => setCoupon(e.target.value)} placeholder="Code" className="flex-1 glass-input text-sm" />
            <button onClick={async () => { try { await axios.post(`${getApiBase()}/api/coupon/redeem`, { code: coupon, target: 'offer' }, { headers: { ...authHeaders(), ...csrfHeaders() } }); setCoupon(''); showToast('Coupon redeemed. It will apply to purchases.'); } catch (e) { showToast(e?.response?.data?.detail || 'Invalid/expired coupon'); } }} className="bg-primary/80 hover:bg-primary text-white px-3 py-1 rounded text-sm">Apply</button>
          </div>
        </div>
        <h5 className="text-sm text-gray-400 mb-1">Recent Wallet Activity</h5>
        <ul className="text-sm max-h-40 overflow-auto space-y-2">
          {txs.length ? txs.slice(0, 8).map(x => (
            <li key={x.id} className="glass-item">{x.type}: {x.amount}</li>
          )) : <li className="text-gray-500">No recent transactions</li>}
        </ul>
      </div>
    </div>
  );
}

// --- Main Dashboard Component ---
export default function Dashboard({ onLogout, onNavigate, currentUser, pcId, activePage, networkOnline }) {
  const [selectedGame, setSelectedGame] = useState(GAMES[0]);
  const [wallet, setWallet] = useState(null);
  const [games, setGames] = useState(GAMES);
  const [detectedGames, setDetectedGames] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [sessionStart, setSessionStart] = useState(null);
  const [minutesLeft, setMinutesLeft] = useState(null);
  const [showQuickSwitch, setShowQuickSwitch] = useState(false);
  const [age, setAge] = useState(null);
  const [autoLbId, setAutoLbId] = useState(null);
  const [eventIds, setEventIds] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const base = getApiBase();
        const [walletRes, gamesRes, meRes, lbsRes, evRes] = await Promise.all([
          axios.get(`${base}/api/wallet/balance`, { headers: authHeaders() }),
          axios.get(`${base}/api/game/`, { headers: authHeaders() }),
          axios.get(`${base}/api/auth/me`, { headers: authHeaders() }).catch(() => null),
          axios.get(`${base}/api/leaderboard/`, { headers: authHeaders() }).catch(() => ({ data: [] })),
          axios.get(`${base}/api/event/`, { headers: authHeaders() }).catch(() => ({ data: [] })),
        ]);
        setWallet(walletRes.data.balance);
        try {
          const bd = meRes?.data?.birthdate ? new Date(meRes.data.birthdate) : null;
          if (bd) {
            const now = new Date();
            let a = now.getFullYear() - bd.getFullYear();
            const m = now.getMonth() - bd.getMonth();
            if (m < 0 || (m === 0 && now.getDate() < bd.getDate())) a--;
            setAge(a);
          }
        } catch { }
        try {
          const list = lbsRes?.data || [];
          const pm = list.find(l => (l.metric === 'play_minutes')) || list[0] || null;
          if (pm) setAutoLbId(pm.id);
        } catch { }
        try {
          const evs = evRes?.data || [];
          setEventIds(evs.map(e => e.id));
        } catch { }
        if (Array.isArray(gamesRes.data) && gamesRes.data.length) {
          // Map backend games to simple structure for UI
          const mapped = gamesRes.data.map(g => ({ id: g.id, name: g.name, cover: g.icon_url || GAMES[0].cover, logo: g.icon_url || GAMES[0].logo, exe_path: g.exe_path, is_free: g.is_free, min_age: g.min_age }));
          setGames(mapped);
          setSelectedGame(mapped[0]);
        }
        if (pcId) {
          try {
            const est = await axios.get(`${base}/api/billing/estimate-timeleft`, { params: { pc_id: pcId }, headers: authHeaders() });
            setMinutesLeft(est.data.minutes);
          } catch { }
        }
      } catch (_) { }
    };
    fetchData();
  }, []);

  // Poll remaining time every second for real-time accuracy
  useEffect(() => {
    let t;
    const pollTime = async () => {
      try {
        if (!pcId) return;
        const base = getApiBase();
        const est = await axios.get(`${base}/api/billing/estimate-timeleft`, { params: { pc_id: pcId }, headers: authHeaders() });
        setMinutesLeft(est.data.minutes);
      } catch { }
    };
    t = setInterval(pollTime, 1000); // Every 1 second
    return () => { if (t) clearInterval(t); };
  }, [pcId]);

  // Update leaderboards and events every 60 seconds (separate from time polling)
  useEffect(() => {
    let t;
    const updateStats = async () => {
      try {
        if (!activeSessionId) return;
        const base = getApiBase();
        if (autoLbId) {
          try { await axios.post(`${base}/api/leaderboard/record/${autoLbId}?value=60`, null, { headers: authHeaders() }); } catch { }
        }
        if (eventIds.length) {
          for (const id of eventIds) {
            try { await axios.post(`${base}/api/event/progress/${id}?delta=60`, null, { headers: authHeaders() }); } catch { }
          }
        }
      } catch { }
    };
    t = setInterval(updateStats, 60000); // Every 60 seconds
    return () => { if (t) clearInterval(t); };
  }, [activeSessionId, autoLbId, eventIds]);

  // Auto-stop session when time runs out
  useEffect(() => {
    const stopIfOutOfTime = async () => {
      try {
        if (activeSessionId && minutesLeft != null && minutesLeft <= 0) {
          await axios.post(`${getApiBase()}/api/session/stop/${activeSessionId}`, null, { headers: authHeaders() });
          setActiveSessionId(null);
          const w = await axios.get(`${getApiBase()}/api/wallet/balance`, { headers: authHeaders() });
          setWallet(w.data.balance);
          // toast
          const rootId = 'primus-toast-root';
          let root = document.getElementById(rootId);
          if (!root) {
            root = document.createElement('div');
            root.id = rootId;
            root.className = 'primus-toast';
            document.body.appendChild(root);
          }
          const item = document.createElement('div');
          item.className = 'primus-toast-item';
          item.textContent = 'Your time has ended. Session stopped.';
          root.appendChild(item);
          setTimeout(() => { try { root.removeChild(item); } catch { } }, 5000);
        }
      } catch { }
    };
    stopIfOutOfTime();
  }, [minutesLeft, activeSessionId]);

  // Keyboard shortcut to toggle quick switch (Ctrl+L)
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        if (activeSessionId) setShowQuickSwitch((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeSessionId]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <AppHeader onLogout={onLogout} currentUser={currentUser} minutesLeft={minutesLeft} active={!!activeSessionId} onNavigate={onNavigate} activePage={activePage} networkOnline={networkOnline} />
      <div className="app-content flex-1 flex flex-col">
        <div className="px-4 md:px-8 py-4 space-y-4">
          <StatsBar wallet={wallet} minutesLeft={minutesLeft} currentUser={currentUser} sessionStart={sessionStart} />
          <QuickLaunch />
        </div>

        <div className="flex flex-1 px-4 md:px-8 pb-4 md:pb-8">
          <GameSelector
            games={games}
            selectedGame={selectedGame}
            onSelect={setSelectedGame}
            canLaunch={!!activeSessionId}
            age={age}
            minutesLeft={minutesLeft}
            activeSessionId={activeSessionId}
            setActiveSessionId={setActiveSessionId}
            setSessionStart={setSessionStart}
            pcId={pcId}
            currentUser={currentUser}
            setWallet={setWallet}
          />
          <div className="w-80 pl-6 shrink-0 self-stretch flex">
            <div className="glass-card p-4 h-full w-full max-h-full">
              <RightSidebar />
            </div>
          </div>
        </div>
      </div>
      {/* Quick Switch overlay at the Dashboard level to avoid undefined references */}
      {showQuickSwitch && activeSessionId && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="glass-card w-[800px] max-w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-white font-semibold">Switch Game</h4>
              <button className="text-gray-400" onClick={() => setShowQuickSwitch(false)}>✕</button>
            </div>
            <div className="grid grid-cols-3 gap-4 max-h-[60vh] overflow-auto">
              {games.map(g => (
                <button key={g.id} onClick={() => { setSelectedGame(g); setShowQuickSwitch(false); alert('Launch is available in the Windows client.'); }} className="glass-item hover:bg-white/10 text-white rounded-lg p-3 text-left">
                  <div className="font-semibold">{g.name}</div>
                  <div className="text-xs text-gray-400">{g.is_free ? 'Free' : 'Requires account'}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}