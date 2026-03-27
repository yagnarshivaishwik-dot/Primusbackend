import React, { useState, useEffect } from 'react';
import {
  Users,
  Monitor,
  Activity,
  MessageSquare,
  Clock,
  Search,
  Lock,
  Unlock,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  User,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useSystemStore } from '../../stores/systemStore';
import { apiService } from '../../services/apiClient';
import toast from 'react-hot-toast';

interface PCStatus {
  id: number;
  name: string;
  status: 'online' | 'offline' | 'in_use' | 'locked' | 'shutting_down' | 'restarting';
  current_user_id?: number;
  current_user_name?: string;
  last_seen?: string;
}

interface UserInfo {
  id: number;
  name: string;
  email: string;
  wallet_balance: number;
  coins_balance: number;
  role: string;
}

interface ActiveSession {
  id: number;
  user_id: number;
  user_name: string;
  pc_id: number;
  pc_name: string;
  start_time: string;
  duration_minutes: number;
}

const StaffPortal: React.FC = () => {
  const { user, logout } = useAuthStore();
  const { isConnected, addNotification } = useSystemStore();

  // State
  const [activeTab, setActiveTab] = useState('overview');
  const [pcs, setPCs] = useState<PCStatus[]>([]);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // Load initial data
  useEffect(() => {
    loadStaffData();
  }, []);

  // Auto-refresh data
  useEffect(() => {
    const interval = setInterval(() => {
      if (activeTab === 'overview' || activeTab === 'pcs') {
        refreshPCData();
      }
      if (activeTab === 'sessions') {
        refreshSessionData();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [activeTab]);

  const loadStaffData = async () => {
    try {
      setLoading(true);

      // Load PCs
      const pcsResponse = await apiService.admin.pcs.list();
      setPCs(pcsResponse.data);

      // Load users (limited for staff)
      const usersResponse = await apiService.admin.users.list();
      setUsers(usersResponse.data.filter((u: UserInfo) => u.role === 'client'));

      // Load active sessions
      const sessionsResponse = await apiService.session.current();
      setActiveSessions(Array.isArray(sessionsResponse.data) ? sessionsResponse.data : []);

    } catch (error) {
      console.error('Failed to load staff data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const refreshPCData = async () => {
    try {
      const pcsResponse = await apiService.admin.pcs.list();
      setPCs(pcsResponse.data);
    } catch (error) {
      console.error('Failed to refresh PC data:', error);
    }
  };

  const refreshSessionData = async () => {
    try {
      const sessionsResponse = await apiService.session.current();
      setActiveSessions(Array.isArray(sessionsResponse.data) ? sessionsResponse.data : []);
    } catch (error) {
      console.error('Failed to refresh session data:', error);
    }
  };

  const sendPCCommand = async (pcId: number, command: string, params?: any) => {
    try {
      await apiService.admin.pcs.command(pcId, command, params);

      addNotification({
        type: 'success',
        title: 'Command Sent',
        message: `${command} command sent to PC ${pcId}`,
        duration: 3000,
      });

      setTimeout(refreshPCData, 2000);
    } catch (error) {
      console.error('Failed to send PC command:', error);
      toast.error(`Failed to send ${command} command`);
    }
  };

  const addWalletFunds = async (userId: number, amount: number) => {
    try {
      await apiService.wallet.topup(userId, amount);

      // Refresh user data
      const usersResponse = await apiService.admin.users.list();
      setUsers(usersResponse.data.filter((u: UserInfo) => u.role === 'client'));

      // Update selected user if it's the same one
      if (selectedUser?.id === userId) {
        const updatedUser = usersResponse.data.find((u: UserInfo) => u.id === userId);
        if (updatedUser) {
          setSelectedUser(updatedUser);
        }
      }

      toast.success(`Added $${amount} to user's wallet`);
    } catch (error) {
      console.error('Failed to add wallet funds:', error);
      toast.error('Failed to add wallet funds');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'text-success-500 bg-success-500/10 border-success-500/20';
      case 'in_use': return 'text-warning-500 bg-warning-500/10 border-warning-500/20';
      case 'locked': return 'text-error-500 bg-error-500/10 border-error-500/20';
      case 'shutting_down': return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
      case 'restarting': return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
      case 'offline':
      default: return 'text-secondary-500 bg-secondary-500/10 border-secondary-500/20';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online': return <CheckCircle className="w-4 h-4" />;
      case 'in_use': return <Clock className="w-4 h-4" />;
      case 'locked': return <Lock className="w-4 h-4" />;
      case 'shutting_down':
        return (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
            <line x1="12" y1="2" x2="12" y2="12" />
          </svg>
        );
      case 'restarting': return <RefreshCw className="w-4 h-4 animate-spin" />;
      case 'offline':
      default: return <AlertTriangle className="w-4 h-4" />;
    }
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="spinner w-12 h-12 mx-auto mb-4"></div>
          <p className="text-secondary-400">Loading staff portal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-gradient-to-br from-secondary-900 via-secondary-800 to-secondary-900">
      {/* Sidebar */}
      <aside className="w-64 bg-secondary-800/50 backdrop-blur-md border-r border-secondary-700">
        {/* Header */}
        <div className="p-6 border-b border-secondary-700">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg flex items-center justify-center">
              <User className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Staff Portal</h1>
              <p className="text-sm text-secondary-400">{user?.name}</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-2">
          {[
            { id: 'overview', label: 'Overview', icon: Activity },
            { id: 'pcs', label: 'PC Status', icon: Monitor },
            { id: 'users', label: 'User Support', icon: Users },
            { id: 'sessions', label: 'Active Sessions', icon: Clock },
            { id: 'messages', label: 'Messages', icon: MessageSquare },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${activeTab === item.id
                  ? 'bg-primary-600 text-white'
                  : 'text-secondary-300 hover:bg-secondary-700 hover:text-white'
                }`}
            >
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Connection Status */}
        <div className="p-4 mt-auto">
          <div className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm ${isConnected
              ? 'bg-success-500/10 text-success-500 border border-success-500/20'
              : 'bg-error-500/10 text-error-500 border border-error-500/20'
            }`}>
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-success-500' : 'bg-error-500'}`}></div>
            <span>{isConnected ? 'Connected' : 'Offline'}</span>
          </div>
        </div>

        {/* Logout */}
        <div className="p-4 border-t border-secondary-700">
          <button
            onClick={logout}
            className="btn-outline w-full text-sm"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        {/* Header */}
        <header className="bg-secondary-800/30 backdrop-blur-md border-b border-secondary-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white capitalize">
                {activeTab === 'overview' ? 'Overview' : activeTab.replace('-', ' ')}
              </h2>
              <p className="text-secondary-400 mt-1">
                Staff assistance and monitoring tools
              </p>
            </div>

            <button
              onClick={() => {
                if (activeTab === 'pcs' || activeTab === 'overview') refreshPCData();
                if (activeTab === 'sessions') refreshSessionData();
                if (activeTab === 'users') loadStaffData();
              }}
              className="btn-secondary"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="p-6 h-full overflow-y-auto">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Quick Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="card">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-secondary-400 text-sm">Online PCs</p>
                      <p className="text-2xl font-bold text-success-500">
                        {pcs.filter(pc => pc.status === 'online' || pc.status === 'in_use').length}
                      </p>
                    </div>
                    <Monitor className="w-8 h-8 text-success-500" />
                  </div>
                </div>

                <div className="card">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-secondary-400 text-sm">Active Sessions</p>
                      <p className="text-2xl font-bold text-warning-500">{activeSessions.length}</p>
                    </div>
                    <Activity className="w-8 h-8 text-warning-500" />
                  </div>
                </div>

                <div className="card">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-secondary-400 text-sm">Total Users</p>
                      <p className="text-2xl font-bold text-primary-500">{users.length}</p>
                    </div>
                    <Users className="w-8 h-8 text-primary-500" />
                  </div>
                </div>
              </div>

              {/* PC Status Grid */}
              <div className="card">
                <h3 className="text-lg font-semibold mb-4">PC Status</h3>
                <div className="pc-status-grid">
                  {pcs.map((pc) => (
                    <div
                      key={pc.id}
                      className={`pc-card ${pc.status}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium">{pc.name}</h4>
                        <div className={`badge ${getStatusColor(pc.status)}`}>
                          {getStatusIcon(pc.status)}
                        </div>
                      </div>

                      <div className="text-sm text-secondary-400">
                        {pc.current_user_name ? (
                          <p>User: {pc.current_user_name}</p>
                        ) : (
                          <p>Status: {pc.status}</p>
                        )}
                      </div>

                      {pc.status !== 'offline' && pc.status !== 'shutting_down' && pc.status !== 'restarting' && (
                        <div className="flex space-x-1 mt-2">
                          <button
                            onClick={() => sendPCCommand(pc.id, pc.status === 'locked' ? 'unlock' : 'lock')}
                            className={`btn text-xs px-2 py-1 ${pc.status === 'locked' ? 'btn-success' : 'btn-warning'
                              }`}
                          >
                            {pc.status === 'locked' ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="space-y-6">
              {/* Search */}
              <div className="card">
                <div className="flex items-center space-x-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-secondary-400" />
                    <input
                      type="text"
                      placeholder="Search users..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="input pl-10"
                    />
                  </div>
                </div>
              </div>

              {/* Users List */}
              <div className="card">
                <h3 className="text-lg font-semibold mb-4">User Support</h3>
                <div className="space-y-3">
                  {filteredUsers.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-4 bg-secondary-800/30 rounded-lg hover:bg-secondary-800/50 transition-colors"
                    >
                      <div className="flex items-center space-x-4">
                        <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-full flex items-center justify-center">
                          <User className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <h4 className="font-medium">{user.name}</h4>
                          <p className="text-sm text-secondary-400">{user.email}</p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <p className="text-sm font-medium">${user.wallet_balance.toFixed(2)}</p>
                          <p className="text-xs text-secondary-400">{user.coins_balance} coins</p>
                        </div>

                        <button
                          onClick={() => setSelectedUser(user)}
                          className="btn-secondary text-sm"
                        >
                          Manage
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'sessions' && (
            <div className="card">
              <h3 className="text-lg font-semibold mb-4">Active Sessions</h3>

              {activeSessions.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="w-12 h-12 mx-auto mb-4 text-secondary-600" />
                  <p className="text-secondary-400">No active sessions</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-secondary-700">
                        <th className="text-left py-3 px-4">User</th>
                        <th className="text-left py-3 px-4">PC</th>
                        <th className="text-left py-3 px-4">Started</th>
                        <th className="text-left py-3 px-4">Duration</th>
                        <th className="text-left py-3 px-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeSessions.map((session) => (
                        <tr key={session.id} className="border-b border-secondary-800 hover:bg-secondary-800/30">
                          <td className="py-3 px-4">{session.user_name}</td>
                          <td className="py-3 px-4">{session.pc_name}</td>
                          <td className="py-3 px-4 text-secondary-400">
                            {new Date(session.start_time).toLocaleTimeString()}
                          </td>
                          <td className="py-3 px-4">{formatDuration(session.duration_minutes)}</td>
                          <td className="py-3 px-4">
                            <button
                              onClick={() => sendPCCommand(session.pc_id, 'message', {
                                text: 'Please wrap up your session soon.'
                              })}
                              className="btn-warning text-xs px-3 py-1"
                            >
                              Send Message
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Other tabs */}
          {!['overview', 'users', 'sessions'].includes(activeTab) && (
            <div className="card">
              <div className="text-center py-12">
                <MessageSquare className="w-16 h-16 mx-auto mb-4 text-secondary-600" />
                <h3 className="text-xl font-semibold mb-2">{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h3>
                <p className="text-secondary-400">
                  This section is under development. Check back soon!
                </p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* User Management Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Manage User</h3>
              <button
                onClick={() => setSelectedUser(null)}
                className="btn-ghost p-1"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-700 rounded-full flex items-center justify-center mx-auto mb-3">
                  <User className="w-8 h-8 text-white" />
                </div>
                <h4 className="font-semibold">{selectedUser.name}</h4>
                <p className="text-sm text-secondary-400">{selectedUser.email}</p>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-secondary-400">Wallet Balance:</span>
                  <span className="font-medium">${selectedUser.wallet_balance.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-secondary-400">Coins:</span>
                  <span className="font-medium">{selectedUser.coins_balance}</span>
                </div>
              </div>

              <div>
                <h5 className="font-medium mb-2">Add Wallet Funds</h5>
                <div className="grid grid-cols-4 gap-2">
                  {[5, 10, 20, 50].map((amount) => (
                    <button
                      key={amount}
                      onClick={() => addWalletFunds(selectedUser.id, amount)}
                      className="btn-outline text-sm py-2"
                    >
                      ${amount}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffPortal;
