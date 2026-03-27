import React, { useState, useEffect } from 'react';
import { invoke } from '../../utils/invoke';
import {
  Users,
  Monitor,
  Activity,
  DollarSign,
  Settings,
  BarChart3,
  MessageSquare,
  Shield,
  Power,
  RefreshCw,
  Lock,
  Unlock,
  Eye,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
  Trash2,
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
  ip_address?: string;
}

interface DashboardStats {
  total_pcs: number;
  online_pcs: number;
  active_sessions: number;
  total_revenue: number;
  today_revenue: number;
  total_users: number;
  active_users: number;
}

const AdminPortal: React.FC = () => {
  const { user, logout } = useAuthStore();
  const { isConnected, addNotification } = useSystemStore();

  // State
  const [activeTab, setActiveTab] = useState('dashboard');
  const [pcs, setPCs] = useState<PCStatus[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [selectedPC, setSelectedPC] = useState<PCStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Load initial data
  useEffect(() => {
    loadDashboardData();
  }, []);

  // Auto-refresh data every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (activeTab === 'dashboard' || activeTab === 'pcs') {
        refreshData();
      }
    }, 30000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handleFullReset = async () => {
    if (window.confirm("CRITICAL: This will remove this PC from the cafe and reset the local identity. The app will close. Continue?")) {
      try {
        await invoke("reset_device_credentials");
        toast.success("Device reset successful. Restarting...");
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } catch (e) {
        console.error("Reset failed", e);
        toast.error("Reset failed");
      }
    }
  };

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      // Load stats
      const statsResponse = await apiService.admin.stats.dashboard();
      setStats(statsResponse.data);

      // Load PCs
      const pcsResponse = await apiService.admin.pcs.list();
      setPCs(pcsResponse.data);

    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async () => {
    try {
      setRefreshing(true);

      if (activeTab === 'dashboard' && stats) {
        const statsResponse = await apiService.admin.stats.dashboard();
        setStats(statsResponse.data);
      }

      if (activeTab === 'pcs' || activeTab === 'dashboard') {
        const pcsResponse = await apiService.admin.pcs.list();
        setPCs(pcsResponse.data);
      }

    } catch (error) {
      console.error('Failed to refresh data:', error);
    } finally {
      setRefreshing(false);
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

      // Refresh PC status
      setTimeout(refreshData, 2000);
    } catch (error) {
      console.error('Failed to send PC command:', error);
      toast.error(`Failed to send ${command} command`);
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
      case 'shutting_down': return <Power className="w-4 h-4" />;
      case 'restarting': return <RefreshCw className="w-4 h-4 animate-spin" />;
      case 'offline':
      default: return <AlertTriangle className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="spinner w-12 h-12 mx-auto mb-4"></div>
          <p className="text-secondary-400">Loading admin portal...</p>
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
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Admin Portal</h1>
              <p className="text-sm text-secondary-400">{user?.name}</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-2">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
            { id: 'pcs', label: 'PC Management', icon: Monitor },
            { id: 'users', label: 'User Management', icon: Users },
            { id: 'sessions', label: 'Active Sessions', icon: Activity },
            { id: 'revenue', label: 'Revenue', icon: DollarSign },
            { id: 'messages', label: 'Messages', icon: MessageSquare },
            { id: 'settings', label: 'Settings', icon: Settings },
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

        {/* Logout & Reset */}
        <div className="p-4 border-t border-secondary-700 space-y-2">
          <button
            onClick={handleFullReset}
            className="flex items-center justify-center space-x-2 w-full py-2 px-4 rounded-lg text-xs font-bold text-error-400 hover:bg-error-500/10 border border-error-500/20 transition-all"
          >
            <Trash2 className="w-3 h-3" />
            <span>Reset Registration</span>
          </button>

          <button
            onClick={logout}
            className="btn-outline w-full text-sm py-2"
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
                {activeTab.replace('-', ' ')}
              </h2>
              <p className="text-secondary-400 mt-1">
                Manage your gaming cafe operations
              </p>
            </div>

            <button
              onClick={refreshData}
              disabled={refreshing}
              className="btn-secondary"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="p-6 h-full overflow-y-auto">
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Stats Grid */}
              {stats && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="card">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-secondary-400 text-sm">Total PCs</p>
                        <p className="text-2xl font-bold">{stats.total_pcs}</p>
                      </div>
                      <Monitor className="w-8 h-8 text-primary-500" />
                    </div>
                  </div>

                  <div className="card">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-secondary-400 text-sm">Online PCs</p>
                        <p className="text-2xl font-bold text-success-500">{stats.online_pcs}</p>
                      </div>
                      <CheckCircle className="w-8 h-8 text-success-500" />
                    </div>
                  </div>

                  <div className="card">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-secondary-400 text-sm">Active Sessions</p>
                        <p className="text-2xl font-bold text-warning-500">{stats.active_sessions}</p>
                      </div>
                      <Activity className="w-8 h-8 text-warning-500" />
                    </div>
                  </div>

                  <div className="card">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-secondary-400 text-sm">Today's Revenue</p>
                        <p className="text-2xl font-bold text-success-500">${stats.today_revenue.toFixed(2)}</p>
                      </div>
                      <TrendingUp className="w-8 h-8 text-success-500" />
                    </div>
                  </div>
                </div>
              )}

              {/* PC Status Overview */}
              <div className="card">
                <h3 className="text-lg font-semibold mb-4">PC Status Overview</h3>
                <div className="pc-status-grid">
                  {pcs.map((pc) => (
                    <div
                      key={pc.id}
                      className={`pc-card ${pc.status} cursor-pointer`}
                      onClick={() => setSelectedPC(pc)}
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
                        {pc.ip_address && (
                          <p className="text-xs">IP: {pc.ip_address}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'pcs' && (
            <div className="space-y-6">
              {/* PC List */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">PC Management</h3>
                  <div className="flex space-x-2">
                    <button className="btn-success text-sm">Add PC</button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-secondary-700">
                        <th className="text-left py-3 px-4">PC Name</th>
                        <th className="text-left py-3 px-4">Status</th>
                        <th className="text-left py-3 px-4">Current User</th>
                        <th className="text-left py-3 px-4">IP Address</th>
                        <th className="text-left py-3 px-4">Last Seen</th>
                        <th className="text-left py-3 px-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pcs.map((pc) => (
                        <tr key={pc.id} className="border-b border-secondary-800 hover:bg-secondary-800/30">
                          <td className="py-3 px-4 font-medium">{pc.name}</td>
                          <td className="py-3 px-4">
                            <span className={`badge ${getStatusColor(pc.status)}`}>
                              {getStatusIcon(pc.status)}
                              <span className="ml-1 capitalize">{pc.status}</span>
                            </span>
                          </td>
                          <td className="py-3 px-4 text-secondary-400">
                            {pc.current_user_name || '—'}
                          </td>
                          <td className="py-3 px-4 text-secondary-400">
                            {pc.ip_address || '—'}
                          </td>
                          <td className="py-3 px-4 text-secondary-400">
                            {pc.last_seen ? new Date(pc.last_seen).toLocaleString() : '—'}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex space-x-2">
                              <button
                                onClick={() => sendPCCommand(pc.id, 'lock')}
                                className="btn-warning text-xs px-2 py-1"
                                disabled={pc.status === 'offline' || pc.status === 'shutting_down' || pc.status === 'restarting'}
                                title="Lock PC"
                              >
                                <Lock className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => sendPCCommand(pc.id, 'unlock')}
                                className="btn-success text-xs px-2 py-1"
                                disabled={pc.status === 'offline' || pc.status === 'shutting_down' || pc.status === 'restarting'}
                                title="Unlock PC"
                              >
                                <Unlock className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => sendPCCommand(pc.id, 'restart')}
                                className="btn-secondary text-xs px-2 py-1"
                                disabled={pc.status === 'offline' || pc.status === 'shutting_down' || pc.status === 'restarting'}
                                title="Restart PC"
                              >
                                <RefreshCw className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => sendPCCommand(pc.id, 'shutdown')}
                                className="btn-error text-xs px-2 py-1"
                                disabled={pc.status === 'offline' || pc.status === 'shutting_down' || pc.status === 'restarting'}
                                title="Shutdown PC"
                              >
                                <Power className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Users Tab */}
          {activeTab === 'users' && (
            <div className="card">
              <div className="p-6">
                <h2 className="text-2xl font-bold mb-6 flex items-center">
                  <Users className="w-6 h-6 mr-3" />
                  User Management
                </h2>

                <div className="text-center py-8">
                  <p className="text-secondary-400 mb-4">
                    User management features will be available here.
                  </p>
                  <p className="text-sm text-secondary-500">
                    This will include user registration, time management, and session control.
                  </p>
                </div>
              </div>
            </div>
          )}


          {/* Other tabs would be implemented similarly */}
          {activeTab !== 'dashboard' && activeTab !== 'pcs' && (
            <div className="card">
              <div className="text-center py-12">
                <Settings className="w-16 h-16 mx-auto mb-4 text-secondary-600" />
                <h3 className="text-xl font-semibold mb-2">{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h3>
                <p className="text-secondary-400">
                  This section is under development. Check back soon!
                </p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* PC Detail Modal */}
      {selectedPC && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{selectedPC.name}</h3>
              <button
                onClick={() => setSelectedPC(null)}
                className="btn-ghost p-1"
              >
                ×
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-secondary-400">Status:</span>
                <span className={`badge ${getStatusColor(selectedPC.status)}`}>
                  {getStatusIcon(selectedPC.status)}
                  <span className="ml-1 capitalize">{selectedPC.status}</span>
                </span>
              </div>

              {selectedPC.current_user_name && (
                <div className="flex justify-between">
                  <span className="text-secondary-400">Current User:</span>
                  <span>{selectedPC.current_user_name}</span>
                </div>
              )}

              {selectedPC.ip_address && (
                <div className="flex justify-between">
                  <span className="text-secondary-400">IP Address:</span>
                  <span>{selectedPC.ip_address}</span>
                </div>
              )}

              {selectedPC.last_seen && (
                <div className="flex justify-between">
                  <span className="text-secondary-400">Last Seen:</span>
                  <span className="text-sm">{new Date(selectedPC.last_seen).toLocaleString()}</span>
                </div>
              )}
            </div>

            <div className="flex space-x-2 mt-6">
              <button
                onClick={() => sendPCCommand(selectedPC.id, 'screenshot')}
                className="btn-secondary flex-1"
                disabled={selectedPC.status === 'offline' || selectedPC.status === 'shutting_down' || selectedPC.status === 'restarting'}
              >
                <Eye className="w-4 h-4 mr-2" />
                Screenshot
              </button>
              <button
                onClick={() => sendPCCommand(selectedPC.id, selectedPC.status === 'locked' ? 'unlock' : 'lock')}
                className={selectedPC.status === 'locked' ? 'btn-success flex-1' : 'btn-warning flex-1'}
                disabled={selectedPC.status === 'offline' || selectedPC.status === 'shutting_down' || selectedPC.status === 'restarting'}
              >
                {selectedPC.status === 'locked' ? (
                  <>
                    <Unlock className="w-4 h-4 mr-2" />
                    Unlock
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4 mr-2" />
                    Lock
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPortal;
