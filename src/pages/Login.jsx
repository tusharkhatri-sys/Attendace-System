import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound, Mail, Lock, UserCheck, Shield } from 'lucide-react';

export default function Login({ setAttendantSession }) {
  const [loginType, setLoginType] = useState('attendant');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [attendantId, setAttendantId] = useState('');
  
  const navigate = useNavigate();

  const handleOrgLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    else navigate('/org-dashboard');
    setLoading(false);
  };

  const handleAttendantLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    if (attendantId.length !== 6) {
      setError("Access ID must be exactly 6 characters.");
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('attendants').select('*')
        .eq('unique_id', attendantId.toUpperCase()).single();
        
      if (error || !data) {
        setError("Invalid Access ID. Please check and try again.");
      } else {
        const sessionData = { 
          role: 'attendant', id: data.id, unique_id: data.unique_id,
          org_id: data.org_id, name: data.name || 'Attendant',
          trade: data.trade || 'General'
        };
        localStorage.setItem('attendant_session', JSON.stringify(sessionData));
        setAttendantSession(sessionData);
        navigate('/attendant-dashboard');
      }
    } catch (err) {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card glass-panel">
        <div className="auth-header">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
            <div className="govt-badge" style={{ width: '56px', height: '56px' }}>
              <Shield size={28} />
            </div>
          </div>
          <h1>Dost Attend</h1>
          <p>Biometric Attendance System</p>
        </div>

        <div className="tabs">
          <div className={`tab ${loginType === 'attendant' ? 'active' : ''}`}
            onClick={() => { setLoginType('attendant'); setError(null); }}>
            Attendant
          </div>
          <div className={`tab ${loginType === 'organization' ? 'active' : ''}`}
            onClick={() => { setLoginType('organization'); setError(null); }}>
            Organization
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}

        {loginType === 'organization' ? (
          <form onSubmit={handleOrgLogin}>
            <div className="form-group">
              <label>Email Address</label>
              <div style={{ position: 'relative' }}>
                <Mail size={18} style={{ position: 'absolute', top: '13px', left: '12px', color: 'var(--text-light)' }} />
                <input type="email" className="form-input" style={{ paddingLeft: '2.5rem' }}
                  placeholder="admin@organization.gov"
                  value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
            </div>
            <div className="form-group">
              <label>Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} style={{ position: 'absolute', top: '13px', left: '12px', color: 'var(--text-light)' }} />
                <input type="password" className="form-input" style={{ paddingLeft: '2.5rem' }}
                  placeholder="••••••••"
                  value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Signing in...' : 'Organization Login'}
            </button>
            <div className="auth-footer">
              <p>Don't have an account? <Link to="/register">Register</Link></p>
            </div>
          </form>
        ) : (
          <form onSubmit={handleAttendantLogin}>
            <div className="form-group">
              <label>6-Digit Access ID</label>
              <div style={{ position: 'relative' }}>
                <KeyRound size={18} style={{ position: 'absolute', top: '13px', left: '12px', color: 'var(--text-light)' }} />
                <input type="text" className="form-input" 
                  style={{ paddingLeft: '2.5rem', textTransform: 'uppercase', letterSpacing: '4px', fontWeight: '700', fontSize: '1.2rem', textAlign: 'center' }}
                  placeholder="A1B2C3" maxLength={6}
                  value={attendantId} onChange={(e) => setAttendantId(e.target.value)} required />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              <UserCheck size={20} />
              {loading ? 'Verifying...' : 'Access Portal'}
            </button>
            <div className="divider">Info</div>
            <p style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
              Contact your organization admin to get your 6-digit access ID. No registration needed.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
