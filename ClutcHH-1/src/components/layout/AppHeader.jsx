import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IoSettingsOutline } from 'react-icons/io5';

import useSessionStore from '@/app/store/useSessionStore';
import { ROUTES } from '@/app/routes/paths';

import './AppHeader.css';

/**
 * Shared top header for full-screen pages (Home / Games & Apps / Shop /
 * Rewards). Pavan's design ported once so every page has the same chrome
 * instead of inlining a cartheader copy.
 *
 * - Session badge counts up from `sessionStartedAt` on useSessionStore.
 *   That timestamp is captured at login (TECH_DEBT #24 — should source
 *   from a backend session record once /api/v1/session/current exists).
 * - Settings cog → /settings/help.
 * - User avatar shows initials → routes to /main/profile.
 */
function formatElapsed(ms) {
  if (!ms || ms < 0) return '--:--:--';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export default function AppHeader() {
  const navigate = useNavigate();
  const user = useSessionStore((s) => s.user);
  const sessionStartedAt = useSessionStore((s) => s.sessionStartedAt);

  // Tick once per second so the displayed clock stays current. One second
  // granularity matches the customer's wall-clock perception and is cheap.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!sessionStartedAt) return undefined;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [sessionStartedAt]);

  const elapsed = useMemo(() => {
    if (!sessionStartedAt) return '--:--:--';
    return formatElapsed(Date.now() - sessionStartedAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStartedAt, tick]);

  const initials = useMemo(() => {
    const source = user?.name || user?.email || '';
    if (!source) return 'U';
    const parts = source.split(/[\s@.]+/).filter(Boolean);
    return ((parts[0]?.[0] || 'U') + (parts[1]?.[0] || '')).toUpperCase();
  }, [user]);

  return (
    <div className="appheader">
      <div className="appheader__bar glassyfinish">
        <div className="sessionbadge">
          <div className="indicator" />
          <p>SESSION&nbsp;<span>{elapsed}</span></p>
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
            {initials}
          </div>
        </div>
      </div>
    </div>
  );
}
