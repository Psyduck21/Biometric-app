import { useState, useEffect } from 'react';
import { Smartphone, Unlock, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';

const Security = () => {
  const [devices, setDevices] = useState<any[]>([]);
  const [threats, setThreats] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSecurityData();

    const channel = supabase
      .channel('security_table_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'device_bindings' }, () => {
        fetchSecurityData();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_logs' }, () => {
        fetchSecurityData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchSecurityData = async () => {
    setLoading(true);
    try {
      const [devRes, logsRes] = await Promise.all([
        supabase.from('device_bindings').select('*, users(full_name, employee_id)').eq('is_active', true),
        supabase.from('audit_logs').select('*').order('timestamp', { ascending: false }).limit(20)
      ]);

      if (devRes.data) setDevices(devRes.data);
      if (logsRes.data) {
        setLogs(logsRes.data);
        setThreats(logsRes.data.filter(log => log.outcome === 'failure'));
      }
    } catch (error) {
      console.error('Error fetching security data', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeDevice = async (deviceId: string) => {
    if (!window.confirm('Are you sure you want to revoke this device? The user will need to re-bind a device to clock in.')) return;
    try {
      const { error } = await supabase.rpc('admin_revoke_device', { p_device_id: deviceId });
      if (error) throw error;
      alert('Device revoked successfully.');
      fetchSecurityData();
    } catch (error: any) {
      alert(`Failed to revoke: ${error.message}`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem' }}>Security & Hardware</h1>
          <p>Monitor device tethering and revoke compromised hardware.</p>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-muted)' }}>Loading security operations...</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <div className="surface" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <AlertTriangle size={24} color="var(--color-error)" />
                <h3 style={{ margin: 0 }}>Active Threats</h3>
              </div>
              <p style={{ color: 'var(--color-muted)', marginBottom: '16px' }}>Devices flagged for suspicious activity (Time tampering, Rooted, etc.)</p>
              
              {threats.length === 0 ? (
                <p style={{ color: 'var(--color-success)', fontWeight: 500 }}>No active threats detected.</p>
              ) : threats.map(threat => (
                <div key={threat.id} style={{ padding: '16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--r-8)', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong style={{ color: 'var(--color-error)', display: 'block' }}>User ID: {threat.user_id?.substring(0, 8)}</strong>
                      <span style={{ fontSize: '0.875rem' }}>{threat.action} - {threat.failure_reason}</span>
                    </div>
                    <button onClick={() => handleRevokeDevice(threat.device_id)} className="btn btn-danger">Lock Device</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="surface" style={{ padding: '24px' }}>
              <h3 style={{ margin: 0, marginBottom: '16px' }}>Security Audit Log</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '300px', overflowY: 'auto' }}>
                {logs.length === 0 ? (
                  <p style={{ color: 'var(--color-muted)' }}>No logs available.</p>
                ) : logs.map(log => (
                  <div key={log.id} style={{ fontSize: '0.875rem', paddingBottom: '12px', borderBottom: '1px solid var(--color-hairline)' }}>
                    <span style={{ color: 'var(--color-muted)', display: 'block', marginBottom: '4px' }}>
                      {new Date(log.timestamp * 1000).toLocaleString()}
                    </span>
                    <span style={{ color: log.outcome === 'threat' ? 'var(--color-error)' : 'inherit' }}>
                      {log.action}: {log.outcome}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ marginBottom: '20px' }}>Tethered Devices</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Device Model</th>
                  <th>Hardware ID</th>
                  <th>Last Sync</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {devices.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '20px', color: 'var(--color-muted)' }}>No active devices found.</td></tr>
                ) : devices.map(dev => (
                  <tr key={dev.device_id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{dev.users?.full_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>{dev.users?.employee_id}</div>
                    </td>
                    <td><div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Smartphone size={16} /> {dev.device_model || 'Unknown Model'}</div></td>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--color-muted)' }}>{dev.device_id}</td>
                    <td>{new Date(dev.bound_at * 1000).toLocaleDateString()}</td>
                    <td>
                      <span className="badge badge-success">Active</span>
                    </td>
                    <td>
                      <button onClick={() => handleRevokeDevice(dev.device_id)} className="btn btn-outline" style={{ padding: '4px 8px', color: 'var(--color-error)', borderColor: '#fecaca' }}>
                        <Unlock size={16} style={{ marginRight: '4px' }} /> Revoke
                      </button>
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

export default Security;
