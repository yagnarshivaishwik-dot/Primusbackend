import { NavLink } from 'react-router-dom';
import { ROUTES } from '@/app/routes/paths';

const ITEMS = [
  { label: 'Home', path: ROUTES.home },
  { label: 'Games', path: ROUTES.mainGames },
  { label: 'Apps', path: ROUTES.mainApps },
  { label: 'Arcade', path: ROUTES.mainArcade },
  { label: 'Shop', path: ROUTES.mainShop },
  { label: 'Prize Vault', path: ROUTES.mainPrizeVault },
  { label: 'Challenges', path: ROUTES.challenges },
  { label: 'Quests', path: ROUTES.quests },
  { label: 'Leaderboard', path: ROUTES.leaderboard },
  { label: 'Profile', path: ROUTES.mainProfile },
];

export default function Sidebar() {
  return (
    <nav
      style={{
        width: 220,
        padding: 16,
        background: '#1a1a2e',
        borderRight: '1px solid #2E3033',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
      aria-label="Primary"
    >
      {ITEMS.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          style={({ isActive }) => ({
            padding: '10px 12px',
            borderRadius: 8,
            color: isActive ? '#E8364F' : '#9CA3AF',
            background: isActive ? 'rgba(232, 54, 79, 0.12)' : 'transparent',
            textDecoration: 'none',
            fontSize: 14,
            fontWeight: 500,
          })}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
