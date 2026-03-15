import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { LogOut, Users, UserPlus, Trash2, KeyRound, Loader2, Shield, ClipboardList, BarChart3, Download, Calendar, TrendingUp, UserCheck, ChevronLeft, ChevronRight } from 'lucide-react';

export default function OrgDashboard({ session }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [attendants, setAttendants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newAttendantName, setNewAttendantName] = useState('');
  const [error, setError] = useState(null);

  // Analytics
  const [totalStudents, setTotalStudents] = useState(0);
  const [todayPresent, setTodayPresent] = useState(0);
  const [monthlyPercent, setMonthlyPercent] = useState(0);
  const [recentActivity, setRecentActivity] = useState([]);

  // Reports
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportData, setReportData] = useState([]);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    fetchAttendants();
    fetchAnalytics();
  }, []);

  useEffect(() => {
    if (activeTab === 'reports') fetchReport();
  }, [activeTab, reportDate]);

  const fetchAttendants = async () => {
    try {
      const { data, error } = await supabase.from('attendants').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setAttendants(data || []);
    } catch (err) { setError('Failed to load attendants.'); }
    finally { setLoading(false); }
  };

  const fetchAnalytics = async () => {
    try {
      const orgId = session.user.id;

      // Total students
      const { count: studentCount } = await supabase
        .from('students').select('*', { count: 'exact', head: true }).eq('org_id', orgId);
      setTotalStudents(studentCount || 0);

      // Today's attendance
      const today = new Date().toISOString().split('T')[0];
      const { data: todayRecords } = await supabase
        .from('attendance_records').select('id, person_name, created_at')
        .eq('org_id', orgId)
        .gte('created_at', today + 'T00:00:00')
        .lte('created_at', today + 'T23:59:59');
      
      // Unique students today
      const uniqueToday = new Set((todayRecords || []).map(r => r.person_name));
      setTodayPresent(uniqueToday.size);

      // Monthly attendance %
      const monthStart = new Date();
      monthStart.setDate(1);
      const { data: monthRecords } = await supabase
        .from('attendance_records').select('person_name, created_at')
        .eq('org_id', orgId)
        .gte('created_at', monthStart.toISOString().split('T')[0] + 'T00:00:00');

      if (studentCount && studentCount > 0 && monthRecords) {
        // Calculate working days so far this month
        const now = new Date();
        let workingDays = 0;
        for (let d = new Date(monthStart); d <= now; d.setDate(d.getDate() + 1)) {
          const day = d.getDay();
          if (day !== 0 && day !== 6) workingDays++;
        }
        // Count unique student-day pairs
        const uniquePairs = new Set(monthRecords.map(r => {
          const date = r.created_at.split('T')[0];
          return `${r.person_name}_${date}`;
        }));
        const maxPossible = studentCount * Math.max(workingDays, 1);
        const pct = Math.round((uniquePairs.size / maxPossible) * 100);
        setMonthlyPercent(Math.min(pct, 100));
      }

      // Recent Activity (last 10)
      const { data: recent } = await supabase
        .from('attendance_records').select('person_name, created_at, status')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(10);
      setRecentActivity(recent || []);
    } catch (err) {
      console.error('Analytics error:', err);
    }
  };

  const fetchReport = async () => {
    setReportLoading(true);
    try {
      const orgId = session.user.id;

      // Get all students
      const { data: students } = await supabase
        .from('students').select('id, name, photo_url').eq('org_id', orgId);

      // Get attendance for selected date
      const { data: records } = await supabase
        .from('attendance_records').select('person_name, created_at')
        .eq('org_id', orgId)
        .gte('created_at', reportDate + 'T00:00:00')
        .lte('created_at', reportDate + 'T23:59:59');

      const presentNames = new Set((records || []).map(r => r.person_name));
      const timeMap = {};
      (records || []).forEach(r => {
        if (!timeMap[r.person_name]) {
          timeMap[r.person_name] = new Date(r.created_at).toLocaleTimeString();
        }
      });

      const report = (students || []).map(s => ({
        name: s.name,
        photo_url: s.photo_url,
        status: presentNames.has(s.name) ? 'Present' : 'Absent',
        time: timeMap[s.name] || '-'
      }));
      
      // Sort: Present first, then Absent
      report.sort((a, b) => a.status === 'Present' ? -1 : 1);
      setReportData(report);
    } catch (err) {
      console.error('Report error:', err);
    } finally {
      setReportLoading(false);
    }
  };

  const exportCSV = () => {
    if (reportData.length === 0) return;
    const headers = ['Name', 'Status', 'Time'];
    const rows = reportData.map(r => [r.name, r.status, r.time]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_${reportDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const navigateDate = (dir) => {
    const d = new Date(reportDate);
    d.setDate(d.getDate() + dir);
    setReportDate(d.toISOString().split('T')[0]);
  };

  const handleLogout = async () => { await supabase.auth.signOut(); navigate('/login'); };

  const generateUniqueId = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
  };

  const handleCreateAttendant = async (e) => {
    e.preventDefault();
    if (!newAttendantName.trim()) return;
    setCreating(true); setError(null);
    try {
      const { data, error } = await supabase.from('attendants')
        .insert([{ unique_id: generateUniqueId(), name: newAttendantName.trim(), org_id: session.user.id }]).select();
      if (error) throw error;
      setNewAttendantName('');
      setAttendants([data[0], ...attendants]);
    } catch (err) { setError('Failed to create attendant.'); }
    finally { setCreating(false); }
  };

  const handleDeleteAttendant = async (id) => {
    if (!window.confirm("Remove this attendant?")) return;
    try {
      const { error } = await supabase.from('attendants').delete().eq('id', id);
      if (error) throw error;
      setAttendants(attendants.filter(a => a.id !== id));
    } catch (err) { alert('Failed to delete.'); }
  };

  const presentCount = reportData.filter(r => r.status === 'Present').length;
  const absentCount = reportData.filter(r => r.status === 'Absent').length;

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div className="header-left">
          <div className="govt-badge"><Shield size={28} /></div>
          <div>
            <h1>Dost Attend</h1>
            <p>Organization Panel — {session?.user?.email}</p>
          </div>
        </div>
        <button className="btn-logout" onClick={handleLogout}>
          <LogOut size={18} /><span>Sign Out</span>
        </button>
      </header>

      {error && <div className="error-message">{error}</div>}

      {/* TABS */}
      <div className="tab-container">
        <button className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}>
          <BarChart3 size={18} /> Overview
        </button>
        <button className={`tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
          onClick={() => setActiveTab('reports')}>
          <ClipboardList size={18} /> Reports
        </button>
        <button className={`tab-btn ${activeTab === 'attendants' ? 'active' : ''}`}
          onClick={() => setActiveTab('attendants')}>
          <Users size={18} /> Attendants
        </button>
      </div>

      {/* ====================== OVERVIEW TAB ====================== */}
      {activeTab === 'overview' && (
        <>
          <div className="stats-grid">
            <div className="stat-card glass-panel">
              <div className="stat-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>
                <Users size={24} />
              </div>
              <div className="stat-content">
                <span className="stat-value">{totalStudents}</span>
                <span className="stat-label">Total Registered</span>
              </div>
            </div>
            <div className="stat-card glass-panel">
              <div className="stat-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                <UserCheck size={24} />
              </div>
              <div className="stat-content">
                <span className="stat-value">{todayPresent}</span>
                <span className="stat-label">Present Today</span>
              </div>
            </div>
            <div className="stat-card glass-panel">
              <div className="stat-icon" style={{ background: '#fffbeb', color: '#d97706' }}>
                <TrendingUp size={24} />
              </div>
              <div className="stat-content">
                <span className="stat-value">{monthlyPercent}%</span>
                <span className="stat-label">Monthly Rate</span>
              </div>
            </div>
            <div className="stat-card glass-panel">
              <div className="stat-icon" style={{ background: '#fef2f2', color: '#dc2626' }}>
                <KeyRound size={24} />
              </div>
              <div className="stat-content">
                <span className="stat-value">{attendants.length}</span>
                <span className="stat-label">Attendants</span>
              </div>
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '1.5rem', marginTop: '1.25rem' }}>
            <div className="panel-header">
              <h2><ClipboardList size={20} /> Recent Activity</h2>
            </div>
            {recentActivity.length === 0 ? (
              <div className="empty-state">
                <BarChart3 size={36} /><p>No attendance records yet</p>
                <span>Records will appear as attendance is taken.</span>
              </div>
            ) : (
              <div className="logs-list">
                {recentActivity.map((r, i) => (
                  <div key={i} className="log-item">
                    <div className="log-info">
                      <h4>{r.person_name}</h4>
                      <span>{new Date(r.created_at).toLocaleString()}</span>
                    </div>
                    <div className="log-status present">✓ {r.status}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ====================== REPORTS TAB ====================== */}
      {activeTab === 'reports' && (
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div className="panel-header" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
            <h2><Calendar size={20} /> Attendance Report</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button className="icon-btn edit" onClick={() => navigateDate(-1)}><ChevronLeft size={16}/></button>
              <input type="date" value={reportDate} 
                onChange={(e) => setReportDate(e.target.value)}
                className="form-input" style={{ width: 'auto', padding: '0.4rem 0.6rem', fontSize: '0.85rem' }} />
              <button className="icon-btn edit" onClick={() => navigateDate(1)}><ChevronRight size={16}/></button>
            </div>
          </div>

          {/* Summary Strip */}
          {reportData.length > 0 && (
            <div style={{ display: 'flex', gap: '0.75rem', margin: '1rem 0', flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="count-badge" style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}>
                ✅ {presentCount} Present
              </span>
              <span style={{ background: '#fef2f2', color: '#dc2626', padding: '0.4rem 0.8rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '700', border: '1px solid #fecaca' }}>
                ❌ {absentCount} Absent
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                ({reportData.length} total)
              </span>
              <button className="btn btn-primary" onClick={exportCSV}
                style={{ width: 'auto', padding: '0.45rem 1rem', fontSize: '0.8rem', marginLeft: 'auto' }}>
                <Download size={16} /> Export CSV
              </button>
            </div>
          )}

          {reportLoading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <Loader2 size={28} className="spinner" style={{ color: 'var(--primary)' }} />
            </div>
          ) : reportData.length === 0 ? (
            <div className="empty-state">
              <Calendar size={36} /><p>No data for this date</p>
              <span>Register students first, then take attendance.</span>
            </div>
          ) : (
            <div className="report-table-wrapper">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.map((r, i) => (
                    <tr key={i}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {r.photo_url ? (
                            <img src={r.photo_url} alt="" style={{ width: '30px', height: '30px', borderRadius: '6px', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ width: '30px', height: '30px', borderRadius: '6px', background: 'var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>👤</div>
                          )}
                          <span style={{ fontWeight: '600' }}>{r.name}</span>
                        </div>
                      </td>
                      <td>
                        <span className={r.status === 'Present' ? 'status-pill present' : 'status-pill absent'}>
                          {r.status}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-muted)' }}>{r.time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ====================== ATTENDANTS TAB ====================== */}
      {activeTab === 'attendants' && (
        <div className="dashboard-content">
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <div className="panel-header">
              <h2><UserPlus size={20} /> Register Attendant</h2>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              Create attendant accounts. They get a 6-digit access ID for the Biometric Portal.
            </p>
            <form onSubmit={handleCreateAttendant}>
              <div className="register-row">
                <input type="text" className="form-input" placeholder="Attendant Name"
                  value={newAttendantName} onChange={(e) => setNewAttendantName(e.target.value)} required />
                <button type="submit" className="btn btn-primary capture-btn" disabled={creating}>
                  {creating ? <Loader2 size={18} className="spinner" /> : <UserPlus size={18} />}
                  {creating ? 'Creating...' : 'Generate ID'}
                </button>
              </div>
            </form>
          </div>

          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <div className="panel-header">
              <h2><ClipboardList size={20} /> Active Attendants</h2>
              <span className="count-badge">{attendants.length}</span>
            </div>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '2rem' }}><Loader2 size={28} className="spinner" style={{ color: 'var(--primary)' }} /></div>
            ) : attendants.length === 0 ? (
              <div className="empty-state">
                <Users size={36} /><p>No attendants yet</p><span>Use the form to create the first one.</span>
              </div>
            ) : (
              <div className="logs-list">
                {attendants.map(a => (
                  <div key={a.id} className="student-card">
                    <div className="student-info">
                      <h4>{a.name}</h4>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <KeyRound size={12} />
                        <strong style={{ fontFamily: 'monospace', fontSize: '0.95rem', color: 'var(--primary)', letterSpacing: '1.5px' }}>{a.unique_id}</strong>
                      </span>
                    </div>
                    <button className="icon-btn delete" onClick={() => handleDeleteAttendant(a.id)} title="Remove">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
