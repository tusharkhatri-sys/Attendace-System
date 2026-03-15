import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { LogOut, ClipboardList, UserPlus, ScanFace, Loader2, CheckCircle, Camera, CameraOff, Shield, Edit3, Trash2, Users, AlertTriangle, RefreshCw, X } from 'lucide-react';
import * as faceapi from 'face-api.js';

export default function AttendantDashboard({ attendantSession, setAttendantSession }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('register');
  
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('Initializing Biometric Engine...');
  
  // Registration
  const [newStudentName, setNewStudentName] = useState('');
  const [registering, setRegistering] = useState(false);
  const [registerStatus, setRegisterStatus] = useState(null);

  // Attendance
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [studentsDb, setStudentsDb] = useState([]);
  const [cameraActive, setCameraActive] = useState(false);
  const [entryType, setEntryType] = useState('IN'); // 'IN' or 'OUT'

  // Scan timeout
  const [scanCountdown, setScanCountdown] = useState(null);
  const [scanResult, setScanResult] = useState(null); // 'timeout' | 'success' | null
  const [lastRecognized, setLastRecognized] = useState(''); // name of last recognized person

  // Student management
  const [registeredStudents, setRegisteredStudents] = useState([]);
  const [editingStudent, setEditingStudent] = useState(null);
  const [editName, setEditName] = useState('');
  const [showManagePanel, setShowManagePanel] = useState(false);

  // Face quality
  const [faceQuality, setFaceQuality] = useState(null); // { status: 'good'|'warning'|'error', msg: string }

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const timeoutRef = useRef(null);
  const countdownRef = useRef(null);

  useEffect(() => {
    loadModels();
    return () => { cleanup(); };
  }, []);

  useEffect(() => {
    if (modelsLoaded) {
      fetchRegisteredStudents();
      if (activeTab === 'attendance') {
        fetchStudentsDB();
        fetchTodayAttendance();
      }
    }
    stopVideo();
    cleanup();
  }, [activeTab, modelsLoaded, entryType]);

  const cleanup = () => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    setScanCountdown(null);
    setScanResult(null);
    setFaceQuality(null);
  };

  const loadModels = async () => {
    try {
      const MODEL_URL = '/models';
      setLoadingMsg('Loading Face Detector...');
      await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
      setLoadingMsg('Loading Facial Landmarks...');
      await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
      setLoadingMsg('Loading Recognition Engine...');
      await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
      setModelsLoaded(true);
      setLoadingMsg('');
    } catch (err) {
      console.error("Error loading models:", err);
      setLoadingMsg('Failed to load biometric models. Please refresh.');
    }
  };

  const fetchStudentsDB = async () => {
    try {
      const { data, error } = await supabase
        .from('students')
        .select('*')
        .eq('org_id', attendantSession.org_id)
        .eq('trade', attendantSession.trade || 'General');
      if (error) throw error;
      if (data && data.length > 0) {
        const matchers = data.map(s => {
          const desc = new Float32Array(Object.values(s.face_descriptor));
          return new faceapi.LabeledFaceDescriptors(
            JSON.stringify({ id: s.id, name: s.name }), [desc]
          );
        });
        setStudentsDb(matchers);
      } else {
        setStudentsDb([]);
      }
    } catch (err) {
      console.error('Error fetching students:', err);
    }
  };

  const fetchRegisteredStudents = async () => {
    try {
      const { data, error } = await supabase
        .from('students')
        .select('id, name, created_at, photo_url, trade')
        .eq('org_id', attendantSession.org_id)
        .eq('trade', attendantSession.trade || 'General')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setRegisteredStudents(data || []);
    } catch (err) {
      console.error('Error fetching registered students:', err);
    }
  };

  const fetchTodayAttendance = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('attendance_records')
        .select('student_id, person_name, created_at, entry_type')
        .eq('org_id', attendantSession.org_id)
        .eq('entry_type', entryType)
        .gte('created_at', today + 'T00:00:00')
        .lte('created_at', today + 'T23:59:59')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      const logs = (data || []).map(r => ({
        student_id: r.student_id,
        name: r.person_name,
        time: new Date(r.created_at).toLocaleTimeString(),
        status: 'Present'
      }));
      setAttendanceLogs(logs);
    } catch (err) {
      console.error('Error fetching today attendance:', err);
    }
  };

  const startVideo = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setCameraActive(true);
        setFaceQuality(null);
        // Start live face quality checking for registration
        if (activeTab === 'register') startFaceQualityCheck();
      }
    } catch (err) {
      console.error("Error accessing webcam:", err);
      alert("Camera access denied. Please allow camera permissions.");
    }
  }, [activeTab]);

  const stopVideo = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setFaceQuality(null);
  }, []);

  const handleLogout = () => {
    stopVideo(); cleanup();
    localStorage.removeItem('attendant_session');
    setAttendantSession(null);
    navigate('/login');
  };

  /* ========== FACE QUALITY CHECK ========== */
  const startFaceQualityCheck = () => {
    const qualityInterval = setInterval(async () => {
      if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) {
        clearInterval(qualityInterval);
        return;
      }
      try {
        const detection = await faceapi.detectSingleFace(videoRef.current).withFaceLandmarks();
        if (!detection) {
          setFaceQuality({ status: 'error', msg: '❌ No face detected — Position your face in the frame' });
        } else {
          const box = detection.detection.box;
          const videoW = videoRef.current.videoWidth;
          const videoH = videoRef.current.videoHeight;
          const faceArea = (box.width * box.height) / (videoW * videoH);
          const score = detection.detection.score;

          if (faceArea < 0.04) {
            setFaceQuality({ status: 'warning', msg: '⚠️ Face too far — Move closer to camera' });
          } else if (faceArea > 0.65) {
            setFaceQuality({ status: 'warning', msg: '⚠️ Face too close — Move back a little' });
          } else if (score < 0.7) {
            setFaceQuality({ status: 'warning', msg: '⚠️ Poor clarity — Improve lighting or hold still' });
          } else {
            setFaceQuality({ status: 'good', msg: '✅ Face detected clearly — Ready to capture' });
          }
        }
      } catch (e) { /* silently continue */ }
    }, 1500);
    // Store to clean up
    scanIntervalRef.current = qualityInterval;
  };

  /* ========== REGISTRATION ========== */
  const captureAndRegister = async () => {
    if (!newStudentName.trim()) {
      setRegisterStatus({ type: 'error', msg: 'Please enter a name before capturing.' });
      return;
    }
    if (!cameraActive) {
      setRegisterStatus({ type: 'error', msg: 'Camera is not active. Please enable it first.' });
      return;
    }

    setRegistering(true);
    setRegisterStatus(null);

    try {
      const detection = await faceapi.detectSingleFace(videoRef.current).withFaceLandmarks().withFaceDescriptor();

      if (!detection) {
        setRegisterStatus({ type: 'error', msg: 'No face detected! Ensure good lighting and look directly at camera.' });
        setRegistering(false);
        return;
      }

      const score = detection.detection.score;
      const box = detection.detection.box;
      const videoW = videoRef.current.videoWidth;
      const videoH = videoRef.current.videoHeight;
      const faceArea = (box.width * box.height) / (videoW * videoH);

      if (score < 0.75) {
        setRegisterStatus({ type: 'error', msg: 'Face not clear enough. Improve lighting and stay still.' });
        setRegistering(false);
        return;
      }

      if (faceArea < 0.04) {
        setRegisterStatus({ type: 'error', msg: 'Face too small. Move closer to the camera.' });
        setRegistering(false);
        return;
      }

      const descriptorArray = Array.from(detection.descriptor);

      // ===== DUPLICATE FACE CHECK =====
      // Fetch all existing face descriptors for this org
      const { data: existingStudents } = await supabase
        .from('students').select('id, name, face_descriptor')
        .eq('org_id', attendantSession.org_id);

      if (existingStudents && existingStudents.length > 0) {
        const labeledDescriptors = existingStudents.map(s => {
          const desc = new Float32Array(Object.values(s.face_descriptor));
          return new faceapi.LabeledFaceDescriptors(s.name, [desc]);
        });
        
        const matcher = new faceapi.FaceMatcher(labeledDescriptors, 0.5); // strict threshold
        const bestMatch = matcher.findBestMatch(detection.descriptor);
        
        if (bestMatch.label !== 'unknown') {
          setRegisterStatus({ 
            type: 'error', 
            msg: `⚠️ This face is already registered as "${bestMatch.label}". Duplicate registration is not allowed.` 
          });
          setRegistering(false);
          return;
        }
      }
      // ===== END DUPLICATE CHECK =====

      // ===== CAPTURE PROFILE PHOTO =====
      let photoDataUrl = null;
      try {
        const photoCanvas = document.createElement('canvas');
        photoCanvas.width = 120;
        photoCanvas.height = 120;
        const ctx = photoCanvas.getContext('2d');
        const box = detection.detection.box;
        // Crop face region from video
        ctx.drawImage(videoRef.current, box.x - 20, box.y - 30, box.width + 40, box.height + 50, 0, 0, 120, 120);
        photoDataUrl = photoCanvas.toDataURL('image/jpeg', 0.7);
      } catch(e) { /* photo optional, continue if fails */ }

      const { error } = await supabase.from('students').insert([{
        org_id: attendantSession.org_id,
        registered_by: attendantSession.id,
        name: newStudentName.trim(),
        trade: attendantSession.trade || 'General',
        face_descriptor: descriptorArray,
        photo_url: photoDataUrl
      }]);

      if (error) throw error;

      setRegisterStatus({ type: 'success', msg: `✅ ${newStudentName.trim()} registered successfully!` });
      setNewStudentName('');
      fetchRegisteredStudents();
    } catch (err) {
      console.error("Registration error:", err);
      setRegisterStatus({ type: 'error', msg: 'Database error. Please try again.' });
    } finally {
      setRegistering(false);
    }
  };

  /* ========== ATTENDANCE WITH 10s TIMEOUT ========== */
  const loggedStudentsRef = useRef(new Set());

  const startAttendanceScan = () => {
    if (studentsDb.length === 0) return;
    
    setScanResult(null);
    setScanCountdown(10);
    loggedStudentsRef.current = new Set(); // reset per scan session
    
    const displaySize = { width: videoRef.current.videoWidth, height: videoRef.current.videoHeight };
    if (canvasRef.current) faceapi.matchDimensions(canvasRef.current, displaySize);
    
    const faceMatcher = new faceapi.FaceMatcher(studentsDb, 0.6);

    // Countdown timer
    let secondsLeft = 10;
    countdownRef.current = setInterval(() => {
      secondsLeft--;
      setScanCountdown(secondsLeft);
      if (secondsLeft <= 0) {
        clearInterval(countdownRef.current);
      }
    }, 1000);

    // Timeout after 10 seconds
    timeoutRef.current = setTimeout(() => {
      clearInterval(scanIntervalRef.current);
      clearInterval(countdownRef.current);
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
      setScanResult('timeout');
      setScanCountdown(null);
    }, 10000);

    // Scan loop
    scanIntervalRef.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) {
        clearInterval(scanIntervalRef.current);
        return;
      }
      try {
        const detections = await faceapi.detectAllFaces(videoRef.current).withFaceLandmarks().withFaceDescriptors();
        const resized = faceapi.resizeResults(detections, displaySize);
        
        if (canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

          for (const det of resized) {
            const result = faceMatcher.findBestMatch(det.descriptor);
            const box = det.detection.box;
            const isKnown = result.label !== 'unknown';
            const color = isKnown ? '#10b981' : '#ef4444';
            
            let labelText = 'Unknown';
            if (isKnown) {
              try {
                const info = JSON.parse(result.label);
                
                // Check if already marked today
                const isAlreadyMarked = attendanceLogs.some(log => log.student_id === info.id);
                
                if (isAlreadyMarked) {
                  labelText = `${info.name} (Today Already Marked)`;
                } else {
                  labelText = info.name;
                  
                  // Only mark attendance once per student per scan session
                  if (!loggedStudentsRef.current.has(info.id)) {
                    loggedStudentsRef.current.add(info.id);
                    setLastRecognized(info.name);
                    markAttendance(info);
                    // Stop scanning
                    clearInterval(scanIntervalRef.current);
                    clearTimeout(timeoutRef.current);
                    clearInterval(countdownRef.current);
                    setScanCountdown(null);
                    // Show success overlay after brief green box
                    setTimeout(() => {
                      if (canvasRef.current) {
                        const ctx = canvasRef.current.getContext('2d');
                        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                      }
                      setScanResult('success');
                    }, 1200);
                  }
                }
              } catch(e) {
                labelText = result.label; // fallback: use raw label
              }
            }

            const boxColor = labelText.includes('Today Already Marked') ? '#2563eb' : color;
            const drawBox = new faceapi.draw.DrawBox(box, { label: labelText, boxColor: boxColor });
            drawBox.draw(canvasRef.current);
          }
        }
      } catch (err) { 
        console.error('Scan error:', err);
      }
    }, 1200);
  };

  const handleVideoPlayAttendance = () => {
    if (activeTab === 'attendance' && studentsDb.length > 0) {
      startAttendanceScan();
    }
  };

  const retryScan = () => {
    cleanup();
    if (cameraActive && studentsDb.length > 0) {
      setTimeout(() => startAttendanceScan(), 300);
    }
  };

  const markAttendance = async (studentInfo) => {
    // Add to UI logs
    setAttendanceLogs(prev => {
      if (prev.some(log => log.student_id === studentInfo.id)) return prev;
      return [{
        student_id: studentInfo.id, name: studentInfo.name,
        time: new Date().toLocaleTimeString(), status: 'Present'
      }, ...prev];
    });

    // Save to database
    try {
      const { data, error } = await supabase.from('attendance_records').insert([{
        student_id: studentInfo.id, 
        attendant_id: attendantSession.id,
        org_id: attendantSession.org_id, 
        person_name: studentInfo.name, 
        entry_type: entryType,
        status: 'Present'
      }]).select();
      
      if (error) {
        console.error('❌ Attendance DB save FAILED:', error.message, error.details, error.hint);
        alert('⚠️ Attendance record failed to save: ' + error.message);
      } else {
        console.log('✅ Attendance saved:', data);
      }
    } catch (err) {
      console.error('❌ Attendance save exception:', err);
      alert('⚠️ Database error: ' + err.message);
    }
  };

  /* ========== STUDENT MANAGEMENT ========== */
  const handleEditStudent = async (id) => {
    if (!editName.trim()) return;
    try {
      const { error } = await supabase.from('students').update({ name: editName.trim() }).eq('id', id);
      if (error) throw error;
      setRegisteredStudents(prev => prev.map(s => s.id === id ? { ...s, name: editName.trim() } : s));
      setEditingStudent(null);
      setEditName('');
    } catch (err) {
      alert('Failed to update name.');
    }
  };

  const handleDeleteStudent = async (id, name) => {
    if (!window.confirm(`Remove "${name}" from the system? Their biometric data will be permanently deleted.`)) return;
    try {
      const { error } = await supabase.from('students').delete().eq('id', id);
      if (error) throw error;
      setRegisteredStudents(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      alert('Failed to delete.');
    }
  };

  /* ========== RENDER ========== */
  if (!modelsLoaded) {
    return (
      <div className="loading-screen">
        <div className="loading-card glass-panel">
          <div className="govt-emblem"><Shield size={56} /></div>
          <Loader2 size={40} className="spinner" />
          <h2>{loadingMsg}</h2>
          <p>AI models load locally for 100% privacy. No data leaves your device.</p>
          <div className="loading-bar"><div className="loading-bar-fill"></div></div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div className="header-left">
          <div className="govt-badge"><Shield size={28} /></div>
          <div>
            <h1>Dost Attend</h1>
            <p>Biometric Portal — ID: <strong>{attendantSession?.unique_id}</strong> | Trade: <span className="status-pill present" style={{ fontSize: '0.75rem' }}>{attendantSession?.trade}</span></p>
          </div>
        </div>
        <button className="btn-logout" onClick={handleLogout}>
          <LogOut size={18} /><span>Logout</span>
        </button>
      </header>

      {/* TABS */}
      <div className="tab-container">
        <button className={`tab-btn ${activeTab === 'register' ? 'active' : ''}`}
          onClick={() => setActiveTab('register')}>
          <UserPlus size={18} /> Register
        </button>
        <button className={`tab-btn ${activeTab === 'attendance' ? 'active' : ''}`}
          onClick={() => setActiveTab('attendance')}>
          <ScanFace size={18} /> Attendance
        </button>
        <button className={`tab-btn ${activeTab === 'manage' ? 'active' : ''}`}
          onClick={() => setActiveTab('manage')}>
          <Users size={18} /> Students ({registeredStudents.length})
        </button>
      </div>

      {/* ====================== REGISTER TAB ====================== */}
      {activeTab === 'register' && (
        <div className="dashboard-content">
          <div className="camera-panel glass-panel">
            <div className="panel-header">
              <h2>📸 Capture Face Profile</h2>
              {cameraActive && <span className="live-badge">● LIVE</span>}
            </div>
            
            <div className="camera-viewport">
              <video ref={videoRef} autoPlay playsInline muted />
              <canvas ref={canvasRef} />
              {!cameraActive && (
                <div className="camera-overlay">
                  <Camera size={48} /><p>Camera is off</p>
                  <button className="btn btn-primary" onClick={startVideo}>
                    <Camera size={18} /> Enable Camera
                  </button>
                </div>
              )}
            </div>

            {/* Face Quality Indicator */}
            {cameraActive && faceQuality && (
              <div className={`face-quality ${faceQuality.status}`}>
                {faceQuality.msg}
              </div>
            )}

            {cameraActive && (
              <button className="btn-stop-camera" onClick={stopVideo}>
                <CameraOff size={16} /> Stop Camera
              </button>
            )}

            {cameraActive && (
              <div className="register-form">
                {registerStatus && (
                  <div className={`status-msg ${registerStatus.type}`}>{registerStatus.msg}</div>
                )}
                <div className="register-row">
                  <input type="text" className="form-input" placeholder="Enter student / worker name"
                    value={newStudentName} onChange={(e) => setNewStudentName(e.target.value)} />
                  <button className="btn btn-primary capture-btn" onClick={captureAndRegister} disabled={registering}>
                    {registering ? <Loader2 className="spinner" size={20} /> : '📸 Capture'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Rules & Info Panel */}
          <div className="logs-panel glass-panel">
            <div className="panel-header">
              <h2><ClipboardList size={20} /> Registration Rules</h2>
            </div>
            <div className="rules-list">
              <div className="rule-item">
                <span className="rule-icon">💡</span>
                <p>Ensure <strong>good lighting</strong> — face should be well-lit, no harsh shadows</p>
              </div>
              <div className="rule-item">
                <span className="rule-icon">👤</span>
                <p>Face must be <strong>clearly visible</strong> — no mask, sunglasses, or obstruction</p>
              </div>
              <div className="rule-item">
                <span className="rule-icon">📏</span>
                <p>Keep face <strong>centered and close</strong> — not too far, not too close</p>
              </div>
              <div className="rule-item">
                <span className="rule-icon">🧍</span>
                <p>Person should <strong>look directly at camera</strong> with a neutral expression</p>
              </div>
              <div className="rule-item">
                <span className="rule-icon">🔒</span>
                <p>Only <strong>one person at a time</strong> should be in the frame</p>
              </div>
            </div>
            <div className="registered-count">
              <Users size={20} />
              <span><strong>{registeredStudents.length}</strong> students/workers registered</span>
            </div>
          </div>
        </div>
      )}

      {/* ====================== ATTENDANCE TAB ====================== */}
      {activeTab === 'attendance' && (
        <div className="dashboard-content">
          <div className="camera-panel glass-panel">
            <div className="panel-header">
              <h2>📷 Live Biometric Scan</h2>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <div className="entry-toggle">
                  <button className={`toggle-btn ${entryType === 'IN' ? 'active' : ''}`} onClick={() => setEntryType('IN')}>IN</button>
                  <button className={`toggle-btn ${entryType === 'OUT' ? 'active' : ''}`} onClick={() => setEntryType('OUT')}>OUT</button>
                </div>
                {cameraActive && scanCountdown !== null && (
                  <span className="countdown-badge">{scanCountdown}s</span>
                )}
                {cameraActive && <span className="live-badge">● LIVE</span>}
              </div>
            </div>
            
            <div className="camera-viewport">
              <video ref={videoRef} autoPlay playsInline muted 
                onPlay={handleVideoPlayAttendance} />
              <canvas ref={canvasRef} />
              {!cameraActive && (
                <div className="camera-overlay">
                  <Camera size={48} /><p>Camera is off</p>
                  <button className="btn btn-primary" onClick={startVideo}>
                    <Camera size={18} /> Enable Camera
                  </button>
                </div>
              )}
              {/* Timeout overlay */}
              {scanResult === 'timeout' && (
                <div className="camera-overlay" style={{ background: 'rgba(30,41,59,0.92)' }}>
                  <AlertTriangle size={48} color="#d97706" />
                  <p style={{ color: '#d97706', fontWeight: '700', fontSize: '1.1rem' }}>No face recognized in 10 seconds</p>
                  <p style={{ fontSize: '0.85rem' }}>Ensure the person is registered & clearly visible</p>
                  <button className="btn btn-primary" onClick={retryScan} style={{ marginTop: '0.5rem' }}>
                    <RefreshCw size={18} /> Scan Again
                  </button>
                </div>
              )}
              {/* Success overlay */}
              {scanResult === 'success' && (
                <div className="camera-overlay" style={{ background: 'rgba(30,41,59,0.92)' }}>
                  <CheckCircle size={56} color="#16a34a" />
                  <p style={{ color: '#16a34a', fontWeight: '800', fontSize: '1.2rem' }}>✅ {lastRecognized}</p>
                  <p style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Attendance marked successfully!</p>
                  <button className="btn btn-primary" onClick={retryScan} style={{ marginTop: '0.75rem' }}>
                    <ScanFace size={18} /> Scan Next Person
                  </button>
                </div>
              )}
            </div>

            {cameraActive && (
              <button className="btn-stop-camera" onClick={stopVideo}>
                <CameraOff size={16} /> Stop Camera
              </button>
            )}

            {cameraActive && (
              <div className="scan-info">
                {studentsDb.length === 0 ? (
                  <div className="status-msg error">⚠️ No students registered. Register students first.</div>
                ) : scanResult === 'success' ? (
                  <div className="status-msg success">✅ Attendance marked for {lastRecognized}. Click "Scan Next" for another.</div>
                ) : scanResult !== 'timeout' && scanCountdown !== null ? (
                  <div className="status-msg success">🔍 Scanning {studentsDb.length} profiles... {scanCountdown}s remaining</div>
                ) : null}
              </div>
            )}
          </div>

          {/* Logs panel */}
          <div className="logs-panel glass-panel">
            <div className="panel-header">
              <h2><ClipboardList size={20} /> Today's {entryType} Attendance</h2>
              <span className="count-badge">{attendanceLogs.length}</span>
            </div>
            <div className="logs-list">
              {attendanceLogs.length === 0 ? (
                <div className="empty-state">
                  <ScanFace size={40} /><p>No attendance yet.</p>
                  <span>Point camera at registered faces.</span>
                </div>
              ) : (
                attendanceLogs.map((log, i) => (
                  <div key={i} className="log-item">
                    <div className="log-info">
                      <h4>{log.name}</h4><span>{log.time}</span>
                    </div>
                    <div className="log-status present">
                      <CheckCircle size={16} /> Present
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ====================== MANAGE TAB ====================== */}
      {activeTab === 'manage' && (
        <div className="manage-panel glass-panel">
          <div className="panel-header">
            <h2><Users size={20} /> Registered Students — {registeredStudents.length} Total</h2>
          </div>

          {registeredStudents.length === 0 ? (
            <div className="empty-state" style={{ padding: '3rem' }}>
              <Users size={48} /><p>No students registered yet.</p>
              <span>Go to the Register tab to add students.</span>
            </div>
          ) : (
            <div className="student-grid">
              {registeredStudents.map(student => (
                <div key={student.id} className="student-card">
                  {editingStudent === student.id ? (
                    <div className="edit-row">
                      <input type="text" className="form-input" value={editName}
                        onChange={(e) => setEditName(e.target.value)} placeholder="New name" autoFocus />
                      <button className="icon-btn save" onClick={() => handleEditStudent(student.id)}>✓</button>
                      <button className="icon-btn cancel" onClick={() => { setEditingStudent(null); setEditName(''); }}>
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {student.photo_url ? (
                          <img src={student.photo_url} alt={student.name}
                            style={{ width: '42px', height: '42px', borderRadius: '10px', objectFit: 'cover', border: '2px solid var(--surface-border)' }} />
                        ) : (
                          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-light)', fontSize: '1.1rem' }}>👤</div>
                        )}
                        <div className="student-info">
                          <h4 style={{ marginBottom: '0.1rem' }}>{student.name}</h4>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <span className="status-pill present" style={{ fontSize: '0.65rem', padding: '0.05rem 0.4rem' }}>{student.trade}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>{new Date(student.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                      <div className="student-actions">
                        <button className="icon-btn edit" onClick={() => { setEditingStudent(student.id); setEditName(student.name); }}
                          title="Edit name"><Edit3 size={15} /></button>
                        <button className="icon-btn delete" onClick={() => handleDeleteStudent(student.id, student.name)}
                          title="Delete"><Trash2 size={15} /></button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
