export const ROUTES = {
  root: '/',

  // Auth / setup
  initializing: '/initial-setup/initializing',
  login: '/auth/login',
  signup: '/auth/signup',
  forgotPassword: '/auth/forgot-password',
  resetPassword: '/auth/reset-password',

  // Main shell
  home: '/main/home',
  mainGames: '/main/apps/games',
  mainApps: '/main/apps/apps',
  mainArcade: '/main/apps/arcade',
  mainShop: '/main/shop',
  mainPrizeVault: '/main/prize-vault',
  mainProfile: '/main/profile',

  // Games
  gameDetail: '/game/:id',
  gameLaunch: '/game/launch',
  gameLogin: '/game/login',

  // Apps filters
  appsTools: '/apps/tools',
  appsLauncher: '/apps/launcher',

  // Shop
  shopDetail: '/shop/:id',

  // Prize vault
  prizeRedeem: '/prize-vault/redeem',

  // Challenges / Quests
  challenges: '/challenges',
  challengeDetail: '/challenges/:id',
  quests: '/quests',
  questDetail: '/quests/:id',

  // Profile
  profileStats: '/profile/stats',
  profileAchievements: '/profile/achievements',
  profileFriends: '/profile/friends',
  profileEdit: '/profile/edit',

  // Arcade
  arcadeDetail: '/arcade/:id',

  // Leaderboard
  leaderboard: '/leaderboard',

  // Settings
  settingsHelp: '/settings/help',
  settingsSound: '/settings/sound',
  settingsDisplay: '/settings/display',
  settingsInstalled: '/settings/installed',

  // Appearance — pick a curated avatar or generate an identicon.
  // Replaces the customer-facing "Profile" entry in the avatar dropdown;
  // the existing /main/profile page stays for direct deep-linking.
  appearance: '/appearance',
};

// Helpers for dynamic paths
export const buildPath = {
  game: (id) => `/game/${id}`,
  shop: (id) => `/shop/${id}`,
  challenge: (id) => `/challenges/${id}`,
  quest: (id) => `/quests/${id}`,
  arcade: (id) => `/arcade/${id}`,
};
