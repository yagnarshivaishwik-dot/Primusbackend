import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import useSessionStore from '@/app/store/useSessionStore';
import AppHeader from '@/components/layout/AppHeader';
import { ROUTES } from '@/app/routes/paths';
import {
  CURATED_AVATARS,
  curatedUrl,
  identiconUrl,
  randomSeed,
} from '@/features/appearance/services/avatarsService';

import './AppearancePage.css';

/**
 * Appearance page — pick a curated avatar OR generate an identicon.
 *
 * Replaces the avatar-dropdown "Profile" entry. The chosen image URL
 * lands on `useSessionStore.avatar` (persisted via the store's
 * localStorage middleware). AppHeader + the Rewards profile card read
 * that field and render it in place of the user's initials.
 */
export default function AppearancePage() {
  const navigate = useNavigate();
  const currentAvatar = useSessionStore((s) => s.avatar);
  const setAvatar = useSessionStore((s) => s.setAvatar);

  // Build URLs for the curated tiles once — they never change.
  const presets = useMemo(
    () => CURATED_AVATARS.map((p) => ({ ...p, url: curatedUrl(p) })),
    [],
  );

  // Identicon "scratch pad" — 6 random seeds the user can re-roll. The
  // `custom` input lets them lock to a specific seed if they like one
  // they've seen before.
  const [identiconSeeds, setIdenticonSeeds] = useState(() =>
    Array.from({ length: 6 }, () => randomSeed()),
  );
  const [customSeed, setCustomSeed] = useState('');

  // Optimistic local pick (so the customer sees the highlight move
  // before they confirm). Confirm with Save → writes to store.
  const [pendingUrl, setPendingUrl] = useState(currentAvatar);

  const handleRandomize = () => {
    setIdenticonSeeds(Array.from({ length: 6 }, () => randomSeed()));
  };

  const handleCustomSeedChange = (e) => {
    setCustomSeed(e.target.value);
  };

  const handlePick = (url) => {
    setPendingUrl(url);
  };

  const handleSave = () => {
    setAvatar(pendingUrl || null);
    navigate(-1);
  };

  const handleClear = () => {
    setPendingUrl(null);
  };

  const customIdenticon = customSeed.trim() ? identiconUrl(customSeed.trim()) : null;

  return (
    <div className="appearanceContainer">
      <AppHeader />

      <div className="appearance-body">
        <header className="appearance-header">
          <h1>Appearance</h1>
          <p>Pick a curated avatar or generate your own identicon.</p>
        </header>

        {/* --- Curated avatars (Option A) ----------------------- */}
        <section className="appearance-section">
          <h2 className="appearance-section__title">Curated</h2>
          <div className="appearance-grid">
            {presets.map((p) => {
              const selected = pendingUrl === p.url;
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`avatar-tile${selected ? ' is-selected' : ''}`}
                  onClick={() => handlePick(p.url)}
                  aria-pressed={selected}
                  aria-label={`Pick ${p.seed}`}
                >
                  <img src={p.url} alt="" loading="lazy" />
                </button>
              );
            })}
          </div>
        </section>

        {/* --- Identicons (Option C) ---------------------------- */}
        <section className="appearance-section">
          <div className="appearance-section__head">
            <h2 className="appearance-section__title">Generate your own</h2>
            <button
              type="button"
              className="appearance-randomize"
              onClick={handleRandomize}
            >
              ↻ Randomize
            </button>
          </div>

          <div className="appearance-grid">
            {identiconSeeds.map((seed) => {
              const url = identiconUrl(seed);
              const selected = pendingUrl === url;
              return (
                <button
                  key={seed}
                  type="button"
                  className={`avatar-tile${selected ? ' is-selected' : ''}`}
                  onClick={() => handlePick(url)}
                  aria-pressed={selected}
                  aria-label={`Identicon ${seed}`}
                >
                  <img src={url} alt="" loading="lazy" />
                </button>
              );
            })}
          </div>

          <div className="appearance-customseed">
            <label htmlFor="seed-input">Custom seed</label>
            <input
              id="seed-input"
              type="text"
              value={customSeed}
              onChange={handleCustomSeedChange}
              placeholder="Type anything — same word always makes the same avatar"
              maxLength={64}
            />
            {customIdenticon && (
              <button
                type="button"
                className={`avatar-tile avatar-tile--single${pendingUrl === customIdenticon ? ' is-selected' : ''}`}
                onClick={() => handlePick(customIdenticon)}
                aria-label="Pick custom identicon"
              >
                <img src={customIdenticon} alt="" loading="lazy" />
              </button>
            )}
          </div>
        </section>

        {/* --- Sticky save footer ------------------------------- */}
        <div className="appearance-footer">
          <button
            type="button"
            className="appearance-btn appearance-btn--ghost"
            onClick={handleClear}
            disabled={!pendingUrl}
          >
            Use initials
          </button>
          <button
            type="button"
            className="appearance-btn appearance-btn--ghost"
            onClick={() => navigate(-1)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="appearance-btn appearance-btn--primary"
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
