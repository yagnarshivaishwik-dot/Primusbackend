import { useEffect, useMemo, useState } from 'react';
import { IoGameControllerOutline } from 'react-icons/io5';
import { TbApps } from 'react-icons/tb';
import { FaStar, FaStarHalfAlt } from 'react-icons/fa';

import * as prizesService from '@/features/prizeVault/services/prizesService';
import { homeService } from '@/features/home/services/homeService';
import useWalletStore from '@/app/store/useWalletStore';
import useSessionStore from '@/app/store/useSessionStore';
import AppHeader from '@/components/layout/AppHeader';

import PrizeCarousel from './PrizeCarousel';
import ChallengeCarousel from './ChallengeCarousel';
import './PrizeVaultPage.css';

/**
 * Awards / Rewards page — Pavan's full design.
 *
 * Layout: profile card with experience bar + 4 stat boxes, then a
 * tab row (Challenges / Badges / Leaderboard / Prize Vault) plus a
 * coins pill, then the active tab's content.
 *
 * Data wiring:
 *   - Coins: real, from useWalletStore.
 *   - Name + initials: real, from useSessionStore.
 *   - Everything else (LVL, XP, streak, hours played, badges count,
 *     completed count, badge grid, leaderboard) is PLACEHOLDER right
 *     now — no backend support yet. Tracked in TECH_DEBT:
 *       #19 (xp column missing → no level/xp data)
 *       #21 (quest admin + progression engine → no Completed metric)
 *       #25 (no hours-played endpoint, no streak tracker, no badges
 *            system, no leaderboard wiring — all needed for this page
 *            to go fully live)
 *   - Filters on Badges + Leaderboard tabs are visual-only chips for
 *     now (no real filtering since the data underneath is mock).
 */

const FILTER_TAGS = ['All', 'FPS', 'RPG', 'MOBA', 'Battle Royale', 'Strategy', 'Sports', 'India'];

const PLACEHOLDER_BADGES = Array.from({ length: 9 }, (_, i) => ({
  id: `badge-${i}`,
  title: 'First Timer',
  stars: 1.5, // out of 5; .5 step renders a half star
  earnedYear: 2026,
}));

const PLACEHOLDER_LEADERBOARD = [
  { id: 'p1', initials: 'NK', name: 'Night King', medal: '🥈', hours: '134h 7m', score: 2430, podium: 'leadersecond' },
  { id: 'p2', initials: 'NK', name: 'Night King', medal: '🥇', hours: '134h 7m', score: 2430, podium: 'leaderfirst' },
  { id: 'p3', initials: 'NK', name: 'Night King', medal: '🥉', hours: '134h 7m', score: 2430, podium: 'leaderthird' },
];

const TABS = [
  { id: 'challenges', label: 'Challenges', icon: <IoGameControllerOutline /> },
  { id: 'badges', label: 'Badges', icon: <TbApps /> },
  { id: 'leaderboard', label: 'Leaderboard', icon: <TbApps /> },
  { id: 'prizevault', label: 'Prizevault', icon: <TbApps /> },
];

function StarRow({ stars = 0 }) {
  // Renders 5 stars: full / half / empty based on `stars` value.
  return (
    <div className="stars">
      {Array.from({ length: 5 }, (_, i) => {
        const filled = stars - i;
        if (filled >= 1) return <FaStar key={i} className="active" />;
        if (filled >= 0.5) return <FaStarHalfAlt key={i} className="active" />;
        return <FaStar key={i} />;
      })}
    </div>
  );
}

export default function PrizeVaultPage() {
  const user = useSessionStore((s) => s.user);
  const coins = useWalletStore((s) => s.coins);
  const hydrate = useWalletStore((s) => s.hydrate);

  const [tab, setTab] = useState('challenges');
  const [activeFilter, setActiveFilter] = useState('All');

  // Real prizes
  const [prizes, setPrizes] = useState([]);
  const [prizesLoading, setPrizesLoading] = useState(true);
  const [prizesError, setPrizesError] = useState(null);
  const [redeeming, setRedeeming] = useState(null);
  const [feedback, setFeedback] = useState(null);

  // Claim state (placeholder quests on the Challenges tab)
  const [claimedKinds, setClaimedKinds] = useState([]);
  const [claimingKind, setClaimingKind] = useState(null);
  const [claimError, setClaimError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPrizesLoading(true);
      setPrizesError(null);
      try {
        const list = await prizesService.list();
        if (!cancelled) setPrizes(list);
      } catch (err) {
        if (!cancelled) setPrizesError(err?.message || 'Failed to load prizes.');
      } finally {
        if (!cancelled) setPrizesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await homeService.getClaimStatus();
        if (cancelled) return;
        const already = Object.entries(status || {})
          .filter(([, claimed]) => claimed)
          .map(([kind]) => kind);
        if (already.length > 0) setClaimedKinds(already);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const displayName = user?.name || user?.email?.split('@')[0] || 'Guest';
  const initials = useMemo(() => {
    const source = user?.name || user?.email || 'U';
    const parts = source.split(/[\s@.]+/).filter(Boolean);
    return ((parts[0]?.[0] || 'U') + (parts[1]?.[0] || '')).toUpperCase();
  }, [user]);

  const handleRedeem = async (prize) => {
    if (redeeming) return;
    if (coins != null && coins < prize.coinCost) {
      setFeedback({ type: 'error', text: `Need ${prize.coinCost - coins} more coins.` });
      return;
    }
    setRedeeming(prize.id);
    setFeedback(null);
    try {
      await prizesService.redeem(prize.id);
      setFeedback({ type: 'ok', text: `Redeemed "${prize.name}".` });
      const list = await prizesService.list();
      setPrizes(list);
      try { await hydrate({}); } catch { /* ignore */ }
    } catch (err) {
      setFeedback({ type: 'error', text: err?.message || 'Redemption failed.' });
    } finally {
      setRedeeming(null);
    }
  };

  const handleClaim = async (kind) => {
    if (!kind || claimingKind) return;
    setClaimError(null);
    setClaimingKind(kind);
    try {
      await homeService.claimPlaceholder(kind);
      setClaimedKinds((prev) => (prev.includes(kind) ? prev : [...prev, kind]));
      try { await hydrate({}); } catch { /* ignore */ }
    } catch (err) {
      if (err?.status === 409) {
        setClaimedKinds((prev) => (prev.includes(kind) ? prev : [...prev, kind]));
      } else {
        setClaimError(err?.message || 'Claim failed.');
      }
    } finally {
      setClaimingKind(null);
    }
  };

  return (
    <div className="AwardsContainer">
      <AppHeader />

      {/* Profile card --------------------------------------------------- */}
      <div className="profile-card glassyfinish">
        <div className="top-section">
          <div className="profile-left">
            <div className="profile-img profile-img--initials">{initials}</div>
            <div className="user-info">
              <h2>{displayName}</h2>
              <p>Veteran Gamer</p>
            </div>
          </div>

          <div className="profile-tags">
            <div className="tag">LVL 32</div>
            <div className="tag">7 days Streak</div>
          </div>

          <div className="experience">
            <div className="exp-top">
              <strong>Experience</strong>
              <span>2,350 / 10,000 XP</span>
            </div>
            <div className="statsbar">
              <div className="statsprogress" style={{ width: '23.5%' }} />
            </div>
            <div className="exp-text">7,650 XP to Level 3</div>
          </div>
        </div>

        <div className="stats">
          <div className="stat-box">
            <p>Hours Played</p>
            <h3>156</h3>
          </div>
          <div className="stat-box">
            <p>Badges</p>
            <h3>23/45</h3>
          </div>
          <div className="stat-box">
            <p>Completed</p>
            <h3>12</h3>
          </div>
          <div className="stat-box">
            <p>Coins Earned</p>
            <h3>{(coins ?? 0).toLocaleString()}</h3>
          </div>
        </div>
      </div>

      {/* Tab row + coins pill ------------------------------------------ */}
      <div className="filtercoins">
        <div className="tabs Awardstabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`tab-btn${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
        <button type="button" className="coinsbtn">
          <IoGameControllerOutline />
          {(coins ?? 0).toLocaleString()}<span>coins</span>
        </button>
      </div>

      {(feedback || claimError) && (
        <div
          role="status"
          style={{
            margin: '0 auto 16px',
            padding: '10px 14px',
            borderRadius: 10,
            fontSize: 13,
            maxWidth: 600,
            background: (feedback?.type === 'error' || claimError) ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
            border: `1px solid ${(feedback?.type === 'error' || claimError) ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
            color: (feedback?.type === 'error' || claimError) ? '#fca5a5' : '#86efac',
            textAlign: 'center',
          }}
        >
          {feedback?.text || claimError}
        </div>
      )}

      {/* Tab panels ----------------------------------------------------- */}
      {tab === 'challenges' && (
        <div className="displaycontent Challengestab">
          <ChallengeCarousel
            claimedKinds={claimedKinds}
            claimingKind={claimingKind}
            onClaim={handleClaim}
          />
        </div>
      )}

      {tab === 'badges' && (
        <div className="displaycontent Badgestab">
          <div className="filters challengefilters">
            {FILTER_TAGS.map((t) => (
              <button
                key={t}
                type="button"
                className={`filter-btn${activeFilter === t ? ' active' : ''}`}
                onClick={() => setActiveFilter(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="card-wrapper">
            {PLACEHOLDER_BADGES.map((b) => (
              <div className="badge-card" key={b.id}>
                <div className="badge-icon" />
                <h2 className="badge-title">{b.title}</h2>
                <StarRow stars={b.stars} />
                <p className="earned">Earned {b.earnedYear}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'leaderboard' && (
        <div className="displaycontent Leaderboardtab">
          <div className="filters challengefilters">
            {FILTER_TAGS.map((t) => (
              <button
                key={t}
                type="button"
                className={`filter-btn${activeFilter === t ? ' active' : ''}`}
                onClick={() => setActiveFilter(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="leaderboard glassyfinish">
            <div className="leadertoptext">
              Your Rank: <span>#10</span> out of 128 Players
            </div>
            <div className="leaderbadge">Top 8%</div>
            <div className="leaderplayers">
              {PLACEHOLDER_LEADERBOARD.map((p) => (
                <div className={`leaderplayer ${p.podium}`} key={p.id}>
                  <div className="leaderavatar">{p.initials}</div>
                  <div className="leadermedal">{p.medal}</div>
                  <div className="leadername">{p.name}</div>
                  <div className="leadertime">{p.hours}</div>
                  <div className="leaderpodium">{p.score.toLocaleString()}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'prizevault' && (
        <div className="displaycontent Prizevaulttab">
          <PrizeCarousel
            prizes={prizes}
            loading={prizesLoading}
            error={prizesError}
            coins={coins}
            redeemingId={redeeming}
            onRedeem={handleRedeem}
          />
        </div>
      )}
    </div>
  );
}
