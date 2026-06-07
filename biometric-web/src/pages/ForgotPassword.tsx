import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Shield, Mail, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send reset link.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg)', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div className="surface" style={{ width: '100%', maxWidth: '420px', padding: '40px', borderRadius: '16px', boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}>
        
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '32px' }}>
          <div style={{ background: 'var(--color-primary-light)', padding: '16px', borderRadius: '50%', marginBottom: '16px', color: 'var(--color-primary)' }}>
            <Shield size={40} />
          </div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-ink)' }}>Password Recovery</h1>
          <p style={{ color: 'var(--color-muted)', marginTop: '8px', textAlign: 'center' }}>Enter your email to receive a reset link.</p>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: 'var(--color-error)', padding: '12px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', fontSize: '0.875rem' }}>
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        {success ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center' }}>
            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: 'var(--color-success)', padding: '16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.95rem', width: '100%' }}>
              <CheckCircle size={24} />
              <div>
                <strong>Link Sent!</strong>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem' }}>Check your inbox for further instructions.</p>
              </div>
            </div>
            <Link to="/login" className="btn btn-primary" style={{ width: '100%', padding: '14px', fontSize: '1rem', justifyContent: 'center', textDecoration: 'none' }}>
              Return to Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleReset} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '8px', color: 'var(--color-ink)' }}>Email Address</label>
              <div style={{ position: 'relative' }}>
                <Mail size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@company.com"
                  required
                  style={{ width: '100%', padding: '12px 12px 12px 42px', borderRadius: '8px', border: '1px solid var(--color-divider)', fontSize: '1rem', outline: 'none', transition: 'border-color 0.2s' }} 
                />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="btn btn-primary" 
              style={{ width: '100%', padding: '14px', fontSize: '1rem', marginTop: '8px', justifyContent: 'center' }}
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>

            <div style={{ textAlign: 'center', marginTop: '8px' }}>
              <Link to="/login" style={{ fontSize: '0.875rem', color: 'var(--color-muted)', textDecoration: 'none', fontWeight: 500 }}>
                &larr; Back to Login
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;
