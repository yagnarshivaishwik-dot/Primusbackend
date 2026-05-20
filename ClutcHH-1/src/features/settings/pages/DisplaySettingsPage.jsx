import { useEffect, useState } from 'react';
import PlaceholderPage from '@/components/common/PlaceholderPage';
import { Card } from '@/components/common';
import { ROUTES } from '@/app/routes/paths';
import { invoke, hasBridge } from '@/app/bridge/invoke';

/**
 * Display settings — brightness control. Currently a stub.
 *
 * TODO (TECH_DEBT #25): wire to a real C# bridge that calls Windows
 * WMI `WmiMonitorBrightnessMethods` so the slider actually changes
 * the kiosk monitor's brightness. Today it just persists the value
 * to localStorage and tries the bridge if it exists — which it
 * doesn't yet — so the slider is effectively decorative.
 */

const STORAGE_KEY = 'clutchhh.display.settings';

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
}

function save(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }
  catch { /* ignore */ }
}

export default function DisplaySettingsPage() {
  const [settings, setSettings] = useState(() => ({
    brightness: 80,
    nightMode: false,
    ...load(),
  }));

  useEffect(() => {
    save(settings);
    // Best-effort: try to push the brightness to the OS via the
    // bridge. If the method isn't registered (current state of the
    // C# host), this just silently no-ops.
    if (hasBridge()) {
      invoke('set_display_brightness', { percent: settings.brightness }).catch(() => {});
    }
  }, [settings]);

  // On mount, read the OS brightness if the bridge exposes it.
  useEffect(() => {
    if (!hasBridge()) return;
    invoke('get_display_brightness')
      .then((res) => {
        if (res && typeof res.percent === 'number') {
          setSettings((prev) => ({ ...prev, brightness: res.percent }));
        }
      })
      .catch(() => { /* bridge method not registered yet */ });
  }, []);

  return (
    <PlaceholderPage title="Display" subtitle="Brightness & theme" backTo={ROUTES.home}>
      <Card>
        <label style={{ display: 'block', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#9CA3AF' }}>
            <span>Brightness</span>
            <span>{settings.brightness}%</span>
          </div>
          <input
            type="range"
            min={10}
            max={100}
            value={settings.brightness}
            onChange={(e) =>
              setSettings((prev) => ({ ...prev, brightness: Number(e.target.value) }))
            }
            style={{ width: '100%' }}
          />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#E5E7EB' }}>
          <input
            type="checkbox"
            checked={settings.nightMode}
            onChange={(e) => setSettings((prev) => ({ ...prev, nightMode: e.target.checked }))}
          />
          Night mode (warmer tones)
        </label>

        <div style={{ color: '#6B7280', fontSize: 12, marginTop: 14 }}>
          Brightness control writes to the kiosk's system display when the host bridge
          is available. Otherwise the value is stored locally for the next session.
        </div>
      </Card>
    </PlaceholderPage>
  );
}
