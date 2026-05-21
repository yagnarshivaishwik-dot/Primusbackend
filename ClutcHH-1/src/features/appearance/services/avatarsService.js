/**
 * Avatar source-of-truth for the Appearance page.
 *
 * Two paths to a personal avatar without an upload pipeline:
 *
 * 1. CURATED presets — a hand-picked list of Dicebear seeds across the
 *    `fun-emoji` and `bottts-neutral` styles. Each renders as a polished
 *    SVG fetched directly from api.dicebear.com — no backend storage,
 *    no moderation, no upload UI. Customer just taps one.
 *
 * 2. IDENTICONS — procedural Dicebear `identicon` style. We surface a
 *    Randomize button + an optional seed input so the customer can
 *    keep generating until they like the result. Each identicon is
 *    derived from a string seed; same seed → same image, anywhere.
 *
 * Persistence: the chosen URL is stored on `useSessionStore.avatar`,
 * which persists to localStorage automatically. TECH_DEBT #27 covers
 * the proper backend column work (`users.avatar_url`) — until that
 * lands, the avatar is per-kiosk-PC.
 */

const DICEBEAR_BASE = 'https://api.dicebear.com/7.x';

/**
 * Curated avatar tiles. Each entry pairs a Dicebear style with a fixed
 * seed so the same tile always renders the same picture (lets the
 * Appearance page tell which one is currently selected).
 */
export const CURATED_AVATARS = [
  // Fun-emoji style — colourful character emojis
  { id: 'gladiator', style: 'fun-emoji', seed: 'Gladiator' },
  { id: 'firewall', style: 'fun-emoji', seed: 'Firewall' },
  { id: 'maverick', style: 'fun-emoji', seed: 'Maverick' },
  { id: 'starlord', style: 'fun-emoji', seed: 'Starlord' },
  { id: 'nightowl', style: 'fun-emoji', seed: 'Nightowl' },
  { id: 'phoenix',  style: 'fun-emoji', seed: 'Phoenix'  },
  // Bottts (robot) style — cyberpunk vibe for kiosk customers
  { id: 'bot-alpha',   style: 'bottts-neutral', seed: 'Alpha7' },
  { id: 'bot-circuit', style: 'bottts-neutral', seed: 'Circuit88' },
  { id: 'bot-nimbus',  style: 'bottts-neutral', seed: 'Nimbus' },
  { id: 'bot-vector',  style: 'bottts-neutral', seed: 'Vector' },
  { id: 'bot-glitch',  style: 'bottts-neutral', seed: 'GlitchKid' },
  { id: 'bot-pulse',   style: 'bottts-neutral', seed: 'Pulse99' },
];

/** Build the SVG URL for a Dicebear avatar of the given style + seed. */
export function buildAvatarUrl(style, seed) {
  if (!style || !seed) return null;
  const safeSeed = encodeURIComponent(String(seed));
  return `${DICEBEAR_BASE}/${style}/svg?seed=${safeSeed}`;
}

/** Resolve a curated preset entry → full URL. */
export function curatedUrl(preset) {
  if (!preset) return null;
  return buildAvatarUrl(preset.style, preset.seed);
}

/** Random short string used to seed an identicon. Hex chars only so the
 *  seed reads cleanly in the input box. */
export function randomSeed() {
  return Math.random().toString(16).slice(2, 10);
}

/** Build an identicon URL from a free-form seed string. */
export function identiconUrl(seed) {
  return buildAvatarUrl('identicon', seed || randomSeed());
}
