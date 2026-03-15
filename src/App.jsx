import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import Login from './pages/Login';
import Register from './pages/Register';
import OrgDashboard from './pages/OrgDashboard';
import AttendantDashboard from './pages/AttendantDashboard';
import { Download } from 'lucide-react';

function App() {
  const [session, setSession] = useState(null);
  const [attendantSession, setAttendantSession] = useState(() => {
    const saved = localStorage.getItem('attendant_session');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(true);

  // PWA Install Prompt
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstall, setShowInstall] = useState(false);

  useEffect(() => {
    // Check initial Auth session for Organization
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for Auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    // Listen for PWA install prompt
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // Hide install button if already installed
    window.addEventListener('appinstalled', () => {
      setShowInstall(false);
      setDeferredPrompt(null);
    });

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstall(false);
    }
    setDeferredPrompt(null);
  };

  if (loading) return <div className="auth-container">Loading...</div>;

  return (
    <Router>
      {/* PWA Install Button — fixed top-right */}
      {showInstall && (
        <button className="pwa-install-btn" onClick={handleInstall} title="Install App">
          <Download size={18} />
          <span>Install</span>
        </button>
      )}

      <Routes>
        <Route 
          path="/" 
          element={
            session ? <Navigate to="/org-dashboard" /> 
            : attendantSession ? <Navigate to="/attendant-dashboard" />
            : <Navigate to="/login" />
          } 
        />
        
        <Route 
          path="/login" 
          element={
            session ? <Navigate to="/org-dashboard" /> 
            : attendantSession ? <Navigate to="/attendant-dashboard" />
            : <Login setAttendantSession={setAttendantSession} />
          } 
        />
        <Route 
          path="/register" 
          element={
            session ? <Navigate to="/org-dashboard" /> 
            : <Register />
          } 
        />
        
        <Route 
          path="/org-dashboard" 
          element={session ? <OrgDashboard session={session} /> : <Navigate to="/login" />} 
        />
        
        <Route 
          path="/attendant-dashboard" 
          element={
            attendantSession ? (
              <AttendantDashboard attendantSession={attendantSession} setAttendantSession={setAttendantSession} />
            ) : (
              <Navigate to="/login" />
            )
          } 
        />
      </Routes>
    </Router>
  );
}

export default App;
