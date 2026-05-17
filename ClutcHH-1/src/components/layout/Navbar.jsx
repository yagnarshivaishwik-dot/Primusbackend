import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ROUTES } from '@/app/routes/paths';
import useUIStore from '@/app/store/useUIStore';
import useNotificationsStore from '@/app/store/useNotificationsStore';
import useSessionStore from '@/app/store/useSessionStore';
import useWalletStore from '@/app/store/useWalletStore';
import './Navbar.css';

const NAV_ITEMS = [
  { label: 'Home', path: ROUTES.home },
  { label: 'Games & Apps', path: ROUTES.mainGames },
  { label: 'Shop', path: ROUTES.mainShop },
  { label: 'Rewards', path: ROUTES.mainPrizeVault },
];

/**
 * Session time left — authoritative value comes from
 * /api/v1/billing/estimate-timeleft (hydrated on boot + on `time_updated`
 * realtime events). Between refreshes we tick seconds locally so the display
 * decrements every second; when a fresh authoritative value arrives we snap
 * to it so drift never accumulates.
 */
function useLiveTimer() {
  const minutesLeft = useWalletStore((s) => s.minutesLeft);
  const [remainingSecs, setRemainingSecs] = useState(() => (minutesLeft || 0) * 60);
  const lastSeedRef = useRef(null);

  // Whenever the authoritative minute count changes, reseed our local
  // seconds counter to match. This catches both the initial hydrate and
  // every mid-session `time_updated` push.
  useEffect(() => {
    const seeded = (minutesLeft || 0) * 60;
    setRemainingSecs(seeded);
    lastSeedRef.current = seeded;
  }, [minutesLeft]);

  // Per-second decrement. When we hit zero the display pins to 00:00:00 and
  // the next server push (time_updated or the 20 s heartbeat) will refresh.
  useEffect(() => {
    const id = setInterval(() => {
      setRemainingSecs((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  if (remainingSecs <= 0) return '00:00:00';
  const total = remainingSecs;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function LogoMark() {
  return (
    <svg width="24" height="28" viewBox="0 0 24 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12.0001 26C12.0001 19.1428 8.57157 14 3.42871 7.14282" stroke="#E8364E" strokeWidth="2.14286" strokeLinecap="round"/>
      <path d="M12 25.9999C12 17.4285 12 12.2856 12 5.42847" stroke="#E8364E" strokeWidth="2.14286" strokeLinecap="round"/>
      <path d="M12 26C12 19.1428 15.4286 14 20.5714 7.14282" stroke="#E8364E" strokeWidth="2.14286" strokeLinecap="round"/>
      <path d="M3.42871 10.1428C5.08557 10.1428 6.42871 8.79968 6.42871 7.14282C6.42871 5.48597 5.08557 4.14282 3.42871 4.14282C1.77186 4.14282 0.428711 5.48597 0.428711 7.14282C0.428711 8.79968 1.77186 10.1428 3.42871 10.1428Z" fill="#E8364E"/>
      <path d="M12 8.42847C13.6569 8.42847 15 7.08532 15 5.42847C15 3.77161 13.6569 2.42847 12 2.42847C10.3431 2.42847 9 3.77161 9 5.42847C9 7.08532 10.3431 8.42847 12 8.42847Z" fill="#E8364E"/>
      <path d="M20.5713 10.1428C22.2281 10.1428 23.5713 8.79968 23.5713 7.14282C23.5713 5.48597 22.2281 4.14282 20.5713 4.14282C18.9144 4.14282 17.5713 5.48597 17.5713 7.14282C17.5713 8.79968 18.9144 10.1428 20.5713 10.1428Z" fill="#E8364E"/>
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7.58579 2.8995L10.1924 0.292897C10.5829 -0.0976325 11.2161 -0.0976325 11.6066 0.292897L14.2132 2.8995H17.8995C18.4518 2.8995 18.8995 3.34722 18.8995 3.8995V7.58579L21.5061 10.1924C21.8966 10.5829 21.8966 11.2161 21.5061 11.6066L18.8995 14.2132V17.8995C18.8995 18.4518 18.4518 18.8995 17.8995 18.8995H14.2132L11.6066 21.5061C11.2161 21.8966 10.5829 21.8966 10.1924 21.5061L7.58579 18.8995H3.8995C3.34722 18.8995 2.8995 18.4518 2.8995 17.8995V14.2132L0.292897 11.6066C-0.0976325 11.2161 -0.0976325 10.5829 0.292897 10.1924L2.8995 7.58579V3.8995C2.8995 3.34722 3.34722 2.8995 3.8995 2.8995H7.58579ZM4.8995 4.8995V8.41422L2.41422 10.8995L4.8995 13.3848V16.8995H8.41422L10.8995 19.3848L13.3848 16.8995H16.8995V13.3848L19.3848 10.8995L16.8995 8.41422V4.8995H13.3848L10.8995 2.41422L8.41422 4.8995H4.8995ZM10.8995 14.8995C8.69036 14.8995 6.8995 13.1086 6.8995 10.8995C6.8995 8.69036 8.69036 6.8995 10.8995 6.8995C13.1086 6.8995 14.8995 8.69036 14.8995 10.8995C14.8995 13.1086 13.1086 14.8995 10.8995 14.8995ZM10.8995 12.8995C12.0041 12.8995 12.8995 12.0041 12.8995 10.8995C12.8995 9.79492 12.0041 8.89952 10.8995 8.89952C9.79492 8.89952 8.89952 9.79492 8.89952 10.8995C8.89952 12.0041 9.79492 12.8995 10.8995 12.8995Z" fill="#9CA3AF"/>
    </svg>
  );
}

function IconBell() {
  return (
    <svg width="18" height="22" viewBox="0 0 18 22" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 16H16V9.0314C16 5.14806 12.866 2 9 2C5.13401 2 2 5.14806 2 9.0314V16ZM9 0C13.9706 0 18 4.04348 18 9.0314V18H0V9.0314C0 4.04348 4.02944 0 9 0ZM6.5 19H11.5C11.5 20.3807 10.3807 21.5 9 21.5C7.6193 21.5 6.5 20.3807 6.5 19Z" fill="#9CA3AF"/>
    </svg>
  );
}

function IconClock() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8.00016 14.6666C4.31826 14.6666 1.3335 11.6818 1.3335 7.99992C1.3335 4.31802 4.31826 1.33325 8.00016 1.33325C11.682 1.33325 14.6668 4.31802 14.6668 7.99992C14.6668 11.6818 11.682 14.6666 8.00016 14.6666ZM8.00016 13.3333C10.9457 13.3333 13.3335 10.9455 13.3335 7.99992C13.3335 5.0544 10.9457 2.66659 8.00016 2.66659C5.05464 2.66659 2.66683 5.0544 2.66683 7.99992C2.66683 10.9455 5.05464 13.3333 8.00016 13.3333ZM8.66683 7.99992H11.3335V9.33325H7.3335V4.66658H8.66683V7.99992Z" fill="#E8364E"/>
    </svg>
  );
}

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const timer = useLiveTimer();
  const toggleNotifications = useUIStore((s) => s.toggleNotifications);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const user = useSessionStore((s) => s.user);
  const coins = useWalletStore((s) => s.coins);

  const displayName = user?.name || 'Guest';
  const avatar =
    user?.avatar ||
    displayName
      .split(/\s+/)
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() ||
    'U';

  return (
    <nav className="navbar" role="navigation" aria-label="Main navigation">
      <a
        className="navbar__logo"
        href="#"
        aria-label="NoLag home"
        onClick={(e) => { e.preventDefault(); navigate(ROUTES.home); }}
      >
        <span className="navbar__logo-mark">
          <LogoMark />
        </span>
        <span className="navbar__logo-text">NoLag</span>
      </a>

      <div className="navbar__menu" role="menubar">
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.label}
              className={`navbar__link${isActive ? ' navbar__link--active' : ''}`}
              onClick={() => navigate(item.path)}
              role="menuitem"
              aria-current={isActive ? 'page' : undefined}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="navbar__right">
        <div className="navbar__timer" aria-label="Session timer">
          <IconClock />
          {timer}
        </div>

        <button
          className="navbar__icon-btn"
          aria-label="Settings"
          onClick={() => navigate(ROUTES.settingsHelp)}
        >
          <IconSettings />
        </button>

        <button
          className="navbar__icon-btn"
          aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
          onClick={toggleNotifications}
        >
          <IconBell />
          {unreadCount > 0 && <span className="navbar__notif-dot" aria-hidden="true" />}
        </button>

        <div
          className="navbar__profile"
          role="button"
          tabIndex={0}
          aria-label="Profile menu"
          onClick={() => navigate(ROUTES.mainProfile)}
          onKeyDown={(e) => { if (e.key === 'Enter') navigate(ROUTES.mainProfile); }}
        >
          <div className="navbar__avatar" aria-hidden="true">{avatar}</div>
          <span className="navbar__profile-name">
            {displayName}
            {coins != null && (
              <span style={{ marginLeft: 8, color: '#9CA3AF', fontSize: 12 }}>
                · 🪙 {coins.toLocaleString()}
              </span>
            )}
          </span>
          <span className="navbar__chevron" aria-hidden="true">
            <svg width="9" height="6" viewBox="0 0 9 6" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4.24261 3.29981L7.54247 0L8.48527 0.942807L4.24261 5.18548L0 0.942807L0.942806 0L4.24261 3.29981Z" fill="#9CA3AF"/>
            </svg>
          </span>
        </div>
      </div>
    </nav>
  );
}
