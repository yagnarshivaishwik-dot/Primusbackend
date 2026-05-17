import { useLocation, useNavigate } from 'react-router-dom';
import { ROUTES } from '@/app/routes/paths';
import './BottomNav.css';

/**
 * BottomNav — floating glassy navigation bar at the bottom of the screen.
 * Used by FullScreenLayout pages (Guna's home, Pavan's shop) where the
 * page is full-screen and there's no top Navbar.
 *
 * Matches the dark / glassyfinish theme established in globals.css.
 */

const NAV_ITEMS = [
  {
    path: ROUTES.home,
    label: 'Home',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 11l9-8 9 8" strokeLinejoin="round" />
        <path d="M5 10v10h14V10" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    path: ROUTES.mainGames,
    label: 'Games & Apps',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    path: ROUTES.mainShop,
    label: 'Shop',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M6 7h12l-1 13H7L6 7z" strokeLinejoin="round" />
        <path d="M9 7a3 3 0 0 1 6 0" />
      </svg>
    ),
  },
  {
    path: ROUTES.mainPrizeVault,
    label: 'Rewards',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4z" strokeLinejoin="round" />
        <path d="M17 6h3v2a3 3 0 0 1-3 3M7 6H4v2a3 3 0 0 0 3 3" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="bottomnav glassyfinish" role="navigation" aria-label="Primary">
      {NAV_ITEMS.map((item) => {
        const isActive =
          location.pathname === item.path ||
          (item.path !== ROUTES.home && location.pathname.startsWith(item.path));
        return (
          <button
            key={item.path}
            type="button"
            className={`bottomnav__item${isActive ? ' bottomnav__item--active' : ''}`}
            onClick={() => navigate(item.path)}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className="bottomnav__icon">{item.icon}</span>
            <span className="bottomnav__label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
