import { useState, useEffect } from 'react';
import { Activity, Users as UsersIcon, Smartphone, ShieldAlert } from 'lucide-react';
import { supabase } from '../lib/supabase';

const Dashboard = () => {
  const [stats, setStats] = useState({ checkins: 0, users: 0, devices: 0, alerts: 0 });
  const [liveLogs, setLiveLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();

    // Setup realtime subscription
    const subscription = supabase
      .channel('attendance_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'attendance' }, () => {
        fetchDashboardData(); // Refresh on new attendance
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [checkinsRes, usersRes, devicesRes, alertsRes, logsRes] = await Promise.all([
        supabase.from('attendance').select('*', { count: 'exact', head: true }),
        supabase.from('users').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('device_bindings').select('*', { count: 'exact', head: true }).eq('is_active', 1),
        supabase.from('audit_logs').select('*', { count: 'exact', head: true }).eq('outcome', 'failure'),
        supabase.from('attendance').select('id, timestamp, similarity_score, device_id, sync_status, users(full_name)').order('timestamp', { ascending: false }).limit(5)
      ]);

      setStats({
        checkins: checkinsRes.count || 0,
        users: usersRes.count || 0,
        devices: devicesRes.count || 0,
        alerts: alertsRes.count || 0
      });

      if (logsRes.data) {
        setLiveLogs(logsRes.data.map((log: any) => {
          // Supabase sometimes returns joined relations as arrays depending on FK inference
          const userData = Array.isArray(log.users) ? log.users[0] : log.users;
          return {
            id: log.id,
            user: userData?.full_name || 'Unknown',
            time: new Date(log.timestamp * 1000).toLocaleTimeString(),
            score: `${(log.similarity_score * 100).toFixed(1)}%`,
            status: log.similarity_score > 0.8 ? 'success' : 'error',
            device: log.device_id.substring(0, 8)
          };
        }));
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem' }}>Live Operations Feed</h1>
          <p>Real-time biometric attendance and security monitoring.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-success)', fontSize: '0.875rem', fontWeight: 500 }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-success)', display: 'inline-block' }}></span>
          System Online & Syncing
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-muted)' }}>Loading live data...</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px' }}>
            <div className="surface stat-card hover-lift">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--color-success)' }}>
                <Activity size={20} />
                <span className="stat-label">Total Check-ins</span>
              </div>
              <span className="stat-value">{stats.checkins}</span>
            </div>
            <div className="surface stat-card hover-lift">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--color-yellow-dark)' }}>
                <UsersIcon size={20} />
                <span className="stat-label">Active Users</span>
              </div>
              <span className="stat-value">{stats.users}</span>
            </div>
            <div className="surface stat-card hover-lift">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--color-ink)' }}>
                <Smartphone size={20} />
                <span className="stat-label">Online Devices</span>
              </div>
              <span className="stat-value">{stats.devices}</span>
            </div>
            <div className="surface stat-card hover-lift">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--color-error)' }}>
                <ShieldAlert size={20} />
                <span className="stat-label">Security Flags</span>
              </div>
              <span className="stat-value">{stats.alerts}</span>
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ marginBottom: '20px' }}>Recent Check-ins</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Time</th>
                  <th>Similarity Score</th>
                  <th>Device ID</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {liveLogs.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-muted)', padding: '20px' }}>No check-ins today.</td></tr>
                ) : liveLogs.map(log => (
                  <tr key={log.id}>
                    <td style={{ fontWeight: 500 }}>{log.user}</td>
                    <td style={{ color: 'var(--color-muted)' }}>{log.time}</td>
                    <td>{log.score}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: '0.875rem' }}>{log.device}</td>
                    <td>
                      <span className={`badge ${log.status === 'success' ? 'badge-success' : 'badge-error'}`}>
                        {log.status === 'success' ? 'Verified' : 'Failed'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
