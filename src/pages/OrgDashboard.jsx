import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { LogOut, Users, UserPlus, Trash2, KeyRound, Loader2, Shield, ClipboardList, BarChart3, Download, Calendar, TrendingUp, UserCheck, ChevronLeft, ChevronRight, X } from 'lucide-react';

export default function OrgDashboard({ session }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [attendants, setAttendants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newAttendantName, setNewAttendantName] = useState('');
  const [newAttendantTrade, setNewAttendantTrade] = useState('');
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

  // Settings
  const [orgProfile, setOrgProfile] = useState({
    name: session.user.user_metadata?.org_name || 'Organization',
    session_start: session.user.user_metadata?.session_start || 'January',
    session_end: session.user.user_metadata?.session_end || 'December'
  });
  const [updatingProfile, setUpdatingProfile] = useState(false);

  // Individual Student History
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentHistory, setStudentHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

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
      const { data: students, count: studentCount } = await supabase
        .from('students').select('*', { count: 'exact' }).eq('org_id', orgId);
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

      if (students && students.length > 0 && monthRecords) {
        // Calculate unique student-day pairs
        const uniquePairs = new Set(monthRecords.map(r => {
          const date = r.created_at.split('T')[0];
          return `${r.person_name}_${date}`;
        }));

        let totalPossiblePairs = 0;
        const now = new Date();
        
        students.forEach(s => {
          const regDateStr = new Date(s.created_at).toLocaleDateString('en-CA');
          const regDate = new Date(regDateStr);
          const calcStart = regDate > monthStart ? regDate : monthStart;
          
          for (let d = new Date(calcStart); d <= now; d.setDate(d.getDate() + 1)) {
            const day = d.getDay();
            if (day !== 0 && day !== 6) totalPossiblePairs++;
          }
        });

        const pct = totalPossiblePairs > 0 ? Math.round((uniquePairs.size / totalPossiblePairs) * 100) : 0;
        setMonthlyPercent(Math.min(pct, 100));
      }

      // Recent Activity (last 10)
      const { data: recent } = await supabase
        .from('attendance_records').select('person_name, created_at, status, entry_type')
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
        .from('students')
        .select('id, name, photo_url, trade, created_at')
        .eq('org_id', orgId);

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

      const report = (students || [])
        .filter(s => {
          const regDate = new Date(s.created_at).toLocaleDateString('en-CA'); // YYYY-MM-DD
          return reportDate >= regDate; 
        })
        .map(s => {
          const studentRecords = (records || []).filter(r => r.person_name === s.name);
          const latestRecord = studentRecords[0]; // records are sorted by created_at desc

          return {
            name: s.name,
            photo_url: s.photo_url,
            trade: s.trade || 'General',
            status: studentRecords.length > 0 ? 'Present' : 'Absent',
            entry_type: latestRecord ? latestRecord.entry_type : '-',
            time: latestRecord ? new Date(latestRecord.created_at).toLocaleTimeString() : '-'
          };
        });
      
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
    const headers = ['Name', 'Trade', 'Status', 'Entry', 'Time'];
    const rows = reportData.map(r => [r.name, r.trade, r.status, r.entry_type, r.time]);
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
        .insert([{ 
          unique_id: generateUniqueId(), 
          name: newAttendantName.trim(), 
          trade: newAttendantTrade.trim() || 'General',
          org_id: session.user.id 
        }]).select();
      if (error) throw error;
      setNewAttendantName('');
      setNewAttendantTrade('');
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

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setUpdatingProfile(true);
    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;

      const { error } = await supabase.auth.updateUser({
        data: { 
          org_name: orgProfile.name, 
          session_start: orgProfile.session_start,
          session_end: orgProfile.session_end
        }
      });
      if (error) throw error;
      
      // Update local state if successful
      setOrgProfile({
        name: orgProfile.name,
        session_start: orgProfile.session_start,
        session_end: orgProfile.session_end
      });
      
      alert('Profile updated successfully!');
    } catch (err) {
      console.error('Update error:', err);
      alert('Failed to update profile: ' + err.message);
    } finally {
      setUpdatingProfile(false);
    }
  };

  const handleSyncTrades = async () => {
    if (!window.confirm("This will attempt to fix students with 'General' trade by matching them with the trade of the attendant who registered them. Continue?")) return;
    try {
      const { data: students, error: sErr } = await supabase.from('students').select('id, registered_by').eq('org_id', session.user.id).eq('trade', 'General');
      if (sErr) throw sErr;
      
      let fixed = 0;
      for (const s of (students || [])) {
        if (!s.registered_by) continue;
        const { data: att } = await supabase.from('attendants').select('trade').eq('id', s.registered_by).single();
        if (att && att.trade) {
          await supabase.from('students').update({ trade: att.trade }).eq('id', s.id);
          fixed++;
        }
      }
      alert(`Synchronized ${fixed} students.`);
      fetchAnalytics();
    } catch (err) {
      alert('Sync failed.');
    }
  };

  const fetchStudentHistory = async (student) => {
    setSelectedStudent(student);
    setHistoryLoading(true);
    setShowCalendar(true);
    try {
      const { data, error } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('person_name', student.name)
        .eq('org_id', session.user.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setStudentHistory(data || []);
    } catch (err) {
      alert('Failed to load history.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleExportStudentCSV = () => {
    if (!selectedStudent || studentHistory.length === 0) return;
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Date,Time,Status,Entry Type\n";
    
    studentHistory.forEach(r => {
      const date = new Date(r.created_at).toLocaleDateString();
      const time = new Date(r.created_at).toLocaleTimeString();
      csvContent += `${date},${time},${r.status},${r.entry_type}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${selectedStudent.name}_attendance.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const StudentCalendarModal = () => {
    if (!showCalendar || !selectedStudent) return null;

    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const startMonthName = session?.user?.user_metadata?.session_start || 'January';
    const startIndex = months.indexOf(startMonthName);
    
    // Log for debug
    console.log("Calendar Debug:", { selectedStudent, startMonthName, startIndex, historyLen: studentHistory.length });
    
    // Create ordered months for the 12-month view
    const orderedMonths = [];
    for (let i = 0; i < 12; i++) {
      orderedMonths.push(months[(startIndex + i) % 12]);
    }

    const getStatusForDay = (dateStr) => {
      const records = studentHistory.filter(r => r.created_at.startsWith(dateStr));
      if (records.length > 0) return 'present';
      
      if (!selectedStudent?.created_at) return 'absent';
      const regDate = new Date(selectedStudent.created_at);
      const regDateStr = regDate.toISOString().split('T')[0];
      const todayStr = new Date().toISOString().split('T')[0];
      
      if (dateStr < regDateStr) return 'not-registered';
      if (dateStr > todayStr) return 'future';
      return 'absent';
    };

    return (
      <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.5)', zIndex: 2000 }} onClick={() => setShowCalendar(false)}>
        <div className="calendar-modal glass-panel" style={{ width: '95%', maxWidth: '1000px', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem', margin: '2vh auto' }} onClick={e => e.stopPropagation()}>
          <div className="panel-header">
            <div>
              <h2 style={{ fontSize: '1.3rem' }}>🗓️ {selectedStudent.name}'s Attendance</h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Trade: {selectedStudent.trade}</p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn" onClick={handleExportStudentCSV} style={{ background: '#fff', border: '1.2px solid #2563eb', color: '#2563eb', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                <Download size={14} /> Export CSV
              </button>
              <button className="icon-btn" onClick={() => setShowCalendar(false)}><X size={20} /></button>
            </div>
          </div>
          
          <div className="calendar-grid-container" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1.25rem', marginTop: '1.5rem' }}>
            {orderedMonths.map(monthName => {
              const monthIdx = months.indexOf(monthName);
              // Calculate year based on session start
              const currentYear = new Date().getFullYear();
              const year = monthIdx < startIndex ? currentYear : currentYear - 1; 
              const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
              
              return (
                <div key={monthName} className="month-card" style={{ background: 'var(--surface-light)', borderRadius: '12px', padding: '0.8rem', border: '1px solid var(--surface-border)' }}>
                  <h4 style={{ fontSize: '0.9rem', marginBottom: '0.75rem', textAlign: 'center', color: 'var(--primary)' }}>{monthName}</h4>
                  <div className="days-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                    {Array.from({ length: daysInMonth }).map((_, i) => {
                      const day = i + 1;
                      const dateStr = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                      const status = getStatusForDay(dateStr);
                      return (
                        <div key={day} className={`day-cell ${status}`} title={dateStr} style={{ 
                          aspectRatio: '1', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          fontSize: '0.65rem', 
                          fontWeight: '700', 
                          borderRadius: '4px',
                          cursor: 'default',
                          ...(status === 'present' ? { background: '#22c55e', color: '#fff' } : 
                             status === 'absent' ? { background: '#ef4444', color: '#fff' } : 
                             status === 'future' ? { background: '#f3f4f6', color: '#9ca3af' } : 
                             { background: '#e5e7eb', color: '#9ca3af' })
                        }}>
                          {day}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="calendar-legend" style={{ display: 'flex', gap: '1.5rem', marginTop: '1.5rem', padding: '1rem', borderTop: '1px solid var(--surface-border)', justifyContent: 'center' }}>
            <span style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><div style={{ width: '12px', height: '12px', background: '#22c55e', borderRadius: '3px' }}></div> Present</span>
            <span style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><div style={{ width: '12px', height: '12px', background: '#ef4444', borderRadius: '3px' }}></div> Absent</span>
            <span style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><div style={{ width: '12px', height: '12px', background: '#e5e7eb', borderRadius: '3px' }}></div> Not Registered / Holiday / Future</span>
          </div>
        </div>
      </div>
    );
  };

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
        <button className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}>
          <KeyRound size={18} /> Settings
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
                    <div className="log-status present">
                      <span className="status-pill present" style={{ fontSize: '0.65rem', marginRight: '0.5rem' }}>{r.entry_type}</span>
                      ✓ {r.status}
                    </div>
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
                    <th>Trade</th>
                    <th>Entry</th>
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
                      <td><span className="status-pill present" style={{ fontSize: '0.75rem' }}>{r.trade}</span></td>
                      <td>
                        {r.entry_type !== '-' ? (
                          <span className={`status-pill ${r.entry_type === 'IN' ? 'present' : 'absent'}`} style={{ background: r.entry_type === 'IN' ? '#f0fdf4' : '#fff7ed', color: r.entry_type === 'IN' ? '#16a34a' : '#ea580c', border: r.entry_type === 'IN' ? '1px solid #bbfcce' : '1px solid #ffedd5' }}>
                            {r.entry_type}
                          </span>
                        ) : '-'}
                      </td>
                      <td>
                        <span className={r.status === 'Present' ? 'status-pill present' : 'status-pill absent'}>
                          {r.status}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-muted)' }}>{r.time}</td>
                      <td>
                        <button className="icon-btn edit" title="View Student History" onClick={() => fetchStudentHistory(r)}>
                          <Calendar size={15} />
                        </button>
                      </td>
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
                <input type="text" className="form-input" placeholder="Category / Trade (e.g. COPA)"
                  value={newAttendantTrade} onChange={(e) => setNewAttendantTrade(e.target.value)} 
                  style={{ width: 'auto', minWidth: '200px' }} />
                <button type="submit" className="btn btn-primary capture-btn" disabled={creating} style={{ minWidth: '140px' }}>
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <h4 style={{ marginBottom: 0 }}>{a.name}</h4>
                        <span className="status-pill present" style={{ fontSize: '0.7rem', padding: '0.1rem 0.5rem' }}>{a.trade}</span>
                      </div>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.2rem' }}>
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

      {/* ====================== SETTINGS TAB ====================== */}
      {activeTab === 'settings' && (
        <div className="dashboard-content">
          <div className="glass-panel" style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
            <div className="panel-header">
              <h2>⚙️ Organization Settings</h2>
            </div>
            <form onSubmit={handleUpdateProfile} style={{ marginTop: '1.5rem' }}>
              <div className="form-group">
                <label>Organization Name</label>
                <input type="text" className="form-input" value={orgProfile.name} 
                  onChange={(e) => setOrgProfile({...orgProfile, name: e.target.value})} required />
              </div>
              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label>Academic Session / Working Period</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Start Month</label>
                    <select className="form-input" value={orgProfile.session_start} 
                      onChange={(e) => setOrgProfile({...orgProfile, session_start: e.target.value})}>
                      {['January','February','March','April','May','June','July','August','September','October','November','December'].map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>End Month</label>
                    <select className="form-input" value={orgProfile.session_end} 
                      onChange={(e) => setOrgProfile({...orgProfile, session_end: e.target.value})}>
                      {['January','February','March','April','May','June','July','August','September','October','November','December'].map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.6rem' }}>
                  Define your custom attendance cycle (e.g. Feb to Jan).
                </p>
              </div>
              <button type="submit" className="btn btn-primary" disabled={updatingProfile} style={{ marginTop: '1.5rem' }}>
                {updatingProfile ? <Loader2 size={18} className="spinner" /> : null}
                Save Settings
              </button>
            </form>

            <div className="divider" style={{ margin: '2.5rem 0' }}>Data Maintenance</div>
            
            <div style={{ background: 'var(--surface-light)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--surface-border)' }}>
              <h4 style={{ color: '#2563eb', marginBottom: '0.5rem' }}>🛠️ Sync Trade Labels</h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                If students were registered without a trade (appearing as 'General'), use this to fix them based on their registration source.
              </p>
              <button className="btn" onClick={handleSyncTrades} style={{ width: 'auto', background: '#fff', border: '1.2px solid #2563eb', color: '#2563eb' }}>
                Sync All Students
              </button>
            </div>
          </div>
        </div>
      )}

      <StudentCalendarModal />
    </div>
  );
}
