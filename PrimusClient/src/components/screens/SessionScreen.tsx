import React, { useState, useEffect } from 'react';
import {
  Clock,
  Gamepad2,
  User,
  Wallet,
  Coins,
  ShoppingCart,
  Trophy,
  Monitor,
  LogOut,
  Zap,
  Plus
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useSystemStore } from '../../stores/systemStore';
import { apiService } from '../../services/apiClient';
import toast from 'react-hot-toast';

interface Game {
  id: number;
  name: string;
  logo_url?: string;
  image_600x900?: string;
  enabled: boolean;
  category: string;
  description?: string;
}

interface SessionData {
  id: number;
  start_time: string;
  minutes_remaining?: number;
  amount_paid: number;
}

interface WalletBalance {
  balance: number;
  coins_balance: number;
}


const SessionScreen: React.FC = () => {
  const { user, logout } = useAuthStore();
  const { isConnected, addNotification, remainingMinutes } = useSystemStore();

  // State
  const [currentSession, setCurrentSession] = useState<SessionData | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [walletBalance, setWalletBalance] = useState<WalletBalance>({ balance: 0, coins_balance: 0 });
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [sessionTime, setSessionTime] = useState<string>('00:00:00');
  const [loading, setLoading] = useState(true);

  // Load initial data
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setLoading(true);

        // Load games
        const gamesResponse = await apiService.games.list();
        setGames(gamesResponse.data.filter((game: Game) => game.enabled));

        // Load wallet balance
        if (user?.id) {
          const balanceResponse = await apiService.wallet.balance(user.id);
          setWalletBalance(balanceResponse.data);
        }


        // Load current session
        const sessionResponse = await apiService.session.current();
        if (sessionResponse.data) {
          setCurrentSession(sessionResponse.data);
        }

      } catch (error) {
        console.error('Failed to load initial data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, [user?.id]);

  // Update session timer
  useEffect(() => {
    if (!currentSession) return;

    const updateTimer = () => {
      const startTime = new Date(currentSession.start_time);
      const now = new Date();
      const elapsed = Math.floor((now.getTime() - startTime.getTime()) / 1000);

      const hours = Math.floor(elapsed / 3600);
      const minutes = Math.floor((elapsed % 3600) / 60);
      const seconds = elapsed % 60;

      setSessionTime(
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);

    return () => clearInterval(timer);
  }, [currentSession]);

  const handleStartSession = async () => {
    if (!user?.id) return;

    try {
      const response = await apiService.session.start({
        user_id: user.id,
        pc_id: 1, // This would come from system store
      });

      setCurrentSession(response.data);
      addNotification({
        type: 'success',
        title: 'Session Started',
        message: 'Your gaming session has begun!',
        duration: 3000,
      });
    } catch (error) {
      console.error('Failed to start session:', error);
      toast.error('Failed to start session');
    }
  };

  const handleEndSession = async () => {
    if (!currentSession) return;

    try {
      await apiService.session.end(currentSession.id);
      setCurrentSession(null);
      addNotification({
        type: 'info',
        title: 'Session Ended',
        message: 'Your gaming session has ended.',
        duration: 3000,
      });
    } catch (error) {
      console.error('Failed to end session:', error);
      toast.error('Failed to end session');
    }
  };

  const handleTopUp = async (amount: number) => {
    if (!user?.id) return;

    try {
      await apiService.wallet.topup(user.id, amount);

      // Refresh balance
      const balanceResponse = await apiService.wallet.balance(user.id);
      setWalletBalance(balanceResponse.data);

      toast.success(`Added $${amount} to wallet`);
    } catch (error) {
      console.error('Failed to top up wallet:', error);
      toast.error('Failed to top up wallet');
    }
  };


  const handleLaunchGame = (game: Game) => {
    setSelectedGame(game);
    addNotification({
      type: 'info',
      title: 'Game Launching',
      message: `Starting ${game.name}...`,
      duration: 3000,
    });

    // In a real implementation, this would send a command to the agent
    // to launch the game executable
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="spinner w-12 h-12 mx-auto mb-4"></div>
          <p className="text-secondary-400">Loading session data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-secondary-900 via-secondary-800 to-secondary-900">
      {/* Header */}
      <header className="bg-secondary-800/50 backdrop-blur-md border-b border-secondary-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg flex items-center justify-center">
              <Gamepad2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Primus Gaming Cafe</h1>
              <p className="text-sm text-secondary-400">
                Welcome, {user?.name}
                {!isConnected && <span className="text-warning-500 ml-2">• Offline Mode</span>}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* Wallet Balance */}
            <div className="flex items-center space-x-3 bg-secondary-700/50 rounded-lg px-4 py-2">
              <div className="flex items-center space-x-2">
                <Wallet className="w-4 h-4 text-primary-400" />
                <span className="text-sm font-medium">${walletBalance.balance.toFixed(2)}</span>
              </div>
              <div className="flex items-center space-x-2">
                <Coins className="w-4 h-4 text-warning-400" />
                <span className="text-sm font-medium">{walletBalance.coins_balance}</span>
              </div>
            </div>

            {/* Logout Button */}
            <button
              onClick={logout}
              className="btn-ghost p-2"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex">
        {/* Sidebar */}
        <aside className="w-80 bg-secondary-800/30 backdrop-blur-md border-r border-secondary-700 p-6">
          {/* Session Status */}
          <div className="card mb-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <Monitor className="w-5 h-5 mr-2 text-primary-400" />
              Session Status
            </h3>

            {currentSession ? (
              <div className="space-y-4">
                <div className="text-center space-y-2">
                  <div className="session-timer mb-1">
                    <div className="timer-display text-2xl">{sessionTime}</div>
                  </div>
                  <p className="text-secondary-400 text-sm">Session Active</p>
                  {typeof remainingMinutes === 'number' && (
                    <p className="text-sm text-primary-400">
                      Time remaining: {remainingMinutes} min
                    </p>
                  )}
                </div>

                <button
                  onClick={handleEndSession}
                  className="btn-error w-full"
                >
                  End Session
                </button>
              </div>
            ) : (
              <div className="text-center space-y-4">
                <div className="text-secondary-400 mb-4">
                  <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No active session</p>
                </div>

                <button
                  onClick={handleStartSession}
                  className="btn-primary w-full"
                  disabled={walletBalance.balance <= 0}
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Start Session
                </button>

                {walletBalance.balance <= 0 && (
                  <p className="text-warning-500 text-sm">
                    Add funds to start a session
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Quick Top-up */}
          <div className="card mb-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <Plus className="w-5 h-5 mr-2 text-success-400" />
              Quick Top-up
            </h3>

            <div className="grid grid-cols-2 gap-2">
              {[5, 10, 20, 50].map((amount) => (
                <button
                  key={amount}
                  onClick={() => handleTopUp(amount)}
                  className="btn-outline text-sm py-2"
                >
                  ${amount}
                </button>
              ))}
            </div>
          </div>

          {/* Navigation */}
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">Quick Access</h3>

            <div className="space-y-2">
              <button className="btn-ghost w-full justify-start">
                <ShoppingCart className="w-4 h-4 mr-3" />
                Shop
              </button>
              <button className="btn-ghost w-full justify-start">
                <Trophy className="w-4 h-4 mr-3" />
                Leaderboard
              </button>
              <button className="btn-ghost w-full justify-start">
                <User className="w-4 h-4 mr-3" />
                Profile
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 overflow-hidden">
          {selectedGame ? (
            // Game Detail View
            <div className="h-full flex items-center justify-center">
              <div className="text-center space-y-6 max-w-md">
                {selectedGame.image_600x900 && (
                  <img
                    src={selectedGame.image_600x900}
                    alt={selectedGame.name}
                    className="w-48 h-72 object-cover rounded-xl mx-auto shadow-2xl"
                  />
                )}

                <div>
                  <h2 className="text-3xl font-bold mb-2">{selectedGame.name}</h2>
                  <p className="text-secondary-400">{selectedGame.description}</p>
                </div>

                <div className="flex space-x-4">
                  <button
                    onClick={() => setSelectedGame(null)}
                    className="btn-secondary"
                  >
                    Back to Games
                  </button>
                  <button
                    onClick={() => handleLaunchGame(selectedGame)}
                    className="btn-primary"
                    disabled={!currentSession}
                  >
                    {currentSession ? 'Launch Game' : 'Start Session First'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            // Games Grid
            <div>
              <h2 className="text-2xl font-bold mb-6">Available Games</h2>

              <div className="games-grid">
                {games.map((game) => (
                  <div
                    key={game.id}
                    className="game-card cursor-pointer"
                    onClick={() => setSelectedGame(game)}
                  >
                    {game.logo_url ? (
                      <img
                        src={game.logo_url}
                        alt={game.name}
                        className="w-full h-32 object-cover rounded-t-xl"
                      />
                    ) : (
                      <div className="w-full h-32 bg-gradient-to-br from-primary-500 to-primary-700 rounded-t-xl flex items-center justify-center">
                        <Gamepad2 className="w-12 h-12 text-white" />
                      </div>
                    )}

                    <div className="p-4">
                      <h3 className="font-semibold text-white mb-2">{game.name}</h3>
                      <p className="text-sm text-secondary-400 line-clamp-2">
                        {game.description || 'No description available'}
                      </p>

                      <div className="mt-3 flex items-center justify-between">
                        <span className="badge badge-primary text-xs">
                          {game.category}
                        </span>
                        <button
                          className="btn-primary text-xs px-3 py-1"
                          disabled={!currentSession}
                        >
                          {currentSession ? 'Play' : 'Start Session'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {games.length === 0 && (
                <div className="text-center py-12">
                  <Gamepad2 className="w-16 h-16 mx-auto mb-4 text-secondary-600" />
                  <h3 className="text-xl font-semibold mb-2">No Games Available</h3>
                  <p className="text-secondary-400">
                    Games are being configured. Please check back later.
                  </p>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default SessionScreen;
