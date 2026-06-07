import { useState, useEffect } from 'react';
import { Sliders, Save, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

const Settings = () => {
  const [configs, setConfigs] = useState<{ [key: string]: any }>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    try {
      const { data, error } = await supabase.from('configurations').select('*');
      if (error) throw error;

      const configMap: { [key: string]: any } = {};
      if (data) {
        data.forEach(item => {
          configMap[item.key] = item.value_type === 'number' ? Number(item.value) : item.value;
        });
      }

      // Defaults if not in DB yet
      if (configMap['auth_similarity_threshold'] === undefined) configMap['auth_similarity_threshold'] = 95;
      if (configMap['max_offline_window_hours'] === undefined) configMap['max_offline_window_hours'] = 24;

      setConfigs(configMap);
    } catch (err: any) {
      setError('Failed to load configurations.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccessMsg('');
    try {
      const updates = Object.keys(configs).map(key => ({
        key,
        value: configs[key].toString(),
        value_type: typeof configs[key],
        updated_at: Math.floor(Date.now() / 1000)
      }));

      // Upsert configurations
      const { error } = await supabase.from('configurations').upsert(updates, { onConflict: 'key' });
      if (error) throw error;

      setSuccessMsg('Settings saved successfully.');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setError('Failed to save settings: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (key: string, value: any) => {
    setConfigs(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', maxWidth: '800px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem' }}>System Configuration</h1>
          <p>Global parameters that dynamically affect the mobile app behavior.</p>
        </div>
        <button onClick={handleSave} disabled={saving || loading} className="btn btn-primary">
          <Save size={18} style={{ marginRight: '8px' }} />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: 'var(--color-error)', padding: '12px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {successMsg && (
        <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: 'var(--color-success)', padding: '12px 16px', borderRadius: '8px' }}>
          {successMsg}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-muted)' }}>Loading configurations...</div>
      ) : (
        <div className="surface" style={{ padding: '32px' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
            <Sliders size={20} /> Biometric Settings
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px' }}>Similarity Threshold</label>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', marginBottom: '12px' }}>
                Minimum confidence score required for successful face matching.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <input
                  type="range"
                  min="80"
                  max="100"
                  value={configs['auth_similarity_threshold'] || 95}
                  onChange={(e) => handleChange('auth_similarity_threshold', Number(e.target.value))}
                  style={{ flex: 1, accentColor: 'var(--color-yellow)' }}
                />
                <span style={{ fontWeight: 600, fontFamily: 'var(--mono)' }}>{(configs['auth_similarity_threshold'] || 95).toFixed(1)}%</span>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--color-hairline)', paddingTop: '24px' }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px' }}>Maximum Offline Window (Hours)</label>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', marginBottom: '12px' }}>
                How long a device can operate offline before forcing a mandatory sync.
              </p>
              <input
                type="number"
                value={configs['max_offline_window_hours'] || 24}
                onChange={(e) => handleChange('max_offline_window_hours', Number(e.target.value))}
                style={{ padding: '10px 16px', borderRadius: 'var(--r-8)', border: '1px solid var(--color-divider)', width: '120px' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
