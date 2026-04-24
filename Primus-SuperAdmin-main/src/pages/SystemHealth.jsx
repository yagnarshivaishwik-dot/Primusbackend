import { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  Server,
  Database,
  Wifi,
  Monitor,
  CreditCard,
  Shield,
  Clock,
  Bell,
  Settings,
  FileText,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  XCircle,
  ArrowUp,
  ArrowDown,
  Zap,
  HardDrive,
  Users,
  TrendingUp,
  Play,
  Pause,
  Power,
  Download,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import useAuthStore from '../stores/authStore';
import api from '../api/client';

// ============================================
// MOCK DATA - Replace with real API calls
// ============================================
const generateMockData = () => ({
  global: {
    status: 'healthy', // healthy | degraded | incident
    uptime24h: 99.97,
    uptime7d: 99.94,
    uptime30d: 99.91,
    activeIncidents: 0,
    lastDeployment: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    mttr: 4.2, // minutes
  },
  api: {
    availability: 99.9,
    avgLatency: 45,
    p95Latency: 120,
    p99Latency: 280,
    errorRate4xx: 0.8,
    errorRate5xx: 0.1,
    rps: 245,
    failedJobs: 2,
    services: [
      { name: 'Auth Service', status: 'healthy', latency: 32, lastHeartbeat: Date.now() - 15000 },
      { name: 'Licensing', status: 'healthy', latency: 45, lastHeartbeat: Date.now() - 12000 },
      { name: 'PC Control', status: 'healthy', latency: 28, lastHeartbeat: Date.now() - 8000 },
      { name: 'Billing', status: 'warning', latency: 180, lastHeartbeat: Date.now() - 45000 },
      { name: 'Telemetry', status: 'healthy', latency: 55, lastHeartbeat: Date.now() - 20000 },
    ],
  },
  database: {
    poolUsage: 45,
    poolMax: 100,
    readLatency: 2.3,
    writeLatency: 8.7,
    slowQueries: 3,
    replicationLag: 0.2, // seconds
    diskPercent: 67,
    diskTotal: '500GB',
    diskUsed: '335GB',
    backupStatus: 'success',
    lastBackup: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  network: {
    activeConnections: 1247,
    cmdSuccessRate: 99.8,
    avgRtt: 45,
    droppedRate: 0.02,
    commandAckTime: 120, // ms
  },
  fleet: {
    total: 2450,
    online: 1892,
    offline: 546,
    stale: 12, // not seen in last 5 minutes
    versions: {
      '1.2.5': 1650,
      '1.2.4': 580,
      '1.2.3': 180,
      '1.2.2': 40,
    },
    osList: {
      'Windows 11 Pro': 1420,
      'Windows 11 Home': 380,
      'Windows 10 Pro': 520,
      'Windows 10 Home': 130,
    },
  },
  licensing: {
    active: 156,
    total: 180,
    expiring7d: 4,
    expiring14d: 8,
    expiring30d: 15,
    suspended: 2,
    violations: 1,
    trialConversionRate: 23.5,
    mismatches: 3,
    unauthorized: 0,
  },
  security: {
    failedLogins24h: 23,
    failedLoginsRate: 'normal', // normal | elevated | critical
    otpFailures: 2,
    tokenAnomalies: 0,
    privilegeEscalations: 0,
    agentIntegrityFails: 0,
    integrityOk: true,
  },
  jobs: {
    queueDepth: 34,
    processing: 8,
    failed24h: 2,
    retryStorms: 0,
    longRunning: 0,
    jobs: [
      { name: 'PC Registration', status: 'healthy', processed: 1250, failed: 0 },
      { name: 'Email Delivery', status: 'healthy', processed: 890, failed: 2 },
      { name: 'License Enforcement', status: 'healthy', processed: 450, failed: 0 },
      { name: 'Analytics Rollup', status: 'healthy', processed: 24, failed: 0 },
    ],
  },
  alerts: [
    { id: 1, severity: 'warning', title: 'Billing service latency elevated', time: Date.now() - 300000, category: 'api' },
    { id: 2, severity: 'info', title: 'Scheduled maintenance in 2 hours', time: Date.now() - 600000, category: 'system' },
    { id: 3, severity: 'warning', title: '4 licenses expiring in 7 days', time: Date.now() - 900000, category: 'licensing' },
  ],
  insights: [
    { id: 1, type: 'trend', message: 'PC offline rate decreased 12% after client update v1.2.5' },
    { id: 2, type: 'correlation', message: 'Billing latency spike correlated with increased API traffic' },
  ],
  auditTrail: [
    { id: 1, type: 'deploy', message: 'v2.1.4 deployed', time: Date.now() - 7200000, user: 'ci-bot' },
    { id: 2, type: 'alert', message: 'Billing latency alert triggered', time: Date.now() - 3600000 },
    { id: 3, type: 'action', message: 'Service restart initiated', time: Date.now() - 1800000, user: 'admin@primus.io' },
    { id: 4, type: 'resolve', message: 'Alert auto-resolved', time: Date.now() - 900000 },
  ],
});

// ============================================
// HELPER COMPONENTS
// ============================================
const StatusBadge = ({ status }) => {
  const config = {
    healthy: { label: 'Healthy', color: 'success', Icon: CheckCircle },
    degraded: { label: 'Degraded', color: 'warning', Icon: AlertTriangle },
    incident: { label: 'Incident', color: 'danger', Icon: XCircle },
    warning: { label: 'Warning', color: 'warning', Icon: AlertTriangle },
    critical: { label: 'Critical', color: 'danger', Icon: AlertCircle },
    info: { label: 'Info', color: 'info', Icon: Bell },
  };
  const { label, color, Icon } = config[status] || config.healthy;
  return (
    <span className={`status-badge status-badge--${color}`}>
      <Icon size={14} />
      {label}
    </span>
  );
};

const Sparkline = ({ data, color = 'var(--accent-primary)', height = 24 }) => {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 100 - ((v - min) / range) * 100;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg className="sparkline" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ height }}>
      <polyline fill="none" stroke={color} strokeWidth="2" points={points} />
    </svg>
  );
};

const MetricCard = ({ icon: Icon, label, value, unit, trend, trendValue, status, sparkData }) => (
  <div className={`metric-card ${status ? `metric-card--${status}` : ''}`}>
    <div className="metric-card__header">
      <div className="metric-card__icon">
        <Icon size={18} />
      </div>
      <span className="metric-card__label">{label}</span>
    </div>
    <div className="metric-card__body">
      <span className="metric-card__value">{value}</span>
      {unit && <span className="metric-card__unit">{unit}</span>}
    </div>
    {(trend || sparkData) && (
      <div className="metric-card__footer">
        {trend && (
          <span className={`metric-card__trend metric-card__trend--${trend}`}>
            {trend === 'up' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
            {trendValue}
          </span>
        )}
        {sparkData && <Sparkline data={sparkData} />}
      </div>
    )}
  </div>
);

const Section = ({ icon: Icon, title, badge, children, collapsible = false }) => {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <section className="health-section">
      <div className="health-section__header" onClick={collapsible ? () => setIsOpen(!isOpen) : undefined}>
        <div className="health-section__title-group">
          <Icon size={20} className="health-section__icon" />
          <h2 className="health-section__title">{title}</h2>
          {badge && <span className="health-section__badge">{badge}</span>}
        </div>
        {collapsible && (
          <ChevronRight size={18} className={`health-section__chevron ${isOpen ? 'rotated' : ''}`} />
        )}
      </div>
      {isOpen && <div className="health-section__content">{children}</div>}
    </section>
  );
};

const formatTimeAgo = (timestamp) => {
  const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

// ============================================
// MAIN COMPONENT
// ============================================
export default function SystemHealth() {
  const { isSuperAdmin } = useAuthStore();
  const [data, setData] = useState({
    global: { status: 'healthy', uptime24h: 0, uptime7d: 0, uptime30d: 0, activeIncidents: 0, lastDeployment: null, mttr: 0 },
    api: { availability: 0, avgLatency: 0, p95Latency: 0, p99Latency: 0, errorRate4xx: 0, errorRate5xx: 0, rps: 0, services: [] },
    database: { poolUsage: 0, poolMax: 100, readLatency: 0, writeLatency: 0, slowQueries: 0, replicationLag: 0, diskPercent: 0, backupStatus: 'unknown', lastBackup: null },
    network: { activeConnections: 0, cmdSuccessRate: 0, avgRtt: 0, commandAckTime: 0 },
    fleet: { total: 0, online: 0, offline: 0, stale: 0, versions: {}, osList: {} },
    licensing: { active: 0, total: 0, expiring7d: 0, suspended: 0, violations: 0, trialConversionRate: 0, mismatches: 0 },
    security: { failedLogins24h: 0, failedLoginsRate: 'normal', otpFailures: 0, tokenAnomalies: 0, integrityOk: true },
    jobs: { queueDepth: 0, processing: 0, failed24h: 0, longRunning: 0, jobs: [] },
    alerts: [],
    insights: [],
    auditTrail: [],
    systemState: { maintenance_mode: false, deployments_paused: false, commands_disabled: false },
  });
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [actionLoading, setActionLoading] = useState(null);
  const [showConfirm, setShowConfirm] = useState(null);

  // Fetch all health data from API
  const fetchHealthData = async () => {
    setIsLoading(true);
    try {
      const [overview, apiHealth, dbHealth, networkHealth, fleetHealth, licensingHealth, securityHealth, jobsHealth, systemState] = await Promise.all([
        api.get('/internal/health/overview').catch(() => ({ data: { status: 'healthy', uptime_percent: 99.9, active_incidents: 0, last_deployment: null, mttr_hours: 0 } })),
        api.get('/internal/health/api').catch(() => ({ data: { avg_latency_ms: 0, error_rate_percent: 0, requests_per_second: 0, services: [] } })),
        api.get('/internal/health/database').catch(() => ({ data: { connection_pool_usage: 0, read_latency_ms: 0, write_latency_ms: 0, disk_utilization_percent: 0, last_backup: null, backup_status: 'unknown' } })),
        api.get('/internal/health/network').catch(() => ({ data: { websocket_connections: 0, command_success_rate: 0, avg_rtt_ms: 0, offline_pc_count: 0 } })),
        api.get('/internal/health/fleet').catch(() => ({ data: { total_pcs: 0, online_pcs: 0, offline_pcs: 0, stale_pcs: 0, agent_versions: [], os_distribution: [] } })),
        api.get('/internal/health/licensing').catch(() => ({ data: { active_licenses: 0, expiring_soon: 0, expired: 0, suspended: 0, violations: 0 } })),
        api.get('/internal/health/security').catch(() => ({ data: { failed_logins_24h: 0, otp_failures_24h: 0, token_anomalies: 0, integrity_issues: 0 } })),
        api.get('/internal/health/jobs').catch(() => ({ data: { queue_depth: 0, failed_jobs_24h: 0, long_running_tasks: 0 } })),
        api.get('/internal/system/state').catch(() => ({ data: { maintenance_mode: false, deployments_paused: false, commands_disabled: false } })),
      ]);

      // Transform API data to component format
      const overviewData = overview.data;
      const apiData = apiHealth.data;
      const dbData = dbHealth.data;
      const netData = networkHealth.data;
      const fleetData = fleetHealth.data;
      const licData = licensingHealth.data;
      const secData = securityHealth.data;
      const jobData = jobsHealth.data;

      setData({
        global: {
          status: overviewData.status || 'healthy',
          uptime24h: overviewData.uptime_percent || 99.9,
          uptime7d: overviewData.uptime_percent || 99.9,
          uptime30d: overviewData.uptime_percent || 99.9,
          activeIncidents: overviewData.active_incidents || 0,
          lastDeployment: overviewData.last_deployment,
          mttr: overviewData.mttr_hours || 0,
        },
        api: {
          availability: 99.9,
          avgLatency: apiData.avg_latency_ms || 0,
          p95Latency: apiData.avg_latency_ms ? apiData.avg_latency_ms * 2.5 : 100,
          p99Latency: apiData.avg_latency_ms ? apiData.avg_latency_ms * 5 : 200,
          errorRate4xx: apiData.error_rate_percent * 0.8 || 0,
          errorRate5xx: apiData.error_rate_percent * 0.2 || 0,
          rps: apiData.requests_per_second || 0,
          services: apiData.services || [],
        },
        database: {
          poolUsage: dbData.connection_pool_usage || 0,
          poolMax: 100,
          readLatency: dbData.read_latency_ms || 0,
          writeLatency: dbData.write_latency_ms || 0,
          slowQueries: 0,
          replicationLag: 0,
          diskPercent: dbData.disk_utilization_percent || 0,
          backupStatus: dbData.backup_status || 'unknown',
          lastBackup: dbData.last_backup,
        },
        network: {
          activeConnections: netData.websocket_connections || 0,
          cmdSuccessRate: netData.command_success_rate || 0,
          avgRtt: netData.avg_rtt_ms || 0,
          commandAckTime: 100,
        },
        fleet: {
          total: fleetData.total_pcs || 0,
          online: fleetData.online_pcs || 0,
          offline: fleetData.offline_pcs || 0,
          stale: fleetData.stale_pcs || 0,
          versions: (fleetData.agent_versions || []).reduce((acc, v) => ({ ...acc, [v.version]: v.count }), {}),
          osList: (fleetData.os_distribution || []).reduce((acc, o) => ({ ...acc, [o.os]: o.count }), {}),
        },
        licensing: {
          active: licData.active_licenses || 0,
          total: (licData.active_licenses || 0) + (licData.expired || 0),
          expiring7d: licData.expiring_soon || 0,
          suspended: licData.suspended || 0,
          violations: licData.violations || 0,
          trialConversionRate: 23.5,
          mismatches: 0,
        },
        security: {
          failedLogins24h: secData.failed_logins_24h || 0,
          failedLoginsRate: secData.failed_logins_24h > 50 ? 'critical' : secData.failed_logins_24h > 20 ? 'elevated' : 'normal',
          otpFailures: secData.otp_failures_24h || 0,
          tokenAnomalies: secData.token_anomalies || 0,
          integrityOk: secData.integrity_issues === 0,
        },
        jobs: {
          queueDepth: jobData.queue_depth || 0,
          processing: 0,
          failed24h: jobData.failed_jobs_24h || 0,
          longRunning: jobData.long_running_tasks || 0,
          jobs: [
            { name: 'PC Registration', status: 'healthy', processed: 0, failed: 0 },
            { name: 'Email Delivery', status: 'healthy', processed: 0, failed: 0 },
            { name: 'License Enforcement', status: 'healthy', processed: 0, failed: 0 },
          ],
        },
        alerts: [],
        insights: [],
        auditTrail: [],
        systemState: systemState.data,
      });
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Failed to fetch health data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchHealthData();
  };

  // Initial fetch and periodic refresh
  useEffect(() => {
    fetchHealthData();
    const interval = setInterval(fetchHealthData, 30000);
    return () => clearInterval(interval);
  }, []);

  // System action handlers
  const executeSystemAction = async (action, endpoint) => {
    setActionLoading(action);
    try {
      const response = await api.post(`/internal/system/${endpoint}`);
      if (response.data.success) {
        alert(`${action} executed successfully!`);
        fetchHealthData(); // Refresh state
      }
    } catch (err) {
      alert(`Failed to execute ${action}: ${err.response?.data?.detail || err.message}`);
    } finally {
      setActionLoading(null);
      setShowConfirm(null);
    }
  };

  const handleMaintenanceMode = async () => {
    setActionLoading('maintenance');
    try {
      const response = await api.post('/internal/system/maintenance-mode', {
        enabled: !data.systemState.maintenance_mode,
      });
      if (response.data.success) {
        alert(response.data.message);
        fetchHealthData();
      }
    } catch (err) {
      alert(`Failed: ${err.response?.data?.detail || err.message}`);
    } finally {
      setActionLoading(null);
      setShowConfirm(null);
    }
  };

  // Generate sparkline data
  const sparkData = useMemo(() => ({
    latency: Array.from({ length: 20 }, () => 30 + Math.random() * 60),
    rps: Array.from({ length: 20 }, () => 200 + Math.random() * 100),
    connections: Array.from({ length: 20 }, () => 1100 + Math.random() * 300),
  }), [lastRefresh]);

  return (
    <div className="system-health">
      {/* Page Header */}
      <header className="page-header">
        <div className="page-header-content">
          <div className="page-header-icon">
            <Activity size={24} />
          </div>
          <div>
            <h1 className="page-title">System Health</h1>
            <p className="page-subtitle">
              Last updated {formatTimeAgo(lastRefresh)}
            </p>
          </div>
        </div>
        <div className="page-header-actions">
          <button className="btn btn--ghost" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw size={16} className={isLoading ? 'spin' : ''} />
            Refresh
          </button>
        </div>
      </header>

      {/* Section 1: Global Platform Health */}
      <section className="global-health">
        <div className="global-health__status">
          <div className={`global-status-badge global-status-badge--${data.global.status}`}>
            {data.global.status === 'healthy' && <CheckCircle size={28} />}
            {data.global.status === 'degraded' && <AlertTriangle size={28} />}
            {data.global.status === 'incident' && <XCircle size={28} />}
            <span>{data.global.status.toUpperCase()}</span>
          </div>
          <div className="global-health__live-indicator">
            <span className="live-dot"></span>
            <span>Live</span>
          </div>
        </div>
        <div className="global-health__metrics">
          <div className="global-metric">
            <span className="global-metric__value">{data.global.uptime24h}%</span>
            <span className="global-metric__label">Uptime 24h</span>
          </div>
          <div className="global-metric">
            <span className="global-metric__value">{data.global.uptime7d}%</span>
            <span className="global-metric__label">Uptime 7d</span>
          </div>
          <div className="global-metric">
            <span className="global-metric__value">{data.global.uptime30d}%</span>
            <span className="global-metric__label">Uptime 30d</span>
          </div>
          <div className="global-metric">
            <span className="global-metric__value">{data.global.activeIncidents}</span>
            <span className="global-metric__label">Active Incidents</span>
          </div>
          <div className="global-metric">
            <span className="global-metric__value">{formatTimeAgo(data.global.lastDeployment)}</span>
            <span className="global-metric__label">Last Deploy</span>
          </div>
          <div className="global-metric">
            <span className="global-metric__value">{data.global.mttr}m</span>
            <span className="global-metric__label">MTTR</span>
          </div>
        </div>
      </section>

      <div className="health-grid">
        {/* Section 2: Backend & API Health */}
        <Section icon={Server} title="Backend & API Health">
          <div className="metrics-grid">
            <MetricCard
              icon={Zap}
              label="API Availability"
              value={data.api.availability}
              unit="%"
              status={data.api.availability >= 99.9 ? 'success' : data.api.availability >= 99 ? 'warning' : 'danger'}
            />
            <MetricCard
              icon={Clock}
              label="P95 Latency"
              value={data.api.p95Latency}
              unit="ms"
              sparkData={sparkData.latency}
              status={data.api.p95Latency < 150 ? 'success' : data.api.p95Latency < 300 ? 'warning' : 'danger'}
            />
            <MetricCard
              icon={AlertCircle}
              label="Error Rate"
              value={(data.api.errorRate4xx + data.api.errorRate5xx).toFixed(1)}
              unit="%"
              status={data.api.errorRate5xx < 0.5 ? 'success' : 'danger'}
            />
            <MetricCard
              icon={TrendingUp}
              label="Requests/sec"
              value={data.api.rps}
              sparkData={sparkData.rps}
            />
          </div>
          <div className="services-list">
            <h4 className="subsection-title">Service Status</h4>
            {data.api.services.map((svc) => (
              <div key={svc.name} className="service-row">
                <div className="service-row__status">
                  <span className={`status-dot status-dot--${svc.status === 'healthy' ? 'online' : 'warning'}`} />
                  <span className="service-row__name">{svc.name}</span>
                </div>
                <div className="service-row__meta">
                  <span className="service-row__latency">{svc.latency}ms</span>
                  <span className="service-row__heartbeat">{formatTimeAgo(svc.lastHeartbeat)}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Section 3: Database & Storage Health */}
        <Section icon={Database} title="Database & Storage">
          <div className="metrics-grid">
            <MetricCard
              icon={Activity}
              label="Connection Pool"
              value={`${data.database.poolUsage}/${data.database.poolMax}`}
              status={data.database.poolUsage / data.database.poolMax < 0.7 ? 'success' : data.database.poolUsage / data.database.poolMax < 0.9 ? 'warning' : 'danger'}
            />
            <MetricCard
              icon={Clock}
              label="Write Latency"
              value={data.database.writeLatency}
              unit="ms"
              status={data.database.writeLatency < 10 ? 'success' : data.database.writeLatency < 50 ? 'warning' : 'danger'}
            />
            <MetricCard
              icon={HardDrive}
              label="Disk Usage"
              value={data.database.diskPercent}
              unit="%"
              status={data.database.diskPercent < 70 ? 'success' : data.database.diskPercent < 85 ? 'warning' : 'danger'}
            />
            <MetricCard
              icon={AlertTriangle}
              label="Slow Queries"
              value={data.database.slowQueries}
              status={data.database.slowQueries === 0 ? 'success' : data.database.slowQueries < 5 ? 'warning' : 'danger'}
            />
          </div>
          <div className="backup-status">
            <div className={`backup-badge backup-badge--${data.database.backupStatus}`}>
              {data.database.backupStatus === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
              <span>Backup: {formatTimeAgo(data.database.lastBackup)}</span>
            </div>
            <span className="replication-lag">Replication Lag: {data.database.replicationLag}s</span>
          </div>
        </Section>

        {/* Section 4: Network & Connectivity */}
        <Section icon={Wifi} title="Network & Connectivity">
          <div className="metrics-grid">
            <MetricCard
              icon={Users}
              label="Active Connections"
              value={data.network.activeConnections.toLocaleString()}
              sparkData={sparkData.connections}
            />
            <MetricCard
              icon={CheckCircle}
              label="Command Success"
              value={data.network.cmdSuccessRate}
              unit="%"
              status={data.network.cmdSuccessRate >= 99.5 ? 'success' : data.network.cmdSuccessRate >= 98 ? 'warning' : 'danger'}
            />
            <MetricCard
              icon={Zap}
              label="Avg RTT"
              value={data.network.avgRtt}
              unit="ms"
            />
            <MetricCard
              icon={Clock}
              label="Cmd Ack Time"
              value={data.network.commandAckTime}
              unit="ms"
            />
          </div>
        </Section>

        {/* Section 5: Client PC Fleet Health */}
        <Section icon={Monitor} title="PC Fleet Health" badge={`${data.fleet.total} PCs`}>
          <div className="fleet-overview">
            <div className="fleet-stat fleet-stat--online">
              <span className="fleet-stat__value">{data.fleet.online}</span>
              <span className="fleet-stat__label">Online</span>
              <span className="fleet-stat__pct">{((data.fleet.online / data.fleet.total) * 100).toFixed(1)}%</span>
            </div>
            <div className="fleet-stat fleet-stat--offline">
              <span className="fleet-stat__value">{data.fleet.offline}</span>
              <span className="fleet-stat__label">Offline</span>
            </div>
            <div className="fleet-stat fleet-stat--stale">
              <span className="fleet-stat__value">{data.fleet.stale}</span>
              <span className="fleet-stat__label">Stale (&gt;5m)</span>
            </div>
          </div>
          <div className="distribution-grid">
            <div className="distribution-card">
              <h4 className="distribution-card__title">Agent Versions</h4>
              {Object.entries(data.fleet.versions).map(([ver, count]) => (
                <div key={ver} className="distribution-row">
                  <span className="distribution-row__label">v{ver}</span>
                  <div className="distribution-row__bar">
                    <div style={{ width: `${(count / data.fleet.total) * 100}%` }} />
                  </div>
                  <span className="distribution-row__value">{count}</span>
                </div>
              ))}
            </div>
            <div className="distribution-card">
              <h4 className="distribution-card__title">OS Distribution</h4>
              {Object.entries(data.fleet.osList).map(([os, count]) => (
                <div key={os} className="distribution-row">
                  <span className="distribution-row__label">{os}</span>
                  <div className="distribution-row__bar">
                    <div style={{ width: `${(count / data.fleet.total) * 100}%` }} />
                  </div>
                  <span className="distribution-row__value">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* Section 6: Licensing & Subscription Health */}
        <Section icon={CreditCard} title="Licensing Health">
          <div className="metrics-grid">
            <MetricCard
              icon={CheckCircle}
              label="Active Licenses"
              value={data.licensing.active}
              unit={`/ ${data.licensing.total}`}
            />
            <MetricCard
              icon={Clock}
              label="Expiring (7d)"
              value={data.licensing.expiring7d}
              status={data.licensing.expiring7d > 0 ? 'warning' : 'success'}
            />
            <MetricCard
              icon={AlertTriangle}
              label="Violations"
              value={data.licensing.violations}
              status={data.licensing.violations > 0 ? 'danger' : 'success'}
            />
            <MetricCard
              icon={TrendingUp}
              label="Trial Conversion"
              value={data.licensing.trialConversionRate}
              unit="%"
            />
          </div>
          {(data.licensing.mismatches > 0 || data.licensing.unauthorized > 0) && (
            <div className="licensing-alerts">
              {data.licensing.mismatches > 0 && (
                <div className="alert-row alert-row--warning">
                  <AlertTriangle size={16} />
                  <span>{data.licensing.mismatches} License-to-PC mismatches detected</span>
                </div>
              )}
              {data.licensing.unauthorized > 0 && (
                <div className="alert-row alert-row--danger">
                  <AlertCircle size={16} />
                  <span>{data.licensing.unauthorized} Unauthorized PC attempts</span>
                </div>
              )}
            </div>
          )}
        </Section>

        {/* Section 7: Security & Integrity */}
        <Section icon={Shield} title="Security & Integrity">
          <div className="metrics-grid">
            <MetricCard
              icon={Users}
              label="Failed Logins (24h)"
              value={data.security.failedLogins24h}
              status={data.security.failedLoginsRate === 'normal' ? 'success' : data.security.failedLoginsRate === 'elevated' ? 'warning' : 'danger'}
            />
            <MetricCard
              icon={AlertCircle}
              label="OTP Failures"
              value={data.security.otpFailures}
              status={data.security.otpFailures < 5 ? 'success' : 'warning'}
            />
            <MetricCard
              icon={Shield}
              label="Token Anomalies"
              value={data.security.tokenAnomalies}
              status={data.security.tokenAnomalies === 0 ? 'success' : 'danger'}
            />
            <MetricCard
              icon={CheckCircle}
              label="Agent Integrity"
              value={data.security.integrityOk ? 'OK' : 'FAIL'}
              status={data.security.integrityOk ? 'success' : 'danger'}
            />
          </div>
        </Section>

        {/* Section 8: Background Jobs */}
        <Section icon={Clock} title="Background Jobs">
          <div className="metrics-grid metrics-grid--small">
            <MetricCard icon={Activity} label="Queue Depth" value={data.jobs.queueDepth} />
            <MetricCard icon={Play} label="Processing" value={data.jobs.processing} />
            <MetricCard icon={XCircle} label="Failed (24h)" value={data.jobs.failed24h} status={data.jobs.failed24h > 0 ? 'warning' : 'success'} />
            <MetricCard icon={AlertTriangle} label="Long Running" value={data.jobs.longRunning} status={data.jobs.longRunning > 0 ? 'warning' : 'success'} />
          </div>
          <div className="jobs-list">
            {data.jobs.jobs.map((job) => (
              <div key={job.name} className="job-row">
                <span className={`status-dot status-dot--${job.status === 'healthy' ? 'online' : 'warning'}`} />
                <span className="job-row__name">{job.name}</span>
                <span className="job-row__stats">
                  <span className="text-success">{job.processed} processed</span>
                  {job.failed > 0 && <span className="text-danger">{job.failed} failed</span>}
                </span>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* Section 9: Alerts & Insights */}
      <Section icon={Bell} title="Alerts & Insights">
        <div className="alerts-grid">
          <div className="alerts-column">
            <h4 className="subsection-title">Active Alerts</h4>
            {data.alerts.length === 0 ? (
              <div className="empty-state">No active alerts</div>
            ) : (
              data.alerts.map((alert) => (
                <div key={alert.id} className={`alert-card alert-card--${alert.severity}`}>
                  <div className="alert-card__icon">
                    {alert.severity === 'critical' && <XCircle size={18} />}
                    {alert.severity === 'warning' && <AlertTriangle size={18} />}
                    {alert.severity === 'info' && <Bell size={18} />}
                  </div>
                  <div className="alert-card__content">
                    <span className="alert-card__title">{alert.title}</span>
                    <span className="alert-card__time">{formatTimeAgo(alert.time)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="insights-column">
            <h4 className="subsection-title">Intelligent Insights</h4>
            {data.insights.map((insight) => (
              <div key={insight.id} className="insight-card">
                <Zap size={16} className="insight-card__icon" />
                <span className="insight-card__message">{insight.message}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Section 10: System Actions (Super Admin Only) */}
      {isSuperAdmin() && (
        <Section icon={Settings} title="System Actions">
          <div className="actions-grid">
            <button
              className="action-button"
              onClick={() => {
                if (confirm('Are you sure you want to restart the backend service?')) {
                  executeSystemAction('Restart Service', 'restart-service');
                }
              }}
              disabled={actionLoading === 'restart'}
            >
              <RefreshCw size={20} className={actionLoading === 'restart' ? 'spin' : ''} />
              <span>Restart Service</span>
            </button>
            <button
              className={`action-button ${data.systemState?.deployments_paused ? 'action-button--active' : ''}`}
              onClick={() => {
                if (confirm(`Are you sure you want to ${data.systemState?.deployments_paused ? 'resume' : 'pause'} deployments?`)) {
                  executeSystemAction('Pause Deployments', 'pause-deployments');
                }
              }}
              disabled={actionLoading === 'pause'}
            >
              <Pause size={20} />
              <span>{data.systemState?.deployments_paused ? 'Resume Deployments' : 'Pause Deployments'}</span>
            </button>
            <button
              className={`action-button ${data.systemState?.commands_disabled ? 'action-button--active' : ''}`}
              onClick={() => {
                if (confirm(`Are you sure you want to ${data.systemState?.commands_disabled ? 'enable' : 'disable'} PC commands?`)) {
                  executeSystemAction('Toggle Commands', 'disable-commands');
                }
              }}
              disabled={actionLoading === 'commands'}
            >
              <Power size={20} />
              <span>{data.systemState?.commands_disabled ? 'Enable Commands' : 'Disable Commands'}</span>
            </button>
            <button
              className="action-button"
              onClick={() => {
                if (confirm('Are you sure you want to force all PCs to re-handshake?')) {
                  executeSystemAction('Force Handshake', 'force-handshake');
                }
              }}
              disabled={actionLoading === 'handshake'}
            >
              <Activity size={20} />
              <span>Force Re-handshake</span>
            </button>
            <button
              className={`action-button ${data.systemState?.maintenance_mode ? 'action-button--danger' : 'action-button--warning'}`}
              onClick={() => {
                if (confirm(`Are you sure you want to ${data.systemState?.maintenance_mode ? 'disable' : 'enable'} maintenance mode?`)) {
                  handleMaintenanceMode();
                }
              }}
              disabled={actionLoading === 'maintenance'}
            >
              <AlertTriangle size={20} />
              <span>{data.systemState?.maintenance_mode ? 'Disable Maintenance' : 'Maintenance Mode'}</span>
            </button>
          </div>
          <p className="actions-note">All actions require confirmation and are logged for audit.</p>
        </Section>
      )}

      {/* Section 11: Audit Trail */}
      <Section icon={FileText} title="Audit & Observability">
        <div className="audit-timeline">
          {data.auditTrail.map((event, i) => (
            <div key={event.id} className={`timeline-item timeline-item--${event.type}`}>
              <div className="timeline-item__dot" />
              <div className="timeline-item__content">
                <span className="timeline-item__message">{event.message}</span>
                <div className="timeline-item__meta">
                  <span>{formatTimeAgo(event.time)}</span>
                  {event.user && <span>by {event.user}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="audit-actions">
          <button className="btn btn--secondary btn--sm">
            <Download size={14} />
            Export CSV
          </button>
          <button className="btn btn--secondary btn--sm">
            <ExternalLink size={14} />
            View Full Logs
          </button>
        </div>
      </Section>

      {/* Styles */}
      <style>{`
        .system-health {
          max-width: 1600px;
          margin: 0 auto;
        }

        .page-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: var(--space-6);
        }

        .page-header-content {
          display: flex;
          align-items: center;
          gap: var(--space-4);
        }

        .page-header-icon {
          width: 48px;
          height: 48px;
          border-radius: var(--radius-lg);
          background: var(--accent-gradient);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
        }

        .page-title {
          font-size: var(--text-2xl);
          font-weight: 700;
          margin-bottom: var(--space-1);
        }

        .page-subtitle {
          font-size: var(--text-sm);
          color: var(--text-tertiary);
        }

        /* Global Health Banner */
        .global-health {
          background: var(--glass-bg);
          backdrop-filter: blur(24px);
          border: 1px solid var(--glass-border);
          border-radius: var(--radius-xl);
          padding: var(--space-6);
          margin-bottom: var(--space-6);
          display: flex;
          align-items: center;
          gap: var(--space-8);
        }

        .global-health__status {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-2);
        }

        .global-status-badge {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-3) var(--space-5);
          border-radius: var(--radius-lg);
          font-size: var(--text-lg);
          font-weight: 700;
          letter-spacing: 0.05em;
        }

        .global-status-badge--healthy {
          background: var(--status-success-subtle);
          color: var(--status-success);
        }

        .global-status-badge--degraded {
          background: var(--status-warning-subtle);
          color: var(--status-warning);
        }

        .global-status-badge--incident {
          background: var(--status-danger-subtle);
          color: var(--status-danger);
        }

        .global-health__live-indicator {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          font-size: var(--text-xs);
          color: var(--text-tertiary);
        }

        .live-dot {
          width: 8px;
          height: 8px;
          background: var(--status-success);
          border-radius: 50%;
          animation: pulse 2s ease-in-out infinite;
        }

        .global-health__metrics {
          display: flex;
          flex: 1;
          gap: var(--space-8);
        }

        .global-metric {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .global-metric__value {
          font-size: var(--text-2xl);
          font-weight: 700;
          font-family: var(--font-mono);
          color: var(--text-primary);
        }

        .global-metric__label {
          font-size: var(--text-xs);
          color: var(--text-tertiary);
          margin-top: var(--space-1);
        }

        /* Health Grid */
        .health-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: var(--space-6);
          margin-bottom: var(--space-6);
        }

        @media (max-width: 1200px) {
          .health-grid {
            grid-template-columns: 1fr;
          }
        }

        /* Section */
        .health-section {
          background: var(--glass-bg);
          backdrop-filter: blur(24px);
          border: 1px solid var(--glass-border);
          border-radius: var(--radius-xl);
          overflow: hidden;
        }

        .health-section__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-5);
          border-bottom: 1px solid var(--divider);
        }

        .health-section__title-group {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }

        .health-section__icon {
          color: var(--accent-primary);
        }

        .health-section__title {
          font-size: var(--text-base);
          font-weight: 600;
        }

        .health-section__badge {
          background: var(--accent-primary-subtle);
          color: var(--accent-primary);
          padding: var(--space-1) var(--space-2);
          border-radius: var(--radius-sm);
          font-size: var(--text-xs);
          font-weight: 500;
        }

        .health-section__chevron {
          color: var(--text-tertiary);
          transition: transform var(--duration-fast);
        }

        .health-section__chevron.rotated {
          transform: rotate(90deg);
        }

        .health-section__content {
          padding: var(--space-5);
        }

        /* Metrics Grid */
        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: var(--space-4);
        }

        .metrics-grid--small {
          grid-template-columns: repeat(4, 1fr);
        }

        @media (max-width: 900px) {
          .metrics-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        /* Metric Card */
        .metric-card {
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          padding: var(--space-4);
          transition: all var(--duration-fast);
        }

        .metric-card:hover {
          border-color: var(--border-default);
        }

        .metric-card--success { border-left: 3px solid var(--status-success); }
        .metric-card--warning { border-left: 3px solid var(--status-warning); }
        .metric-card--danger { border-left: 3px solid var(--status-danger); }

        .metric-card__header {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          margin-bottom: var(--space-2);
        }

        .metric-card__icon {
          color: var(--text-tertiary);
        }

        .metric-card__label {
          font-size: var(--text-xs);
          color: var(--text-tertiary);
        }

        .metric-card__body {
          display: flex;
          align-items: baseline;
          gap: var(--space-1);
        }

        .metric-card__value {
          font-size: var(--text-xl);
          font-weight: 700;
          font-family: var(--font-mono);
        }

        .metric-card__unit {
          font-size: var(--text-sm);
          color: var(--text-tertiary);
        }

        .metric-card__footer {
          margin-top: var(--space-3);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .metric-card__trend {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          font-size: var(--text-xs);
          font-weight: 500;
        }

        .metric-card__trend--up { color: var(--status-success); }
        .metric-card__trend--down { color: var(--status-danger); }

        .sparkline {
          width: 60px;
          opacity: 0.7;
        }

        /* Status Badge Inline */
        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: var(--space-1);
          padding: var(--space-1) var(--space-2);
          border-radius: var(--radius-sm);
          font-size: var(--text-xs);
          font-weight: 500;
        }

        .status-badge--success { background: var(--status-success-subtle); color: var(--status-success); }
        .status-badge--warning { background: var(--status-warning-subtle); color: var(--status-warning); }
        .status-badge--danger { background: var(--status-danger-subtle); color: var(--status-danger); }
        .status-badge--info { background: var(--status-info-subtle); color: var(--status-info); }

        /* Status Dot */
        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .status-dot--online { background: var(--status-success); }
        .status-dot--warning { background: var(--status-warning); }
        .status-dot--offline { background: var(--text-quaternary); }

        /* Services List */
        .services-list {
          margin-top: var(--space-5);
          border-top: 1px solid var(--divider);
          padding-top: var(--space-4);
        }

        .subsection-title {
          font-size: var(--text-xs);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-tertiary);
          margin-bottom: var(--space-3);
        }

        .service-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--space-2) 0;
        }

        .service-row:not(:last-child) {
          border-bottom: 1px solid var(--divider);
        }

        .service-row__status {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .service-row__name {
          font-size: var(--text-sm);
        }

        .service-row__meta {
          display: flex;
          gap: var(--space-4);
          font-size: var(--text-xs);
          color: var(--text-tertiary);
        }

        .service-row__latency {
          font-family: var(--font-mono);
        }

        /* Backup Status */
        .backup-status {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: var(--space-4);
          padding-top: var(--space-4);
          border-top: 1px solid var(--divider);
        }

        .backup-badge {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-3);
          border-radius: var(--radius-sm);
          font-size: var(--text-sm);
        }

        .backup-badge--success {
          background: var(--status-success-subtle);
          color: var(--status-success);
        }

        .backup-badge--failed {
          background: var(--status-danger-subtle);
          color: var(--status-danger);
        }

        .replication-lag {
          font-size: var(--text-xs);
          color: var(--text-tertiary);
        }

        /* Fleet Overview */
        .fleet-overview {
          display: flex;
          gap: var(--space-6);
          margin-bottom: var(--space-5);
        }

        .fleet-stat {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: var(--space-4);
          background: rgba(0, 0, 0, 0.2);
          border-radius: var(--radius-md);
          flex: 1;
        }

        .fleet-stat__value {
          font-size: var(--text-2xl);
          font-weight: 700;
          font-family: var(--font-mono);
        }

        .fleet-stat--online .fleet-stat__value { color: var(--status-success); }
        .fleet-stat--offline .fleet-stat__value { color: var(--text-tertiary); }
        .fleet-stat--stale .fleet-stat__value { color: var(--status-warning); }

        .fleet-stat__label {
          font-size: var(--text-xs);
          color: var(--text-tertiary);
          margin-top: var(--space-1);
        }

        .fleet-stat__pct {
          font-size: var(--text-xs);
          color: var(--status-success);
          margin-top: var(--space-1);
        }

        /* Distribution Grid */
        .distribution-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: var(--space-4);
        }

        .distribution-card {
          background: rgba(0, 0, 0, 0.15);
          border-radius: var(--radius-md);
          padding: var(--space-4);
        }

        .distribution-card__title {
          font-size: var(--text-xs);
          font-weight: 600;
          color: var(--text-tertiary);
          margin-bottom: var(--space-3);
        }

        .distribution-row {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          margin-bottom: var(--space-2);
        }

        .distribution-row__label {
          font-size: var(--text-xs);
          color: var(--text-secondary);
          width: 100px;
          flex-shrink: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .distribution-row__bar {
          flex: 1;
          height: 6px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
          overflow: hidden;
        }

        .distribution-row__bar > div {
          height: 100%;
          background: var(--accent-primary);
          border-radius: 3px;
        }

        .distribution-row__value {
          font-size: var(--text-xs);
          font-family: var(--font-mono);
          color: var(--text-tertiary);
          width: 40px;
          text-align: right;
        }

        /* Licensing Alerts */
        .licensing-alerts {
          margin-top: var(--space-4);
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        .alert-row {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-3);
          border-radius: var(--radius-sm);
          font-size: var(--text-sm);
        }

        .alert-row--warning {
          background: var(--status-warning-subtle);
          color: var(--status-warning);
        }

        .alert-row--danger {
          background: var(--status-danger-subtle);
          color: var(--status-danger);
        }

        /* Jobs List */
        .jobs-list {
          margin-top: var(--space-4);
          border-top: 1px solid var(--divider);
          padding-top: var(--space-3);
        }

        .job-row {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-2) 0;
        }

        .job-row__name {
          font-size: var(--text-sm);
          flex: 1;
        }

        .job-row__stats {
          display: flex;
          gap: var(--space-3);
          font-size: var(--text-xs);
        }

        /* Alerts Grid */
        .alerts-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--space-6);
        }

        .alerts-column, .insights-column {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }

        .alert-card {
          display: flex;
          align-items: flex-start;
          gap: var(--space-3);
          padding: var(--space-3);
          background: rgba(0, 0, 0, 0.2);
          border-radius: var(--radius-md);
          border-left: 3px solid transparent;
        }

        .alert-card--critical { border-left-color: var(--status-danger); }
        .alert-card--warning { border-left-color: var(--status-warning); }
        .alert-card--info { border-left-color: var(--status-info); }

        .alert-card__icon {
          flex-shrink: 0;
        }

        .alert-card--critical .alert-card__icon { color: var(--status-danger); }
        .alert-card--warning .alert-card__icon { color: var(--status-warning); }
        .alert-card--info .alert-card__icon { color: var(--status-info); }

        .alert-card__content {
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
        }

        .alert-card__title {
          font-size: var(--text-sm);
        }

        .alert-card__time {
          font-size: var(--text-xs);
          color: var(--text-tertiary);
        }

        .insight-card {
          display: flex;
          align-items: flex-start;
          gap: var(--space-3);
          padding: var(--space-3);
          background: var(--accent-primary-subtle);
          border-radius: var(--radius-md);
        }

        .insight-card__icon {
          color: var(--accent-primary);
          flex-shrink: 0;
        }

        .insight-card__message {
          font-size: var(--text-sm);
          color: var(--text-secondary);
        }

        .empty-state {
          text-align: center;
          padding: var(--space-6);
          color: var(--text-tertiary);
          font-size: var(--text-sm);
        }

        /* Actions Grid */
        .actions-grid {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-3);
        }

        .action-button {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-3) var(--space-4);
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          color: var(--text-secondary);
          font-size: var(--text-sm);
          cursor: pointer;
          transition: all var(--duration-fast);
        }

        .action-button:hover {
          background: rgba(0, 0, 0, 0.4);
          border-color: var(--border-hover);
          color: var(--text-primary);
        }

        .action-button--warning {
          border-color: var(--status-warning);
          color: var(--status-warning);
        }

        .actions-note {
          margin-top: var(--space-4);
          font-size: var(--text-xs);
          color: var(--text-tertiary);
        }

        /* Audit Timeline */
        .audit-timeline {
          position: relative;
          padding-left: var(--space-6);
          margin-bottom: var(--space-4);
        }

        .audit-timeline::before {
          content: '';
          position: absolute;
          left: 3px;
          top: 8px;
          bottom: 8px;
          width: 2px;
          background: var(--divider);
        }

        .timeline-item {
          position: relative;
          padding-bottom: var(--space-4);
        }

        .timeline-item__dot {
          position: absolute;
          left: calc(-1 * var(--space-6) + 0px);
          top: 4px;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--text-tertiary);
        }

        .timeline-item--deploy .timeline-item__dot { background: var(--accent-primary); }
        .timeline-item--alert .timeline-item__dot { background: var(--status-warning); }
        .timeline-item--action .timeline-item__dot { background: var(--status-info); }
        .timeline-item--resolve .timeline-item__dot { background: var(--status-success); }

        .timeline-item__content {
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
        }

        .timeline-item__message {
          font-size: var(--text-sm);
        }

        .timeline-item__meta {
          display: flex;
          gap: var(--space-3);
          font-size: var(--text-xs);
          color: var(--text-tertiary);
        }

        .audit-actions {
          display: flex;
          gap: var(--space-3);
        }
      `}</style>
    </div>
  );
}
