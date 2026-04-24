import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  Monitor,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  Wifi,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  Activity,
  Zap,
  Loader2,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import useAuthStore from '../stores/authStore';
import api from '../api/client';

// Revenue chart data (will be replaced with API data when billing is integrated)
const revenueData = [
  { month: 'Jul', revenue: 3750000, cafes: 890 },
  { month: 'Aug', revenue: 3920000, cafes: 930 },
  { month: 'Sep', revenue: 4100000, cafes: 975 },
  { month: 'Oct', revenue: 4280000, cafes: 1020 },
  { month: 'Nov', revenue: 4450000, cafes: 1065 },
  { month: 'Dec', revenue: 4567890, cafes: 1092 },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalCafes: 0,
    activePCs: 0,
    onlineNow: 0,
    mrrGrowth: 0,
    cafeGrowth: 0,
    pcGrowth: 0,
    onlineGrowth: 0,
    expiringSoon: 0,
  });
  const [recentCafes, setRecentCafes] = useState([]);
  const [insightCards, setInsightCards] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch dashboard data from API
  useEffect(() => {
    const fetchDashboard = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Fetch dashboard stats
        const [dashboardRes, cafesRes] = await Promise.all([
          api.get('/internal/dashboard'),
          api.get('/internal/cafes'),
        ]);

        const dashboardData = dashboardRes.data;

        setStats({
          totalRevenue: dashboardData.monthly_revenue || 0,
          totalCafes: dashboardData.total_cafes || 0,
          activePCs: dashboardData.total_pcs || 0,
          onlineNow: dashboardData.online_pcs || 0,
          mrrGrowth: dashboardData.growth_percent || 0,
          cafeGrowth: 0, // TODO: Calculate from historical data
          pcGrowth: 0,
          onlineGrowth: 0,
          expiringSoon: dashboardData.expiring_soon || 0,
        });

        // Get top 5 cafes for recent table
        const topCafes = (cafesRes.data || []).slice(0, 5).map(cafe => ({
          id: cafe.id,
          name: cafe.name,
          location: cafe.owner_email?.split('@')[1] || 'N/A',
          pcs: cafe.pc_count || 0,
          status: cafe.license_status === 'active' ? 'active' :
            cafe.license_status === 'expiring' ? 'payment_due' :
              cafe.license_status === 'none' ? 'trial' : 'inactive',
          revenue: 0, // TODO: Integrate with billing
        }));
        setRecentCafes(topCafes);

        // Generate insights based on data
        const insights = [];
        if (dashboardData.expiring_soon > 0) {
          insights.push({
            type: 'warning',
            title: 'Expiring Licenses',
            value: String(dashboardData.expiring_soon),
            description: 'Licenses expiring within 7 days',
            action: 'Review Now',
          });
        }
        if (dashboardData.offline_pcs > 0) {
          insights.push({
            type: 'info',
            title: 'Offline PCs',
            value: String(dashboardData.offline_pcs),
            description: 'PCs currently offline',
            action: 'View Fleet',
          });
        }
        if (dashboardData.total_cafes > 0) {
          insights.push({
            type: 'success',
            title: 'Active Cafés',
            value: String(dashboardData.active_cafes),
            description: 'Cafés with active licenses',
            action: 'View All',
          });
        }
        setInsightCards(insights.length > 0 ? insights : [
          { type: 'info', title: 'Getting Started', value: '!', description: 'Add cafés to see insights', action: 'Add Café' }
        ]);

      } catch (err) {
        console.error('Failed to fetch dashboard:', err);
        setError(err.response?.data?.detail || 'Failed to load dashboard');
        // Use fallback mock data on error
        setRecentCafes([]);
        setInsightCards([
          { type: 'warning', title: 'Connection Issue', value: '!', description: 'Could not load live data', action: 'Retry' }
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboard();

    // Refresh every 60 seconds
    const interval = setInterval(fetchDashboard, 60000);
    return () => clearInterval(interval);
  }, []);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatCompact = (value) => {
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)}Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
    return formatCurrency(value);
  };

  return (
    <div className="dashboard">
      {/* Welcome Header */}
      <div className="dashboard__header">
        <div className="dashboard__greeting">
          <h1 className="dashboard__title">
            Welcome back, {user?.username || 'Admin'}
          </h1>
          <p className="dashboard__subtitle">
            Here's what's happening across your network today.
          </p>
        </div>
        <div className="dashboard__header-actions">
          <button className="btn btn--secondary">
            <Activity size={16} />
            System Status
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="dashboard__kpis">
        <div className="stat-card stat-card--highlight">
          <div className="stat-card__header">
            <div className="stat-card__icon stat-card__icon--primary">
              <DollarSign size={22} />
            </div>
            <div className={`stat-card__trend ${stats.mrrGrowth >= 0 ? 'stat-card__trend--up' : 'stat-card__trend--down'}`}>
              {stats.mrrGrowth >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              {Math.abs(stats.mrrGrowth)}%
            </div>
          </div>
          <div className="stat-card__value">{formatCompact(stats.totalRevenue)}</div>
          <div className="stat-card__label">Monthly Recurring Revenue</div>
          <div className="stat-card__sparkline">
            <ResponsiveContainer width="100%" height={40}>
              <AreaChart data={revenueData.slice(-6)}>
                <defs>
                  <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#sparkGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card__header">
            <div className="stat-card__icon">
              <Building2 size={20} />
            </div>
            <div className={`stat-card__trend ${stats.cafeGrowth >= 0 ? 'stat-card__trend--up' : 'stat-card__trend--down'}`}>
              {stats.cafeGrowth >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              {Math.abs(stats.cafeGrowth)}%
            </div>
          </div>
          <div className="stat-card__value">{stats.totalCafes.toLocaleString()}</div>
          <div className="stat-card__label">Total Cafés</div>
        </div>

        <div className="stat-card">
          <div className="stat-card__header">
            <div className="stat-card__icon">
              <Monitor size={20} />
            </div>
            <div className={`stat-card__trend ${stats.pcGrowth >= 0 ? 'stat-card__trend--up' : 'stat-card__trend--down'}`}>
              {stats.pcGrowth >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              {Math.abs(stats.pcGrowth)}%
            </div>
          </div>
          <div className="stat-card__value">{stats.activePCs.toLocaleString()}</div>
          <div className="stat-card__label">Registered PCs</div>
        </div>

        <div className="stat-card">
          <div className="stat-card__header">
            <div className="stat-card__icon stat-card__icon--success">
              <Wifi size={20} />
            </div>
            <div className={`stat-card__trend ${stats.onlineGrowth >= 0 ? 'stat-card__trend--up' : 'stat-card__trend--down'}`}>
              {stats.onlineGrowth >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              {Math.abs(stats.onlineGrowth)}%
            </div>
          </div>
          <div className="stat-card__value">{stats.onlineNow.toLocaleString()}</div>
          <div className="stat-card__label">Online Now</div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="dashboard__grid">
        {/* Revenue Chart */}
        <div className="dashboard__chart card">
          <div className="card__header">
            <h3 className="card__title">Revenue Trend</h3>
            <span className="card__subtitle">Last 6 months</span>
          </div>
          <div className="dashboard__chart-container">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 12 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 12 }}
                  tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`}
                />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(26,26,36,0.95)',
                    backdropFilter: 'blur(16px)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '10px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    fontSize: '13px',
                    color: 'white',
                  }}
                  formatter={(value) => [formatCurrency(value), 'Revenue']}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#3b82f6"
                  strokeWidth={2.5}
                  fill="url(#revenueGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Insight Cards */}
        <div className="dashboard__insights">
          <h3 className="dashboard__section-title">Insights & Alerts</h3>
          <div className="dashboard__insights-list">
            {insightCards.map((insight, index) => (
              <div key={index} className={`insight-card insight-card--${insight.type}`}>
                <div className="insight-card__icon">
                  {insight.type === 'warning' && <AlertTriangle size={18} />}
                  {insight.type === 'success' && <TrendingUp size={18} />}
                  {insight.type === 'info' && <Zap size={18} />}
                </div>
                <div className="insight-card__content">
                  <div className="insight-card__header">
                    <span className="insight-card__value">{insight.value}</span>
                    <span className="insight-card__title">{insight.title}</span>
                  </div>
                  <p className="insight-card__description">{insight.description}</p>
                </div>
                <button className="insight-card__action">
                  {insight.action}
                  <ChevronRight size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Cafés */}
      <div className="dashboard__recent card">
        <div className="card__header">
          <h3 className="card__title">Top Performing Cafés</h3>
          <button className="btn btn--ghost btn--sm" onClick={() => navigate('/cafes')}>
            View All
            <ChevronRight size={14} />
          </button>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Café</th>
              <th>Location</th>
              <th>PCs</th>
              <th>Status</th>
              <th>MRR</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {recentCafes.map((cafe) => (
              <tr
                key={cafe.id}
                className="clickable"
                onClick={() => navigate(`/cafes/${cafe.id}`)}
              >
                <td>
                  <div className="cafe-cell">
                    <div className="cafe-cell__avatar">
                      <Building2 size={16} />
                    </div>
                    <span className="cafe-cell__name">{cafe.name}</span>
                  </div>
                </td>
                <td className="text-secondary">{cafe.location}</td>
                <td>
                  <div className="pc-count">
                    <Monitor size={14} />
                    {cafe.pcs}
                  </div>
                </td>
                <td>
                  <span className={`badge badge--${cafe.status === 'active' ? 'success' : cafe.status === 'trial' ? 'info' : 'warning'}`}>
                    {cafe.status === 'active' ? 'Active' : cafe.status === 'trial' ? 'Trial' : 'Payment Due'}
                  </span>
                </td>
                <td className="font-mono text-primary">
                  {cafe.revenue > 0 ? formatCurrency(cafe.revenue) : '—'}
                </td>
                <td>
                  <ChevronRight size={16} className="text-tertiary" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style>{`
        .dashboard {
          max-width: 1400px;
        }

        .dashboard__header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: var(--space-8);
        }

        .dashboard__title {
          font-size: var(--text-3xl);
          font-weight: 600;
          letter-spacing: -0.03em;
          margin-bottom: var(--space-2);
          background: linear-gradient(135deg, var(--text-primary) 0%, var(--text-secondary) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .dashboard__subtitle {
          font-size: var(--text-base);
          color: var(--text-tertiary);
        }

        /* KPI Cards */
        .dashboard__kpis {
          display: grid;
          grid-template-columns: 1.5fr repeat(3, 1fr);
          gap: var(--space-5);
          margin-bottom: var(--space-8);
        }

        .stat-card {
          position: relative;
          background: var(--glass-bg);
          backdrop-filter: blur(var(--glass-blur)) saturate(180%);
          border: 1px solid var(--glass-border);
          border-radius: var(--radius-xl);
          padding: var(--space-6);
          overflow: hidden;
          transition: all var(--duration-base) var(--ease-out);
        }

        .stat-card:hover {
          transform: translateY(-4px);
          border-color: var(--glass-border-hover);
          box-shadow: var(--shadow-lg), 0 0 40px rgba(59, 130, 246, 0.08);
        }

        .stat-card--highlight {
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(139, 92, 246, 0.08) 100%);
          border-color: rgba(59, 130, 246, 0.2);
        }

        .stat-card__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: var(--space-4);
        }

        .stat-card__icon {
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.06);
          border-radius: var(--radius-md);
          color: var(--text-secondary);
        }

        .stat-card__icon--primary {
          background: var(--accent-primary-subtle);
          color: var(--accent-primary);
        }

        .stat-card__icon--success {
          background: var(--status-success-subtle);
          color: var(--status-success);
        }

        .stat-card__trend {
          display: flex;
          align-items: center;
          gap: 2px;
          padding: var(--space-1) var(--space-2);
          border-radius: var(--radius-sm);
          font-size: var(--text-xs);
          font-weight: 600;
        }

        .stat-card__trend--up {
          background: var(--status-success-subtle);
          color: var(--status-success);
        }

        .stat-card__trend--down {
          background: var(--status-danger-subtle);
          color: var(--status-danger);
        }

        .stat-card__value {
          font-size: var(--text-3xl);
          font-weight: 600;
          letter-spacing: -0.02em;
          margin-bottom: var(--space-1);
        }

        .stat-card__label {
          font-size: var(--text-sm);
          color: var(--text-tertiary);
        }

        .stat-card__sparkline {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 50px;
          opacity: 0.6;
        }

        /* Main Grid */
        .dashboard__grid {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: var(--space-6);
          margin-bottom: var(--space-8);
        }

        .dashboard__chart {
          padding: var(--space-6);
        }

        .card__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: var(--space-6);
        }

        .card__title {
          font-size: var(--text-lg);
          font-weight: 600;
        }

        .card__subtitle {
          font-size: var(--text-sm);
          color: var(--text-tertiary);
        }

        .dashboard__chart-container {
          margin: 0 calc(var(--space-3) * -1);
        }

        /* Insights */
        .dashboard__insights {
          display: flex;
          flex-direction: column;
        }

        .dashboard__section-title {
          font-size: var(--text-lg);
          font-weight: 600;
          margin-bottom: var(--space-4);
        }

        .dashboard__insights-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }

        .insight-card {
          display: flex;
          align-items: flex-start;
          gap: var(--space-4);
          padding: var(--space-5);
          background: var(--glass-bg);
          backdrop-filter: blur(var(--glass-blur));
          border: 1px solid var(--glass-border);
          border-radius: var(--radius-lg);
          transition: all var(--duration-fast) var(--ease-out);
        }

        .insight-card:hover {
          border-color: var(--glass-border-hover);
          background: var(--glass-bg-hover);
        }

        .insight-card__icon {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: var(--radius-md);
          flex-shrink: 0;
        }

        .insight-card--warning .insight-card__icon {
          background: var(--status-warning-subtle);
          color: var(--status-warning);
        }

        .insight-card--success .insight-card__icon {
          background: var(--status-success-subtle);
          color: var(--status-success);
        }

        .insight-card--info .insight-card__icon {
          background: var(--status-info-subtle);
          color: var(--status-info);
        }

        .insight-card__content {
          flex: 1;
          min-width: 0;
        }

        .insight-card__header {
          display: flex;
          align-items: baseline;
          gap: var(--space-2);
          margin-bottom: var(--space-1);
        }

        .insight-card__value {
          font-size: var(--text-xl);
          font-weight: 600;
        }

        .insight-card__title {
          font-size: var(--text-sm);
          color: var(--text-secondary);
        }

        .insight-card__description {
          font-size: var(--text-xs);
          color: var(--text-tertiary);
        }

        .insight-card__action {
          display: flex;
          align-items: center;
          gap: 2px;
          padding: var(--space-2) var(--space-3);
          background: transparent;
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          font-size: var(--text-xs);
          font-weight: 500;
          color: var(--text-secondary);
          cursor: pointer;
          white-space: nowrap;
          transition: all var(--duration-fast) var(--ease-out);
        }

        .insight-card__action:hover {
          background: var(--accent-primary-subtle);
          border-color: var(--accent-primary);
          color: var(--accent-primary);
        }

        /* Recent Cafés Table */
        .dashboard__recent {
          padding: 0;
          overflow: hidden;
        }

        .dashboard__recent .card__header {
          padding: var(--space-5) var(--space-6);
          border-bottom: 1px solid var(--divider);
          margin-bottom: 0;
        }

        .cafe-cell {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }

        .cafe-cell__avatar {
          width: 32px;
          height: 32px;
          background: var(--accent-primary-subtle);
          border-radius: var(--radius-sm);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent-primary);
        }

        .cafe-cell__name {
          font-weight: 500;
        }

        .pc-count {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          color: var(--text-secondary);
        }

        @media (max-width: 1200px) {
          .dashboard__kpis {
            grid-template-columns: repeat(2, 1fr);
          }

          .dashboard__grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 768px) {
          .dashboard__kpis {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
