import { useState, useEffect } from 'react';
import {
  DollarSign, TrendingUp, ArrowUpRight, ArrowDownRight, Download, Loader2, RefreshCw,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import useAuthStore, { PERMISSIONS } from '../stores/authStore';
import api from '../api/client';

// Static cohort data (would come from analytics endpoint in the future)
const cohortData = [
  { cohort: 'Jan 2024', month1: 100, month3: 85, month6: 72, month12: 65 },
  { cohort: 'Apr 2024', month1: 100, month3: 88, month6: 75, month12: null },
  { cohort: 'Jul 2024', month1: 100, month3: 82, month6: null, month12: null },
  { cohort: 'Oct 2024', month1: 100, month3: null, month6: null, month12: null },
];

export default function Analytics() {
  const { hasPermission, isSuperAdmin } = useAuthStore();
  const [timeRange, setTimeRange] = useState('12m');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statsData, setStatsData] = useState({
    revenueData: [],
    planDistribution: [],
    topCafes: [],
    summary: {},
  });
  const canExport = hasPermission(PERMISSIONS.EXPORT_REPORTS) || isSuperAdmin();

  // Fetch analytics data from API
  const fetchAnalytics = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [summaryRes, salesRes] = await Promise.all([
        api.get('/stats/summary'),
        api.get('/stats/sales-series'),
      ]);

      const summary = summaryRes.data || {};
      const salesSeries = salesRes.data || [];

      // Transform sales series to chart format
      const revenueData = salesSeries.map(item => ({
        month: item.period || item.label,
        revenue: item.total || item.amount || 0,
        cafes: item.count || 0,
      }));

      // Mock plan distribution until we have a dedicated endpoint
      const planDistribution = [
        { name: 'Enterprise', value: Math.floor((summary.total_cafes || 10) * 0.14), revenue: 0, color: '#3b82f6' },
        { name: 'Professional', value: Math.floor((summary.total_cafes || 10) * 0.49), revenue: 0, color: '#8b5cf6' },
        { name: 'Starter', value: Math.floor((summary.total_cafes || 10) * 0.18), revenue: 0, color: '#22c55e' },
        { name: 'Trial', value: Math.floor((summary.total_cafes || 10) * 0.19), revenue: 0, color: '#64748b' },
      ];

      setStatsData({
        revenueData: revenueData.length > 0 ? revenueData : getDefaultRevenueData(),
        planDistribution,
        topCafes: summary.top_cafes || [],
        summary,
      });
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
      setError(err.response?.data?.detail || 'Failed to load analytics');
      // Use default data on error
      setStatsData({
        revenueData: getDefaultRevenueData(),
        planDistribution: getDefaultPlanDistribution(),
        topCafes: [],
        summary: {},
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Default data for when API fails
  const getDefaultRevenueData = () => [
    { month: 'Jan', revenue: 0, cafes: 0 },
    { month: 'Feb', revenue: 0, cafes: 0 },
    { month: 'Mar', revenue: 0, cafes: 0 },
  ];

  const getDefaultPlanDistribution = () => [
    { name: 'Enterprise', value: 0, color: '#3b82f6' },
    { name: 'Professional', value: 0, color: '#8b5cf6' },
    { name: 'Starter', value: 0, color: '#22c55e' },
    { name: 'Trial', value: 0, color: '#64748b' },
  ];

  useEffect(() => {
    fetchAnalytics();
  }, [timeRange]);

  const formatCurrency = (v) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);
  const formatCompact = (v) => {
    if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
    if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
    return formatCurrency(v);
  };

  const { revenueData, planDistribution, topCafes } = statsData;
  const yrr = revenueData.reduce((s, m) => s + (m.revenue || 0), 0);
  const currentMrr = revenueData.length > 0 ? revenueData[revenueData.length - 1].revenue : 0;
  const lastMrr = revenueData.length > 1 ? revenueData[revenueData.length - 2].revenue : currentMrr;
  const mrrGrowth = lastMrr > 0 ? ((currentMrr - lastMrr) / lastMrr * 100).toFixed(1) : '0.0';

  return (
    <div className="analytics">
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-subtitle">Business intelligence and financial insights</p>
        </div>
        <div className="header-actions">
          <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)} className="input select time-select">
            <option value="3m">Last 3 months</option>
            <option value="6m">Last 6 months</option>
            <option value="12m">Last 12 months</option>
          </select>
          {canExport && <button className="btn btn--secondary"><Download size={16} /> Export</button>}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="metrics-grid">
        <div className="metric-card metric-card--hero glass-card">
          <div className="metric-card__icon"><DollarSign size={24} /></div>
          <div className="metric-card__content">
            <span className="metric-card__label">Monthly Recurring Revenue</span>
            <span className="metric-card__value">{formatCurrency(currentMrr)}</span>
            <div className={`metric-card__trend ${Number(mrrGrowth) >= 0 ? 'up' : 'down'}`}>
              {Number(mrrGrowth) >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              {mrrGrowth}% from last month
            </div>
          </div>
        </div>
        <div className="metric-card glass-card">
          <span className="metric-card__label">Yearly Run Rate</span>
          <span className="metric-card__value">{formatCompact(yrr)}</span>
        </div>
        <div className="metric-card glass-card">
          <span className="metric-card__label">Avg Revenue / Café</span>
          <span className="metric-card__value">₹4,180</span>
          <div className="metric-card__trend up"><ArrowUpRight size={14} /> 3.2%</div>
        </div>
        <div className="metric-card glass-card">
          <span className="metric-card__label">Trial Conversion</span>
          <span className="metric-card__value">68.5%</span>
          <div className="metric-card__trend up"><ArrowUpRight size={14} /> 5.2%</div>
        </div>
      </div>

      {/* Charts */}
      <div className="charts-grid">
        <div className="chart-card glass-card">
          <h3 className="chart-card__title">Revenue Trend</h3>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 12 }} tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`} />
                <Tooltip contentStyle={{ background: 'rgba(26,26,36,0.95)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'white' }} formatter={(v) => [formatCurrency(v), 'Revenue']} />
                <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2.5} fill="url(#revenueGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-card glass-card">
          <h3 className="chart-card__title">Plan Distribution</h3>
          <div className="pie-container">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={planDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                  {planDistribution.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'rgba(26,26,36,0.95)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'white' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pie-legend">
              {planDistribution.map((item, i) => (
                <div key={i} className="legend-item">
                  <span className="legend-dot" style={{ background: item.color }} />
                  <span className="legend-label">{item.name}</span>
                  <span className="legend-value">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Grid */}
      <div className="bottom-grid">
        <div className="glass-card">
          <h3 className="card-title">Top Revenue Cafés</h3>
          <div className="top-cafes">
            {topCafes.map((c, i) => (
              <div key={i} className="top-cafe">
                <span className="top-cafe__rank">{i + 1}</span>
                <div className="top-cafe__info">
                  <span className="top-cafe__name">{c.name}</span>
                  <span className="top-cafe__pcs">{c.pcs} PCs</span>
                </div>
                <div className="top-cafe__stats">
                  <span className="top-cafe__mrr">{formatCurrency(c.mrr)}</span>
                  <span className={`top-cafe__growth ${c.growth >= 0 ? 'up' : 'down'}`}>{c.growth >= 0 ? '+' : ''}{c.growth}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card">
          <h3 className="card-title">Cohort Retention</h3>
          <table className="cohort-table">
            <thead>
              <tr><th>Cohort</th><th>M1</th><th>M3</th><th>M6</th><th>M12</th></tr>
            </thead>
            <tbody>
              {cohortData.map((r, i) => (
                <tr key={i}>
                  <td className="cohort-name">{r.cohort}</td>
                  <td><span className="retention-cell">{r.month1}%</span></td>
                  <td>{r.month3 ? <span className="retention-cell">{r.month3}%</span> : '—'}</td>
                  <td>{r.month6 ? <span className="retention-cell">{r.month6}%</span> : '—'}</td>
                  <td>{r.month12 ? <span className="retention-cell">{r.month12}%</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        .analytics { max-width: 1300px; }
        .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: var(--space-8); }
        .page-title { font-size: var(--text-2xl); font-weight: 600; margin-bottom: var(--space-2); letter-spacing: -0.02em; }
        .page-subtitle { font-size: var(--text-sm); color: var(--text-tertiary); }
        .header-actions { display: flex; gap: var(--space-3); }
        .time-select { width: 160px; }

        .metrics-grid { display: grid; grid-template-columns: 1.5fr 1fr 1fr 1fr; gap: var(--space-5); margin-bottom: var(--space-8); }
        .metric-card { padding: var(--space-6); }
        .metric-card--hero { display: flex; gap: var(--space-5); background: linear-gradient(135deg, rgba(59,130,246,0.15) 0%, rgba(139,92,246,0.1) 100%); border-color: rgba(59,130,246,0.25); }
        .metric-card__icon { width: 56px; height: 56px; background: var(--accent-primary-subtle); border-radius: var(--radius-lg); display: flex; align-items: center; justify-content: center; color: var(--accent-primary); }
        .metric-card__content { flex: 1; }
        .metric-card__label { display: block; font-size: var(--text-xs); font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-tertiary); margin-bottom: var(--space-2); }
        .metric-card__value { display: block; font-size: var(--text-3xl); font-weight: 600; letter-spacing: -0.02em; }
        .metric-card__trend { display: inline-flex; align-items: center; gap: 4px; font-size: var(--text-xs); font-weight: 500; margin-top: var(--space-2); }
        .metric-card__trend.up { color: var(--status-success); }
        .metric-card__trend.down { color: var(--status-danger); }

        .charts-grid { display: grid; grid-template-columns: 2fr 1fr; gap: var(--space-6); margin-bottom: var(--space-8); }
        .chart-card { padding: var(--space-6); }
        .chart-card__title { font-size: var(--text-lg); font-weight: 600; margin-bottom: var(--space-6); }
        .chart-container { margin: 0 calc(var(--space-3) * -1); }
        .pie-container { display: flex; flex-direction: column; }
        .pie-legend { display: flex; flex-direction: column; gap: var(--space-2); margin-top: var(--space-4); }
        .legend-item { display: flex; align-items: center; gap: var(--space-3); font-size: var(--text-sm); }
        .legend-dot { width: 10px; height: 10px; border-radius: 50%; }
        .legend-label { flex: 1; color: var(--text-secondary); }
        .legend-value { font-weight: 500; }

        .bottom-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-6); }
        .card-title { font-size: var(--text-lg); font-weight: 600; margin-bottom: var(--space-5); }

        .top-cafes { display: flex; flex-direction: column; }
        .top-cafe { display: flex; align-items: center; gap: var(--space-4); padding: var(--space-4) 0; border-bottom: 1px solid var(--divider); }
        .top-cafe:last-child { border-bottom: none; }
        .top-cafe__rank { width: 28px; height: 28px; background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; font-size: var(--text-xs); font-weight: 600; color: var(--text-tertiary); }
        .top-cafe__info { flex: 1; }
        .top-cafe__name { display: block; font-weight: 500; }
        .top-cafe__pcs { font-size: var(--text-xs); color: var(--text-tertiary); }
        .top-cafe__stats { text-align: right; }
        .top-cafe__mrr { display: block; font-family: var(--font-mono); font-weight: 500; }
        .top-cafe__growth { font-size: var(--text-xs); }
        .top-cafe__growth.up { color: var(--status-success); }
        .top-cafe__growth.down { color: var(--status-danger); }

        .cohort-table { width: 100%; font-size: var(--text-sm); }
        .cohort-table th, .cohort-table td { padding: var(--space-3); text-align: center; }
        .cohort-table th { font-size: var(--text-xs); font-weight: 500; color: var(--text-tertiary); text-transform: uppercase; }
        .cohort-table td:first-child { text-align: left; }
        .cohort-name { font-weight: 500; }
        .retention-cell { display: inline-block; padding: 4px 8px; background: var(--accent-primary-subtle); color: var(--accent-primary); border-radius: var(--radius-sm); font-weight: 500; }

        @media (max-width: 1024px) { .metrics-grid { grid-template-columns: repeat(2, 1fr); } .charts-grid, .bottom-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
