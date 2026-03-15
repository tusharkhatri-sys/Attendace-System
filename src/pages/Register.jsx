import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, Building2, Shield } from 'lucide-react';

export default function Register() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [sessionStart, setSessionStart] = useState('January');
  const [sessionEnd, setSessionEnd] = useState('December');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (password !== confirmPassword) { setError("Passwords do not match."); setLoading(false); return; }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email, password, options: { 
        data: { 
          org_name: orgName, 
          session_start: sessionStart,
          session_end: sessionEnd
        } 
      }
    });
    
    if (signUpError) { setError(signUpError.message); setLoading(false); return; }
    if (data.session) navigate('/org-dashboard');
    else setSuccess("Account created! Check your email to verify, or login if auto-verification is enabled.");
    setLoading(false);
  };

  return (
    <div className="auth-container">
      <div className="auth-card glass-panel" style={{ maxWidth: '520px' }}>
        <div className="auth-header">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
            <div className="govt-badge" style={{ width: '56px', height: '56px' }}>
              <Shield size={28} />
            </div>
          </div>
          <h1>Register Organization</h1>
          <p>Set up biometric attendance for your organization</p>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && (
          <div className="success-message">
            {success}
            <div style={{ marginTop: '0.5rem' }}><Link to="/login" style={{ color: 'var(--primary)', fontWeight: 'bold' }}>Go to Login →</Link></div>
          </div>
        )}

        {!success && (
          <form onSubmit={handleRegister}>
            <div className="form-group">
              <label>Organization Name</label>
              <div style={{ position: 'relative' }}>
                <Building2 size={18} style={{ position: 'absolute', top: '13px', left: '12px', color: 'var(--text-light)' }} />
                <input type="text" className="form-input" style={{ paddingLeft: '2.5rem' }}
                  placeholder="e.g. District Education Office"
                  value={orgName} onChange={(e) => setOrgName(e.target.value)} required />
              </div>
            </div>
            <div className="form-group">
              <label>Academic Session / Working Period</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Start Month</label>
                  <select className="form-input" value={sessionStart} onChange={(e) => setSessionStart(e.target.value)}>
                    {['January','February','March','April','May','June','July','August','September','October','November','December'].map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>End Month</label>
                  <select className="form-input" value={sessionEnd} onChange={(e) => setSessionEnd(e.target.value)}>
                    {['January','February','March','April','May','June','July','August','September','October','November','December'].map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="form-group">
              <label>Email</label>
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
                  placeholder="Min 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              </div>
            </div>
            <div className="form-group">
              <label>Confirm Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} style={{ position: 'absolute', top: '13px', left: '12px', color: 'var(--text-light)' }} />
                <input type="password" className="form-input" style={{ paddingLeft: '2.5rem' }}
                  placeholder="Repeat password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: '0.5rem' }}>
              {loading ? 'Creating...' : 'Register Organization'}
            </button>
            <div className="auth-footer"><p>Already registered? <Link to="/login">Login</Link></p></div>
          </form>
        )}
      </div>
    </div>
  );
}
