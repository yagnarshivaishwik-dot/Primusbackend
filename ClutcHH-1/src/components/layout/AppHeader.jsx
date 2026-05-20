import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IoSettingsOutline } from 'react-icons/io5';
import { IoIosArrowDown } from 'react-icons/io';

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
 * - Settings cog → click-triggered dropdown (Help / Sound).
 * - Avatar → click-triggered dropdown (Profile / Log out).
 *
 * Click-triggered rather than hover-triggered so it works on touch
 * kiosks. Click-outside closes whichever dropdown is open.
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
  const signOut = useSessionStore((s) => s.signOut);

  // 'settings' | 'avatar' | null — only one dropdown open at a time.
  const [openMenu, setOpenMenu] = useState(null);
  const headerRef = useRef(null);

  // Tick once per second so the displayed clock stays current.
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

  // Click-outside to close. Listening at document level catches clicks
  // on any page content; the headerRef check leaves clicks on the menu
  // itself untouched (those are handled by the item onClick handlers).
  useEffect(() => {
    if (!openMenu) return undefined;
    const onDocClick = (e) => {
      if (headerRef.current && !headerRef.current.contains(e.target)) {
        setOpenMenu(null);
      }
    };
    const onEsc = (e) => { if (e.key === 'Escape') setOpenMenu(null); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [openMenu]);

  const toggleMenu = useCallback((which) => {
    setOpenMenu((cur) => (cur === which ? null : which));
  }, []);

  const go = useCallback((route) => {
    setOpenMenu(null);
    navigate(route);
  }, [navigate]);

  const handleSignOut = useCallback(async () => {
    setOpenMenu(null);
    try { await signOut(); } catch { /* ignore */ }
    navigate(ROUTES.login, { replace: true });
  }, [navigate, signOut]);

  return (
    <div className="appheader" ref={headerRef}>
      <div className="appheader__bar glassyfinish">
        <div className="sessionbadge">
          <div className="indicator" />
          <p>SESSION&nbsp;<span>{elapsed}</span></p>
        </div>

        <div className="shoplogo">No<span>Lag</span></div>

        <div className="headerright">
          {/* Settings cog with dropdown */}
          <div className={`dropdownwrapper ${openMenu === 'settings' ? 'is-open' : ''}`}>
            <button
              type="button"
              className="iconbtn"
              aria-haspopup="menu"
              aria-expanded={openMenu === 'settings'}
              aria-label="Settings menu"
              onClick={() => toggleMenu('settings')}
            >
              <IoSettingsOutline />
            </button>
            <div className="dropdownmenu" role="menu">
              <button type="button" role="menuitem" onClick={() => go(ROUTES.settingsHelp)}>
                Help
              </button>
              <button type="button" role="menuitem" onClick={() => go(ROUTES.settingsSound)}>
                Sound
              </button>
            </div>
          </div>

          {/* Avatar with dropdown */}
          <div className={`userlogin dropdownwrapper ${openMenu === 'avatar' ? 'is-open' : ''}`}>
            <button
              type="button"
              className="useravatar"
              aria-haspopup="menu"
              aria-expanded={openMenu === 'avatar'}
              aria-label="Profile menu"
              onClick={() => toggleMenu('avatar')}
            >
              {initials}
            </button>
            <button
              type="button"
              className="avatardropdown"
              aria-haspopup="menu"
              aria-expanded={openMenu === 'avatar'}
              aria-label="Profile menu"
              onClick={() => toggleMenu('avatar')}
            >
              <IoIosArrowDown />
            </button>
            <div className="dropdownmenu" role="menu">
              <button type="button" role="menuitem" onClick={() => go(ROUTES.mainProfile)}>
                Profile
              </button>
              <button type="button" role="menuitem" className="dropdownmenu__danger" onClick={handleSignOut}>
                Log out
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
