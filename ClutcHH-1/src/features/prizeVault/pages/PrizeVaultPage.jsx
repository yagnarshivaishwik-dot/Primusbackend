import { useEffect, useMemo, useState } from 'react';
import { IoGameControllerOutline } from 'react-icons/io5';
import { TbApps } from 'react-icons/tb';
import { FaStar, FaStarHalfAlt } from 'react-icons/fa';

import * as prizesService from '@/features/prizeVault/services/prizesService';
import { homeService } from '@/features/home/services/homeService';
import { listEvents, claimEvent } from '@/features/quests/services/eventsService';
import * as lb from '@/features/leaderboard/services/leaderboardService';
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
  const avatar = useSessionStore((s) => s.avatar);
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

  // Real challenges (backend Event rows) + claim state per event.
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [claimingEventId, setClaimingEventId] = useState(null);

  // Leaderboard (live entries with hardcoded podium fallback when empty).
  const [boards, setBoards] = useState([]);
  const [activeBoardId, setActiveBoardId] = useState(null);
  const [boardEntries, setBoardEntries] = useState([]);
  const [boardLoading, setBoardLoading] = useState(true);

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

  // Load real challenges (backend Event rows) for the Challenges tab.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setEventsLoading(true);
      try {
        const rows = await listEvents();
        if (!cancelled) setEvents(rows);
      } catch {
        if (!cancelled) setEvents([]);
      } finally {
        if (!cancelled) setEventsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Load leaderboards + first board's entries.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBoardLoading(true);
      try {
        const list = await lb.list();
        if (cancelled) return;
        setBoards(list);
        if (list.length > 0) {
          setActiveBoardId(list[0].id);
          const entries = await lb.entries(list[0].id);
          if (!cancelled) setBoardEntries(entries);
        }
      } catch {
        if (!cancelled) { setBoards([]); setBoardEntries([]); }
      } finally {
        if (!cancelled) setBoardLoading(false);
      }
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

  // Claim a real backend Event (challenge) for its coin reward.
  // Backend is idempotent on already-completed events, so re-clicking
  // a "Claimed" badge is safe.
  const handleEventClaim = async (eventId) => {
    if (!eventId || claimingEventId) return;
    setClaimError(null);
    setClaimingEventId(eventId);
    try {
      const updated = await claimEvent(eventId);
      // Refresh the local event row's completed flag so the button flips.
      setEvents((prev) => prev.map((e) => (
        e.id === eventId ? { ...e, completed: !!updated?.completed } : e
      )));
      try { await hydrate({}); } catch { /* ignore */ }
    } catch (err) {
      setClaimError(err?.message || 'Claim failed.');
    } finally {
      setClaimingEventId(null);
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
            {avatar ? (
              <img className="profile-img" src={avatar} alt="" />
            ) : (
              <div className="profile-img profile-img--initials">{initials}</div>
            )}
            <div className="user-info">
              <h2>{displayName}</h2>
              <p>Veteran Gamer</p>
            </div>
          </div>

          <div className="profile-tags">
            <div className="tag">LVL 32</div>
            <div className="tag">7 days Streak</div>
          </div>

          {/* Experience bar intentionally hidden until the backend has a
              real XP column. Showing fake static numbers (2,350 / 10,000
              XP) here would be misleading the customer. TECH_DEBT #19
              tracks the schema work needed to bring this back live. */}
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
          {/* Placeholder daily quests (Daily Check-In / Streak / Hour Power)
              — same source of truth as the Home page. */}
          <ChallengeCarousel
            claimedKinds={claimedKinds}
            claimingKind={claimingKind}
            onClaim={handleClaim}
          />

          {/* Real backend challenges, listed below the placeholder carousel
              so the customer sees both. Each row shows progress vs target
              and a Claim button when complete. */}
          <div className="real-challenges">
            <h3 className="real-challenges__title">All Challenges</h3>
            {eventsLoading && (
              <div style={{ padding: 16, color: '#9CA3AF' }}>Loading challenges…</div>
            )}
            {!eventsLoading && events.length === 0 && (
              <div style={{ padding: 16, color: '#9CA3AF' }}>
                No active challenges right now. Check back once an admin publishes new ones.
              </div>
            )}
            {!eventsLoading && events.length > 0 && (
              <div className="real-challenges__grid">
                {events.map((evt) => {
                  const isCompleted = !!evt.completed;
                  const isClaiming = claimingEventId === evt.id;
                  const rewardText = (evt.rewardKind === 'coins' && evt.rewardAmount > 0)
                    ? `${evt.rewardAmount} coins`
                    : null;
                  return (
                    <div className="shopcard glassyfinish real-challenge-card" key={evt.id}>
                      <div className="daily-card">
                        <div className="daily-content">
                          <h2>{evt.name}</h2>
                          {evt.description && <p>{evt.description}</p>}
                          {evt.endTime && (
                            <p style={{ fontSize: 11, color: '#9CA3AF' }}>
                              Ends {new Date(evt.endTime).toLocaleDateString()}
                            </p>
                          )}
                          <div className="bottom-section">
                            {rewardText && (
                              <div className="reward">
                                <span className="coins">{rewardText}</span>
                              </div>
                            )}
                            <button
                              type="button"
                              className="coinsbtn"
                              disabled={isCompleted || isClaiming}
                              onClick={() => handleEventClaim(evt.id)}
                            >
                              {isCompleted ? 'Claimed' : isClaiming ? 'Claiming…' : 'Claim'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
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

          {boardLoading && (
            <div style={{ padding: 16, color: '#9CA3AF' }}>Loading leaderboard…</div>
          )}

          {!boardLoading && boardEntries.length > 0 && (() => {
            // Show real top-3 on the podium, then a list of any
            // remaining ranks below.
            const podium = boardEntries.slice(0, 3);
            const tail = boardEntries.slice(3);
            const podiumClass = ['leadersecond', 'leaderfirst', 'leaderthird'];
            const medal = ['🥈', '🥇', '🥉'];
            // Rebuild as [#2, #1, #3] so the visual centre is the top rank.
            const orderedPodium = podium.length === 3
              ? [podium[1], podium[0], podium[2]]
              : podium.map((p, i) => podium[i]); // fallback for <3 entries
            const orderedMeta = podium.length === 3
              ? [{ cls: 'leadersecond', m: '🥈' }, { cls: 'leaderfirst', m: '🥇' }, { cls: 'leaderthird', m: '🥉' }]
              : podium.map((_, i) => ({ cls: podiumClass[i], m: medal[i] }));

            const meIndex = boardEntries.findIndex((r) => (
              user && (String(user.id) === String(r.userId) || user.email === r.email)
            ));
            const myRank = meIndex >= 0 ? meIndex + 1 : null;

            return (
              <div className="leaderboard glassyfinish">
                {myRank && (
                  <div className="leadertoptext">
                    Your Rank: <span>#{myRank}</span> out of {boardEntries.length} Players
                  </div>
                )}
                <div className="leaderplayers">
                  {orderedPodium.map((p, i) => {
                    const meta = orderedMeta[i];
                    const initials = (p.name || 'P').slice(0, 2).toUpperCase();
                    return (
                      <div className={`leaderplayer ${meta.cls}`} key={`${p.userId || p.name}-${i}`}>
                        <div className="leaderavatar">{initials}</div>
                        <div className="leadermedal">{meta.m}</div>
                        <div className="leadername">{p.name}</div>
                        <div className="leaderpodium">{Number(p.score || 0).toLocaleString()}</div>
                      </div>
                    );
                  })}
                </div>

                {tail.length > 0 && (
                  <ul className="leaderboard__tail">
                    {tail.map((r) => (
                      <li key={`${r.userId || r.name}-${r.rank}`}>
                        <span className="leaderboard__tail-rank">#{r.rank}</span>
                        <span className="leaderboard__tail-name">{r.name}</span>
                        <span className="leaderboard__tail-score">{Number(r.score || 0).toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })()}

          {/* Fallback podium when the backend returns no entries — keeps
              the page from looking broken on a fresh cafe install. */}
          {!boardLoading && boardEntries.length === 0 && (
            <div className="leaderboard glassyfinish">
              <div className="leadertoptext">
                Leaderboard <span style={{ fontSize: 14, fontWeight: 600, color: '#9CA3AF' }}>
                  (no entries yet — preview)
                </span>
              </div>
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
          )}
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
