/**
 * StatisticsPage — world-class analytics dashboard for Primus Admin.
 *
 * Data sources  : /api/analytics/* (FastAPI, cafe_id from JWT)
 * Charts        : Recharts (AreaChart, BarChart, PieChart)
 * Auto-refresh  : every 10 seconds
 * Multi-tenant  : cafe_id is NEVER sent from here — always in JWT
 */

import axios from 'axios';
import {
  BarChart, Bar,
  AreaChart, Area,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiBase, authHeaders } from '../utils/api';

// ── Palette (matches Tailwind config) ────────────────────────────────────────
const C = {
  primary:  '#20B2AA',
  accent:   '#9333EA',
  green:    '#22c55e',
  orange:   '#f97316',
  pink:     '#ec4899',
  muted:    'rgba(255,255,255,0.12)',
  text:     'rgba(255,255,255,0.7)',
};
const PIE_COLORS = [C.primary, C.accent, C.green, C.orange, C.pink];

// ── Small helpers ─────────────────────────────────────────────────────────────
const fmt = (n) => `₹ ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtShort = (n) => {
  const v = Number(n || 0);
  if (v >= 1e6) return `₹${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(1)}K`;
  return `₹${v.toFixed(0)}`;
};
const relTime = (iso) => {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// ── Skeleton ──────────────────────────────────────────────────────────────────
const Skeleton = ({ h = 'h-6', w = 'w-full', rounded = 'rounded' }) => (
  <div className={`${h} ${w} ${rounded} bg-white/10 animate-pulse`} />
);

// ── KPI Card ──────────────────────────────────────────────────────────────────
const KpiCard = ({ label, value, sub, icon, color, loading }) => (
  <div className="card-animated p-5 flex flex-col gap-2 relative overflow-hidden">
    <div
      className="absolute inset-0 opacity-5 rounded-xl"
      style={{ background: `radial-gradient(circle at top right, ${color}, transparent 70%)` }}
    />
    <div className="flex items-center justify-between">
      <span className="text-gray-400 text-xs uppercase tracking-wider">{label}</span>
      <span style={{ color }}>{icon}</span>
    </div>
    {loading ? (
      <Skeleton h="h-8" w="w-3/4" />
    ) : (
      <div className="text-2xl font-bold text-white transition-all duration-500">{value}</div>
    )}
    {sub && !loading && <div className="text-xs text-gray-500">{sub}</div>}
  </div>
);

// ── Section header ────────────────────────────────────────────────────────────
const SectionTitle = ({ children }) => (
  <div className="text-gray-400 text-xs uppercase tracking-widest mb-3 font-semibold">{children}</div>
);

// ── Sortable table ────────────────────────────────────────────────────────────
const SortableTable = ({ columns, rows, loading, emptyMsg = 'No data' }) => {
  const [sortCol, setSortCol] = useState(columns[0]?.key);
  const [sortDir, setSortDir] = useState('desc');
  const [search,  setSearch]  = useState('');
  const [page,    setPage]    = useState(0);
  const PAGE = 10;

  const handleSort = (key) => {
    if (sortCol === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(key); setSortDir('desc'); }
    setPage(0);
  };

  const filtered = (rows || []).filter(r =>
    columns.some(c => String(r[c.key] ?? '').toLowerCase().includes(search.toLowerCase()))
  );
  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortCol], bv = b[sortCol];
    if (av == null) return 1; if (bv == null) return -1;
    return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
  });
  const paged = sorted.slice(page * PAGE, (page + 1) * PAGE);
  const totalPages = Math.ceil(sorted.length / PAGE);

  return (
    <div className="card-animated overflow-hidden">
      <div className="p-3 border-b border-white/5">
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          placeholder="Search…"
          className="search-input w-full text-sm py-1.5 px-3 rounded-md"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-gray-300 text-sm">
          <thead className="bg-white/5 text-gray-400 text-xs uppercase">
            <tr>
              {columns.map(c => (
                <th
                  key={c.key}
                  className="p-3 cursor-pointer select-none hover:text-white transition-colors"
                  onClick={() => handleSort(c.key)}
                >
                  {c.label}
                  {sortCol === c.key && (
                    <span className="ml-1 opacity-60">{sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t border-white/5">
                  {columns.map(c => (
                    <td key={c.key} className="p-3"><Skeleton h="h-4" /></td>
                  ))}
                </tr>
              ))
            ) : paged.length === 0 ? (
              <tr><td colSpan={columns.length} className="p-4 text-center text-gray-500">{emptyMsg}</td></tr>
            ) : (
              paged.map((r, i) => (
                <tr key={i} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                  {columns.map(c => (
                    <td key={c.key} className="p-3">{c.render ? c.render(r[c.key], r) : (r[c.key] ?? '—')}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between p-3 border-t border-white/5 text-xs text-gray-400">
          <span>{sorted.length} rows</span>
          <div className="flex gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              className="pill disabled:opacity-30"
            >← Prev</button>
            <span className="px-2 py-1">{page + 1} / {totalPages}</span>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
              className="pill disabled:opacity-30"
            >Next →</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Custom Tooltip ────────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label, prefix = '₹' }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0f1117] border border-white/10 rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="text-gray-400 mb-1">{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }} className="font-semibold">
          {p.name}: {prefix === '₹' && p.name !== 'sessions' ? fmtShort(p.value) : p.value}
        </div>
      ))}
    </div>
  );
};

// ── Peak Hours Heatmap ────────────────────────────────────────────────────────
const PeakHoursHeatmap = ({ data, loading }) => {
  if (loading) return <div className="grid grid-cols-12 gap-1">{Array.from({ length: 24 }).map((_, i) => <Skeleton key={i} h="h-10" rounded="rounded-md" />)}</div>;
  if (!data?.length) return <div className="text-gray-500 text-sm">No data</div>;

  const maxSessions = Math.max(...data.map(d => d.sessions), 1);
  return (
    <div className="grid grid-cols-12 gap-1">
      {data.map((d) => {
        const intensity = d.sessions / maxSessions;
        const bg = `rgba(32,178,170,${0.08 + intensity * 0.85})`;
        return (
          <div
            key={d.hour}
            title={`${d.label}: ${d.sessions} sessions · ${fmtShort(d.revenue)}`}
            className="rounded-md flex flex-col items-center justify-center p-1 cursor-default transition-all hover:scale-110"
            style={{ background: bg, minHeight: '44px' }}
          >
            <div className="text-white text-xs font-bold">{d.hour}</div>
            <div className="text-white/60 text-[10px]">{d.sessions}</div>
          </div>
        );
      })}
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
const StatisticsPage = () => {
  const [period,   setPeriod]   = useState('today');
  const [liveAt,   setLiveAt]   = useState(null);   // last successful fetch
  const [loading,  setLoading]  = useState({});      // { key: bool }
  const [data,     setData]     = useState({});      // { key: payload }
  const [errors,   setErrors]   = useState({});      // { key: bool }
  const timerRef = useRef(null);

  const base = getApiBase().replace(/\/$/, '');

  // ── Fetch helpers ─────────────────────────────────────────────────────────
  const fetchOne = useCallback(async (key, url) => {
    setLoading(prev => ({ ...prev, [key]: true }));
    try {
      const r = await axios.get(`${base}${url}&period=${period}`, { headers: authHeaders() });
      setData(prev => ({ ...prev, [key]: r.data }));
      setErrors(prev => ({ ...prev, [key]: false }));
    } catch {
      setErrors(prev => ({ ...prev, [key]: true }));
    } finally {
      setLoading(prev => ({ ...prev, [key]: false }));
    }
  }, [base, period]);

  const fetchAll = useCallback(() => {
    Promise.all([
      fetchOne('summary',  '/api/analytics/summary?_=1'),
      fetchOne('ts',       '/api/analytics/timeseries?_=1'),
      fetchOne('products', '/api/analytics/top-products?_=1'),
      fetchOne('users',    '/api/analytics/users?_=1'),
      fetchOne('peak',     '/api/analytics/peak-hours?_=1'),
      fetchOne('payment',  '/api/analytics/payment-breakdown?_=1'),
    ]).then(() => setLiveAt(new Date()));
  }, [fetchOne]);

  // Initial fetch + period change
  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-refresh every 10 s
  useEffect(() => {
    timerRef.current = setInterval(fetchAll, 10_000);
    return () => clearInterval(timerRef.current);
  }, [fetchAll]);

  // ── Export CSV ────────────────────────────────────────────────────────────
  const exportCsv = () => {
    const s   = data.summary || {};
    const rows = [
      ['Metric', 'Value'],
      ['Total Sales',    s.total_sales   ?? 0],
      ['Total Income',   s.total_income  ?? 0],
      ['Wallet Topups',  s.wallet_topups ?? 0],
      ['Total Users',    s.total_users   ?? 0],
      ['Total PCs',      s.total_pcs     ?? 0],
      ['Active Sessions',s.active_sessions ?? 0],
      ['Total Sessions', s.total_sessions  ?? 0],
      [],
      ['Product', 'Price', 'Qty', 'Revenue'],
      ...(data.products || []).map(p => [p.name, p.price, p.qty, p.revenue]),
      [],
      ['User', 'Sessions', 'Spend', 'Last Active'],
      ...(data.users || []).map(u => [u.name, u.session_count, u.total_spend, u.last_active]),
    ];
    const csv  = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const ts   = new Date().toISOString().slice(0, 10);
    a.href = url; a.download = `primus_stats_${period}_${ts}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Period filter ─────────────────────────────────────────────────────────
  const periods = [
    { key: 'today',      label: 'Today' },
    { key: 'yesterday',  label: 'Yesterday' },
    { key: 'this_week',  label: 'This Week' },
    { key: 'this_month', label: 'This Month' },
  ];

  const s       = data.summary  || {};
  const ts      = data.ts       || {};
  const series  = ts.series     || [];
  const payment = data.payment  || [];

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-white">Statistics</h1>
          {liveAt && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Live · {liveAt.toLocaleTimeString()}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="pill">Period:</span>
          <select
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className="search-input rounded-md py-1.5 px-3 text-white bg-transparent"
          >
            {periods.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <button className="pill" onClick={fetchAll}>↻ Refresh</button>
          <button className="btn-primary-neo px-3 py-1.5 rounded-md text-sm" onClick={exportCsv}>
            ↓ Export CSV
          </button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Sales"          value={fmt(s.total_sales)}    sub={`${s.total_sessions ?? 0} orders`}          icon="💰" color={C.primary} loading={loading.summary} />
        <KpiCard label="Income"         value={fmt(s.total_income)}   sub={`₹${Number(s.wallet_topups||0).toFixed(0)} topups`} icon="📈" color={C.green}   loading={loading.summary} />
        <KpiCard label="Users"          value={s.total_users ?? 0}    sub={`${s.active_sessions ?? 0} active now`}     icon="👥" color={C.accent} loading={loading.summary} />
        <KpiCard label="PCs"            value={s.total_pcs ?? 0}      sub={`${s.active_sessions ?? 0} in session`}     icon="🖥️" color={C.orange} loading={loading.summary} />
      </div>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Sales Area Chart */}
        <div className="card-animated p-4">
          <SectionTitle>Sales Over Time</SectionTitle>
          {loading.ts ? (
            <Skeleton h="h-48" />
          ) : (
            <ResponsiveContainer width="100%" height={192}>
              <AreaChart data={series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={C.primary} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={C.primary} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.muted} />
                <XAxis dataKey="label" tick={{ fill: C.text, fontSize: 10 }} interval={3} />
                <YAxis tickFormatter={fmtShort} tick={{ fill: C.text, fontSize: 10 }} width={48} />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone" dataKey="revenue" name="revenue"
                  stroke={C.primary} strokeWidth={2}
                  fill="url(#revGrad)" dot={false} activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Sessions Bar Chart */}
        <div className="card-animated p-4">
          <SectionTitle>User Activity (Sessions)</SectionTitle>
          {loading.ts ? (
            <Skeleton h="h-48" />
          ) : (
            <ResponsiveContainer width="100%" height={192}>
              <BarChart data={series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.muted} />
                <XAxis dataKey="label" tick={{ fill: C.text, fontSize: 10 }} interval={3} />
                <YAxis tick={{ fill: C.text, fontSize: 10 }} width={32} />
                <Tooltip content={<ChartTooltip prefix="" />} />
                <Bar dataKey="sessions" name="sessions" fill={C.accent} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Heatmap + Pie ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Peak Hours Heatmap (2/3 width) */}
        <div className="card-animated p-4 lg:col-span-2">
          <SectionTitle>Peak Activity Hours (24h)</SectionTitle>
          <PeakHoursHeatmap data={data.peak} loading={loading.peak} />
          <div className="flex items-center gap-3 mt-3 text-[10px] text-gray-500">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm" style={{ background: 'rgba(32,178,170,0.1)' }} />
              Low
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm" style={{ background: 'rgba(32,178,170,0.5)' }} />
              Medium
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm" style={{ background: 'rgba(32,178,170,0.93)' }} />
              High
            </div>
          </div>
        </div>

        {/* Payment Breakdown Pie (1/3 width) */}
        <div className="card-animated p-4">
          <SectionTitle>Payment Breakdown</SectionTitle>
          {loading.payment ? (
            <div className="flex justify-center"><Skeleton h="h-40" w="w-40" rounded="rounded-full" /></div>
          ) : payment.length === 0 ? (
            <div className="text-gray-500 text-sm text-center py-10">No transactions</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={payment} dataKey="total" nameKey="method"
                    cx="50%" cy="50%" innerRadius={40} outerRadius={70}
                    paddingAngle={3}
                  >
                    {payment.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => fmtShort(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1 mt-1">
                {payment.map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-gray-300 capitalize">{p.method}</span>
                    </div>
                    <span className="text-gray-400">{fmtShort(p.total)} · {p.count}×</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Tables ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Products Table */}
        <div>
          <SectionTitle>Top Products</SectionTitle>
          <SortableTable
            loading={loading.products}
            rows={data.products || []}
            emptyMsg="No product sales in this period"
            columns={[
              { key: 'name',    label: 'Product' },
              { key: 'price',   label: 'Price',   render: v => fmt(v) },
              { key: 'qty',     label: 'Qty Sold' },
              { key: 'revenue', label: 'Revenue',  render: v => fmt(v) },
            ]}
          />
        </div>

        {/* Users Table */}
        <div>
          <SectionTitle>User Activity</SectionTitle>
          <SortableTable
            loading={loading.users}
            rows={data.users || []}
            emptyMsg="No user activity in this period"
            columns={[
              { key: 'name',          label: 'User' },
              { key: 'session_count', label: 'Sessions' },
              { key: 'total_spend',   label: 'Spend',       render: v => fmt(v) },
              { key: 'last_active',   label: 'Last Active', render: v => relTime(v) },
            ]}
          />
        </div>
      </div>

    </div>
  );
};

export default StatisticsPage;
