/**
 * Games catalog — reads live data from /api/v1/games.
 *
 * Exposes the same `gamesService` namespace the rest of the app imports
 * PLUS a named `launch()` export that goes through the native host bridge
 * (`launch_game` in JsBridge.cs).
 */

import { apiGet } from '@/app/api/client';
import { invoke, hasBridge } from '@/app/bridge/invoke';
import { audit } from '@/app/api/audit';

function safeArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return v.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

function normalize(row) {
  if (!row) return null;
  const tags = safeArray(row.tags);
  const launchers = safeArray(row.launchers);
  const genre = tags[0] || row.genre || row.category || 'Game';
  return {
    id: row.id,
    name: row.name,
    genre,
    category: row.category || 'game',
    enabled: row.enabled !== false,
    ageRating: row.age_rating ?? null,
    rating: row.rating || (row.age_rating ? `A${row.age_rating}` : 'T'),
    tags,
    launchers,
    launcher: launchers[0] || row.launcher || 'Steam',
    website: row.website || '',
    imagePortrait: row.image_600x900 || row.icon_url || '',
    imageBackground: row.image_background || '',
    logo: row.logo_url || row.icon_url || '',
    exePath: row.exe_path || '',
    version: row.version || '',
    free: row.is_free === true,
    isFree: row.is_free === true,
    players: row.players || row.player_count || '—',
    badge: row.badge ?? null,
  };
}

async function fetchCategory(category, opts = {}) {
  const rows = await apiGet('/api/v1/games', {
    enabled: true,
    category,
    search: opts.search,
    limit: opts.limit ?? 100,
    skip: opts.skip ?? 0,
  }).catch(() => []);
  return Array.isArray(rows) ? rows.map(normalize).filter(Boolean) : [];
}

export const gamesService = {
  list: (opts) => fetchCategory('game', opts),
  listApps: (opts) => fetchCategory('app', opts),
  async byId(id) {
    if (id === undefined || id === null) return null;
    try {
      return normalize(await apiGet(`/api/v1/games/${id}`));
    } catch {
      const all = await fetchCategory('game');
      return all.find((g) => String(g.id) === String(id)) || null;
    }
  },
  async top(n = 5) {
    const all = await fetchCategory('game');
    return all.slice(0, n);
  },
};

export async function launch(game) {
  if (!hasBridge()) throw new Error('Game launcher is only available on the kiosk host.');
  if (!game) throw new Error('No game selected.');
  audit('game.launch.start', { id: game.id, name: game.name, launcher: game.launcher });
  try {
    const res = await invoke('launch_game', {
      game_id: typeof game.id === 'number' ? game.id : undefined,
      executable_path: game.exePath || undefined,
      game_name: game.name,
      name: game.name,
    });
    if (res && res.success === false) {
      audit('game.launch.fail', { id: game.id, name: game.name });
      throw new Error('The game failed to launch.');
    }
    audit('game.launch.ok', { id: game.id, name: game.name, pid: res?.pid });
    return res;
  } catch (err) {
    audit('game.launch.fail', { id: game.id, name: game.name, error: err?.message });
    throw err;
  }
}

export default gamesService;
