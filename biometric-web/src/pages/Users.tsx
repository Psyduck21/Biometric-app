import { useState, useEffect } from 'react';
import { UserCheck, Search, RefreshCw, Ban, Lock, Unlock, Key, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

const Users = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [otpModal, setOtpModal] = useState<{ isOpen: boolean, code: string, user: string }>({ isOpen: false, code: '', user: '' });

  useEffect(() => {
    fetchUsers();

    const channel = supabase
      .channel('users_table_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => {
        fetchUsers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('users').select('*').order('updated_at', { ascending: false });
      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleResetBiometrics = async (userId: string) => {
    if (!window.confirm('Are you sure you want to HARD RESET biometrics for this user? They will need to re-enroll.')) return;
    try {
      const { error } = await supabase.rpc('admin_hard_reset_user', { p_user_id: userId });
      if (error) throw error;
      alert('Biometrics reset successfully.');
      fetchUsers();
    } catch (error: any) {
      alert(`Failed to reset: ${error.message}`);
    }
  };

  const handleToggleStatus = async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      const { error } = await supabase.rpc('admin_toggle_user_status', { p_user_id: userId, p_status: newStatus });
      if (error) throw error;
      fetchUsers();
    } catch (error: any) {
      alert(`Failed to update status: ${error.message}`);
    }
  };

  const handleResetLockout = async (userId: string) => {
    try {
      const { error } = await supabase.rpc('admin_reset_lockout', { p_user_id: userId });
      if (error) throw error;
      alert('Account unlocked successfully.');
      fetchUsers();
    } catch (error: any) {
      alert(`Failed to unlock: ${error.message}`);
    }
  };

  const handleGenerateOTP = async (userId: string, userName: string) => {
    try {
      const { data, error } = await supabase.rpc('admin_generate_recovery_otp', { p_user_id: userId });
      if (error) throw error;
      
      if (!data.success) {
        alert(data.error);
        return;
      }
      
      setOtpModal({ isOpen: true, code: data.data.otp_code, user: userName });
      fetchUsers();
    } catch (error: any) {
      alert(`Failed to generate OTP: ${error.message}`);
    }
  };

  const filteredUsers = users.filter(u =>
    u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.employee_id?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem' }}>User & Identity Management</h1>
          <p>Manage employee roster and biometric enrollment status.</p>
        </div>
        <button className="btn btn-primary">Add New Employee</button>
      </div>

      <div className="surface" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div style={{ position: 'relative', width: '300px' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
            <input
              type="text"
              placeholder="Search employees..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ width: '100%', padding: '10px 10px 10px 36px', borderRadius: 'var(--r-8)', border: '1px solid var(--color-divider)', fontSize: '0.875rem' }}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-muted)' }}>Loading users...</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee ID</th>
                <th>Name</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: '20px', color: 'var(--color-muted)' }}>No users found.</td></tr>
              ) : filteredUsers.map(user => (
                <tr key={user.id} style={{ opacity: user.status === 'suspended' ? 0.6 : 1 }}>
                  <td style={{ color: 'var(--color-muted)', fontFamily: 'var(--mono)' }}>{user.employee_id}</td>
                  <td style={{ fontWeight: 500 }}>{user.full_name}</td>
                  <td>
                    {user.failed_attempts >= 5 ? (
                      <span className="badge badge-error"><Lock size={14} /> Locked Out</span>
                    ) : user.status === 'active' ? (
                      <span className="badge badge-success"><UserCheck size={14} /> Active</span>
                    ) : (
                      <span className="badge badge-error"><Ban size={14} /> {user.status}</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {user.failed_attempts >= 5 ? (
                        <button onClick={() => handleResetLockout(user.id)} className="btn btn-outline" style={{ padding: '4px 8px', color: 'var(--color-primary)', borderColor: 'var(--color-primary-light)' }}>
                          <Unlock size={14} style={{ marginRight: '4px' }} /> Unlock
                        </button>
                      ) : (
                        <button onClick={() => handleToggleStatus(user.id, user.status)} className="btn btn-outline" style={{ padding: '4px 8px' }}>
                          {user.status === 'active' ? 'Suspend' : 'Activate'}
                        </button>
                      )}
                      
                      <button onClick={() => handleGenerateOTP(user.id, user.full_name)} className="btn btn-outline" style={{ padding: '4px 8px' }}>
                        <Key size={14} style={{ marginRight: '4px' }} /> OTP
                      </button>

                      <button onClick={() => handleResetBiometrics(user.id)} className="btn btn-outline" style={{ padding: '4px 8px', color: 'var(--color-error)', borderColor: '#fecaca' }}>
                        <RefreshCw size={14} style={{ marginRight: '4px' }} /> Hard Reset
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* OTP Modal */}
      {otpModal.isOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="surface" style={{ padding: '32px', width: '100%', maxWidth: '400px', borderRadius: '16px', position: 'relative' }}>
            <button onClick={() => setOtpModal({ isOpen: false, code: '', user: '' })} style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}>
              <X size={24} />
            </button>
            <h2 style={{ marginTop: 0, marginBottom: '8px' }}>Recovery OTP</h2>
            <p style={{ color: 'var(--color-muted)', marginBottom: '24px' }}>Provide this 6-digit code to <strong>{otpModal.user}</strong>. It will expire in 15 minutes.</p>
            
            <div style={{ background: 'var(--color-bg)', padding: '24px', borderRadius: '12px', textAlign: 'center', border: '1px solid var(--color-divider)' }}>
              <span style={{ fontSize: '2.5rem', fontWeight: 700, letterSpacing: '8px', fontFamily: 'var(--mono)', color: 'var(--color-ink)' }}>
                {otpModal.code}
              </span>
            </div>
            
            <button onClick={() => setOtpModal({ isOpen: false, code: '', user: '' })} className="btn btn-primary" style={{ width: '100%', marginTop: '24px', justifyContent: 'center' }}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;
