import { useEffect, useState } from 'react';
import { invoke, hasBridge } from '@/app/bridge/invoke';

import './SettingsPanel.css';

/**
 * In-dropdown Volume + Display controls.
 *
 * The user wanted these to be directly manageable from the settings cog
 * popover instead of navigating to a dedicated page. This component is
 * the inline control center.
 *
 * Persistence: localStorage today + best-effort `invoke()` calls to a
 * future C# bridge (TECH_DEBT #25). When the C# host registers
 * `set_system_volume` / `set_display_brightness` handlers, this panel
 * starts actually controlling the kiosk PC with zero React changes.
 */

const SOUND_KEY = 'clutchhh.sound.settings';
const DISPLAY_KEY = 'clutchhh.display.settings';

function loadJSON(key, fallback) {
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(key) || '{}') };
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { /* ignore */ }
}

function Slider({ label, value, onChange, min = 0, max = 100 }) {
  // Compute the filled-portion percentage so the CSS linear-gradient
  // shows the orange-red fill up to the thumb and dark track after.
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  return (
    <label className="sp-slider-row">
      <span className="sp-slider-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="sp-slider"
        style={{ '--fill': `${pct}%` }}
        aria-label={label}
      />
      <span className="sp-slider-value">{value}%</span>
    </label>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <label className="sp-toggle-row">
      <span className="sp-toggle-label">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        className={`sp-toggle${value ? ' is-on' : ''}`}
        onClick={() => onChange(!value)}
      >
        <span className="sp-toggle-knob" />
      </button>
    </label>
  );
}

export default function SettingsPanel() {
  const [sound, setSound] = useState(() => loadJSON(SOUND_KEY, {
    master: 80, music: 60, effects: 70, muted: false,
  }));
  const [display, setDisplay] = useState(() => loadJSON(DISPLAY_KEY, {
    brightness: 80, nightMode: false,
  }));

  // Read OS state on mount if bridge is live. Silent fallback when not.
  useEffect(() => {
    if (!hasBridge()) return;
    invoke('get_system_volume')
      .then((res) => {
        if (res && typeof res.percent === 'number') {
          setSound((prev) => ({ ...prev, master: res.percent, muted: !!res.muted }));
        }
      })
      .catch(() => { /* bridge method not registered yet */ });
    invoke('get_display_brightness')
      .then((res) => {
        if (res && typeof res.percent === 'number') {
          setDisplay((prev) => ({ ...prev, brightness: res.percent }));
        }
      })
      .catch(() => { /* bridge method not registered yet */ });
  }, []);

  // Persist + push to OS whenever a control moves.
  useEffect(() => {
    saveJSON(SOUND_KEY, sound);
    if (hasBridge()) {
      invoke('set_system_volume', {
        percent: sound.master,
        muted: sound.muted,
      }).catch(() => {});
    }
  }, [sound]);

  useEffect(() => {
    saveJSON(DISPLAY_KEY, display);
    if (hasBridge()) {
      invoke('set_display_brightness', {
        percent: display.brightness,
      }).catch(() => {});
    }
  }, [display]);

  return (
    <div className="settingspanel">
      <div className="sp-section">
        <div className="sp-section-title">Volume Controls</div>
        <Slider
          label="Master Volume"
          value={sound.master}
          onChange={(v) => setSound((p) => ({ ...p, master: v }))}
        />
        <Slider
          label="System Sounds"
          value={sound.effects}
          onChange={(v) => setSound((p) => ({ ...p, effects: v }))}
        />
        <Slider
          label="Game Audio"
          value={sound.music}
          onChange={(v) => setSound((p) => ({ ...p, music: v }))}
        />
        <Toggle
          label="Mute All"
          value={sound.muted}
          onChange={(v) => setSound((p) => ({ ...p, muted: v }))}
        />
      </div>

      <div className="sp-section">
        <div className="sp-section-title">Display</div>
        <Slider
          label="Brightness"
          value={display.brightness}
          min={10}
          max={100}
          onChange={(v) => setDisplay((p) => ({ ...p, brightness: v }))}
        />
        <Toggle
          label="Night Mode"
          value={display.nightMode}
          onChange={(v) => setDisplay((p) => ({ ...p, nightMode: v }))}
        />
      </div>
    </div>
  );
}
