import { useEffect, useState } from 'react';
import PlaceholderPage from '@/components/common/PlaceholderPage';
import { Card } from '@/components/common';
import { ROUTES } from '@/app/routes/paths';
import { invoke, hasBridge } from '@/app/bridge/invoke';

const STORAGE_KEY = 'clutchh.sound.settings';

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}
function save(s) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export default function SoundSettingsPage() {
  const [settings, setSettings] = useState(() => ({
    master: 80,
    music: 60,
    effects: 70,
    muted: false,
    ...load(),
  }));

  // On mount, ask the C# host for the actual system volume so the
  // slider starts where the OS already is. If the bridge isn't
  // available (e.g. running in vite dev outside the kiosk), the local
  // default + localStorage fall-through still works.
  useEffect(() => {
    if (!hasBridge()) return;
    invoke('get_system_volume')
      .then((res) => {
        if (res && typeof res.percent === 'number') {
          setSettings((prev) => ({
            ...prev,
            master: res.percent,
            muted: !!res.muted,
          }));
        }
      })
      .catch(() => { /* bridge method not registered — fall back */ });
  }, []);

  useEffect(() => {
    save(settings);
    if (hasBridge()) {
      // Best-effort push to OS volume. Silent no-op if the C# host
      // hasn't registered the method yet (current state — see
      // TECH_DEBT #25).
      invoke('set_system_volume', {
        percent: settings.master,
        muted: settings.muted,
      }).catch(() => {});
    }
  }, [settings]);

  const Row = ({ label, keyName }) => (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#9CA3AF' }}>
        <span>{label}</span>
        <span>{settings[keyName]}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={settings[keyName]}
        onChange={(e) =>
          setSettings((prev) => ({ ...prev, [keyName]: Number(e.target.value) }))
        }
        style={{ width: '100%' }}
      />
    </label>
  );

  return (
    <PlaceholderPage title="Sound" subtitle="Local audio preferences" backTo={ROUTES.home}>
      <Card>
        <Row label="Master" keyName="master" />
        <Row label="Music" keyName="music" />
        <Row label="Sound effects" keyName="effects" />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#E5E7EB' }}>
          <input
            type="checkbox"
            checked={settings.muted}
            onChange={(e) => setSettings((prev) => ({ ...prev, muted: e.target.checked }))}
          />
          Mute everything
        </label>
        <div style={{ color: '#6B7280', fontSize: 12, marginTop: 14 }}>
          Master volume + mute are pushed to the kiosk's system audio when the host
          bridge is available. Music / effects sliders are local-only for now.
        </div>
      </Card>
    </PlaceholderPage>
  );
}
