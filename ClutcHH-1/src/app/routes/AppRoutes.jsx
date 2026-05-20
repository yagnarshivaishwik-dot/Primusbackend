import { Navigate, Route, Routes } from 'react-router-dom';
import { ROUTES } from '@/app/routes/paths';

import AuthLayout from '@/layouts/AuthLayout';
import MainLayout from '@/layouts/MainLayout';
import FullScreenLayout from '@/layouts/FullScreenLayout';

import InitializingPage from '@/features/auth/pages/InitializingPage';
import LoginPage from '@/features/auth/pages/LoginPage';
import SignUpPage from '@/features/auth/pages/SignUpPage';
import ForgotPasswordPage from '@/features/auth/pages/ForgotPasswordPage';
import ResetPasswordPage from '@/features/auth/pages/ResetPasswordPage';

import HomePage from '@/features/home/pages/HomePage';

import GamesPage from '@/features/games/pages/GamesPage';
import GameDetailPage from '@/features/games/pages/GameDetailPage';
import GameLaunchPage from '@/features/games/pages/GameLaunchPage';
import GameLoginPage from '@/features/games/pages/GameLoginPage';

import AppsPage from '@/features/apps/pages/AppsPage';
import AppsToolsPage from '@/features/apps/pages/AppsToolsPage';
import AppsLauncherPage from '@/features/apps/pages/AppsLauncherPage';

import ArcadePage from '@/features/arcade/pages/ArcadePage';
import ArcadeGameDetailPage from '@/features/arcade/pages/ArcadeGameDetailPage';

import ShopPage from '@/features/shop/pages/ShopPage';
import ShopDetailPage from '@/features/shop/pages/ShopDetailPage';

import PrizeVaultPage from '@/features/prizeVault/pages/PrizeVaultPage';
import PrizeRedeemPage from '@/features/prizeVault/pages/PrizeRedeemPage';

import ChallengesListPage from '@/features/challenges/pages/ChallengesListPage';
import ChallengeDetailPage from '@/features/challenges/pages/ChallengeDetailPage';

import QuestsListPage from '@/features/quests/pages/QuestsListPage';
import QuestDetailPage from '@/features/quests/pages/QuestDetailPage';

import ProfilePage from '@/features/profile/pages/ProfilePage';
import ProfileStatsPage from '@/features/profile/pages/ProfileStatsPage';
import ProfileAchievementsPage from '@/features/profile/pages/ProfileAchievementsPage';
import ProfileFriendsPage from '@/features/profile/pages/ProfileFriendsPage';
import ProfileEditPage from '@/features/profile/pages/ProfileEditPage';

import LeaderboardPage from '@/features/leaderboard/pages/LeaderboardPage';

import HelpPage from '@/features/settings/pages/HelpPage';
import SoundSettingsPage from '@/features/settings/pages/SoundSettingsPage';
import DisplaySettingsPage from '@/features/settings/pages/DisplaySettingsPage';
import InstalledPage from '@/features/settings/pages/InstalledPage';

import AppearancePage from '@/features/appearance/pages/AppearancePage';

import NotFoundPage from '@/pages/NotFoundPage';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path={ROUTES.root} element={<Navigate to={ROUTES.initializing} replace />} />
       {/* <Route path={ROUTES.root} element={<LoginPage/>} /> */}

      {/* Auth layout */}
      <Route element={<AuthLayout />}>
        <Route path={ROUTES.initializing} element={<InitializingPage />} />
        <Route path={ROUTES.login} element={<LoginPage />} />
        <Route path={ROUTES.signup} element={<SignUpPage />} />
        <Route path={ROUTES.forgotPassword} element={<ForgotPasswordPage />} />
        <Route path={ROUTES.resetPassword} element={<ResetPasswordPage />} />
      </Route>

      {/* FullScreenLayout — Guna's NoLag home, Pavan's NoLag shop, and the
          Games & Apps page bring their own internal chrome (tabs, filters)
          so we render them without the shared top Navbar and let the
          floating BottomNav provide cross-page nav instead. */}
      <Route element={<FullScreenLayout />}>
        <Route path={ROUTES.home} element={<HomePage />} />
        <Route path={ROUTES.mainShop} element={<ShopPage />} />
        <Route path={ROUTES.mainGames} element={<GamesPage />} />
        <Route path={ROUTES.mainPrizeVault} element={<PrizeVaultPage />} />
        <Route path={ROUTES.appearance} element={<AppearancePage />} />
      </Route>

      {/* Main layout (shell) — other pages keep the shared Navbar. */}
      <Route element={<MainLayout />}>
        <Route path={ROUTES.mainApps} element={<AppsPage />} />
        <Route path={ROUTES.mainArcade} element={<ArcadePage />} />

        <Route path={ROUTES.mainProfile} element={<ProfilePage />} />

        <Route path={ROUTES.gameDetail} element={<GameDetailPage />} />
        <Route path={ROUTES.gameLaunch} element={<GameLaunchPage />} />
        <Route path={ROUTES.gameLogin} element={<GameLoginPage />} />

        <Route path={ROUTES.appsTools} element={<AppsToolsPage />} />
        <Route path={ROUTES.appsLauncher} element={<AppsLauncherPage />} />

        <Route path={ROUTES.shopDetail} element={<ShopDetailPage />} />

        <Route path={ROUTES.prizeRedeem} element={<PrizeRedeemPage />} />

        <Route path={ROUTES.challenges} element={<ChallengesListPage />} />
        <Route path={ROUTES.challengeDetail} element={<ChallengeDetailPage />} />

        <Route path={ROUTES.quests} element={<QuestsListPage />} />
        <Route path={ROUTES.questDetail} element={<QuestDetailPage />} />

        <Route path={ROUTES.profileStats} element={<ProfileStatsPage />} />
        <Route path={ROUTES.profileAchievements} element={<ProfileAchievementsPage />} />
        <Route path={ROUTES.profileFriends} element={<ProfileFriendsPage />} />
        <Route path={ROUTES.profileEdit} element={<ProfileEditPage />} />

        <Route path={ROUTES.arcadeDetail} element={<ArcadeGameDetailPage />} />

        <Route path={ROUTES.leaderboard} element={<LeaderboardPage />} />

        <Route path={ROUTES.settingsHelp} element={<HelpPage />} />
        <Route path={ROUTES.settingsSound} element={<SoundSettingsPage />} />
        <Route path={ROUTES.settingsDisplay} element={<DisplaySettingsPage />} />
        <Route path={ROUTES.settingsInstalled} element={<InstalledPage />} />

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
