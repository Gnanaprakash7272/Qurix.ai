import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  Terminal, Globe, BrainCircuit, Target, 
  CheckCircle2, AlertCircle, Play, Loader2, Send,
  Plus, User, Database, Code, ArrowUp, KeyRound, Lock,
  Clock, Link, ShieldCheck, DatabaseZap, LayoutTemplate, 
  Eye, EyeOff, LayoutDashboard, History, Settings, ChevronDown, ChevronUp, Check, Navigation, Search, ThumbsUp, Lightbulb, Link as LinkIcon, Mic, Square, LogOut
} from 'lucide-react';
import './index.css';

const ExpandableCode = ({ code, language = 'javascript' }) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="expandable-code-block">
      <div className="code-header" onClick={() => setExpanded(!expanded)}>
        <div className="code-title">
          <Code size={14} color="#9ca3af" />
          <span>Ran Python</span>
        </div>
        <div className="code-actions">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>
      {expanded && (
        <div className="code-content-area">
          <div className="code-content-header">
            <span>Code</span>
            <button className="copy-btn" onClick={handleCopy}>
              {copied ? <Check size={14} color="#10b981" /> : <Code size={14} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre>
            <code className={`language-${language}`}>{code}</code>
          </pre>
        </div>
      )}
    </div>
  );
};

function App() {
  const [appState, setAppState] = useState('LOGIN'); // LOGIN, CONFIG, DASHBOARD
  
  // Auth & Config State
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [apiKey, setApiKey] = useState('');
  const [selectedModel, setSelectedModel] = useState('claude-sonnet-4.6');
  const [profileName, setProfileName] = useState('default');
  const [liveUrl, setLiveUrl] = useState(null);
  const [vaultData, setVaultData] = useState([]);
  const [loadingVault, setLoadingVault] = useState(false);
  const [historyData, setHistoryData] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Agent State
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [task, setTask] = useState('');
  const [currentPrompt, setCurrentPrompt] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [steps, setSteps] = useState([]);
  const [liveScreenshot, setLiveScreenshot] = useState(null);
  const [memory, setMemory] = useState('Agent is idle. Waiting for a task...');
  const [isListening, setIsListening] = useState(false);
  const [showLiveBrowser, setShowLiveBrowser] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    // Check URL for OAuth login tokens
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get('token');
    const emailParam = urlParams.get('email');
    
    if (tokenParam && emailParam) {
      localStorage.setItem('auth_token', tokenParam);
      localStorage.setItem('auth_email', emailParam);
      setEmail(emailParam);
      setAppState('DASHBOARD');
      window.history.replaceState({}, document.title, "/");
    } else {
      const savedToken = localStorage.getItem('auth_token');
      const savedEmail = localStorage.getItem('auth_email');
      if (savedToken && savedEmail) {
        setEmail(savedEmail);
        setAppState('DASHBOARD');
      }
    }

    // Check local storage for api key
    const savedKey = localStorage.getItem('agent_api_key');
    const savedModel = localStorage.getItem('agent_model');
    const savedProfile = localStorage.getItem('agent_profile');
    if (savedKey) setApiKey(savedKey);
    if (savedModel) setSelectedModel(savedModel);
    if (savedProfile) setProfileName(savedProfile);
    
    connectWebSocket();
    return () => {
      if (socket) socket.close();
    };
  }, []);

  const connectWebSocket = () => {
    const ws = new WebSocket('ws://localhost:8000/api/agent/ws');
    
    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      setTimeout(connectWebSocket, 3000);
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'status') {
        setIsRunning(true);
        setSteps([{ type: 'status', message: data.message }]);
      } 
      else if (data.type === 'live_url') {
        // Cloud browser live preview URL
        setLiveUrl(data.live_url);
      }
      else if (data.type === 'step') {
        setSteps(prev => [...prev, data]);
        // Cloud gives screenshot_url strings, not base64
        if (data.screenshot && typeof data.screenshot === 'string' && data.screenshot.startsWith('http')) {
          setLiveScreenshot(data.screenshot);
        } else if (data.screenshot) {
          setLiveScreenshot(data.screenshot);
        }
        if (data.memory) setMemory(data.memory);
      }
      else if (data.type === 'result') {
        setSteps(prev => [...prev, data]);
        setIsRunning(false);
      }
      else if (data.type === 'error') {
        setSteps(prev => [...prev, data]);
        setIsRunning(false);
      }
      
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    };

    setSocket(ws);
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps]);

  // Fetch Vault Data
  const fetchVaultData = async () => {
    setLoadingVault(true);
    try {
      const res = await fetch('http://localhost:8000/api/data/scraped');
      const data = await res.json();
      if (data.success) {
        setVaultData(data.data);
      }
    } catch (e) {
      console.error("Failed to fetch vault data:", e);
    }
    setLoadingVault(false);
  };

  useEffect(() => {
    if (activeTab === 'data') {
      fetchVaultData();
    }
    if (activeTab === 'history') {
      fetchHistoryData();
    }
    if (activeTab === 'schedules') {
      fetchSchedules();
    }
  }, [activeTab]);

  const [schedules, setSchedules] = useState([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [schedTask, setSchedTask] = useState('');
  const [schedInterval, setSchedInterval] = useState(60);

  const fetchSchedules = async () => {
    setLoadingSchedules(true);
    try {
      const response = await fetch('http://localhost:8000/api/schedules');
      const data = await response.json();
      if (data.success) setSchedules(data.data);
    } catch (e) {
      console.error(e);
    }
    setLoadingSchedules(false);
  };

  const createSchedule = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('http://localhost:8000/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: schedTask,
          model: selectedModel,
          api_key: apiKey,
          interval_minutes: parseInt(schedInterval, 10)
        })
      });
      const data = await response.json();
      if (data.success) {
        setSchedTask('');
        fetchSchedules();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const deleteSchedule = async (id) => {
    try {
      await fetch(`http://localhost:8000/api/schedules/${id}`, { method: 'DELETE' });
      fetchSchedules();
    } catch (e) {
      console.error(e);
    }
  };

  const fetchHistoryData = async () => {
    setLoadingHistory(true);
    try {
      const response = await fetch('http://localhost:8000/api/history');
      const data = await response.json();
      if (data.success) {
        setHistoryData(data.data);
      }
    } catch (err) {
      console.error("Failed to fetch history", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const downloadCSV = () => {
    if (vaultData.length === 0) return;
    
    // Create headers
    const headers = ['ID', 'Source URL', 'Content', 'Extracted At'];
    
    // Map rows
    const rows = vaultData.map(row => [
      row.id,
      `"${(row.source_url || '').replace(/"/g, '""')}"`,
      `"${(row.content || '').replace(/"/g, '""')}"`,
      row.created_at
    ]);
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.join(','))].join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `qorix_data_vault_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    if (!email || !password) {
      setLoginError('Please enter both email and password.');
      return;
    }
    
    try {
      const response = await fetch('http://localhost:8000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();
      if (data.success) {
        setAppState('DASHBOARD');
      } else {
        setLoginError(data.message || 'Invalid credentials');
      }
    } catch (err) {
      setLoginError('Failed to connect to the server.');
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      const response = await fetch('http://localhost:8000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();
      if (data.success) {
        setToken(data.token);
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('auth_email', email);
        setIsLoggedIn(true);
      } else {
        setLoginError(data.message || 'Registration failed');
      }
    } catch (e) {
      setLoginError('Server connection failed');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_email');
    setEmail('');
    setAppState('LOGIN');
    if (socket) {
      socket.close();
    }
  };

  const [showSettings, setShowSettings] = useState(false);

  const handleSaveConfig = (e) => {
    e.preventDefault();
    localStorage.setItem('agent_api_key', apiKey);
    localStorage.setItem('agent_model', selectedModel);
    localStorage.setItem('agent_profile', profileName);
    setShowSettings(false);
  };

  const handleStartTask = (e) => {
    e.preventDefault();
    if (!task.trim() || !connected) return;
    
    setSteps([]);
    setLiveScreenshot(null);
    setLiveUrl(null);  // reset cloud browser URL
    setShowLiveBrowser(false);
    setIsRunning(true);
    
    // Send task and config
    socket.send(JSON.stringify({ 
      task,
      api_key: apiKey,
      model: selectedModel,
      profile: profileName
    }));
    setCurrentPrompt(task);
    setTask('');
  };

  const handleStopTask = () => {
    if (socket && connected) {
      socket.send(JSON.stringify({ type: 'stop' }));
    }
  };

  const toggleVoiceInput = () => {
    if (isListening) return; // already listening

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Your browser does not support Speech Recognition.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setTask(prev => prev ? prev + ' ' + transcript : transcript);
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
    };

    recognition.onend = () => setIsListening(false);

    recognition.start();
  };

  // --- LOGIN SCREEN ---
  if (appState === 'LOGIN') {
    return (
      <div className="auth-container">
        <div className="auth-box new-login-box">
          
          <div className="auth-logo-vertical">
             <img src="/logo.png" alt="Qorix AI" className="auth-logo-img-large" />
             <p className="auth-brand-subtitle">Autonomous Browser Intelligence</p>
          </div>

          <h2 className="login-title">{isRegistering ? 'Create an account' : 'Sign In'}</h2>
          <p className="login-subtitle">
            {isRegistering ? 'Already have an account? ' : "Don't have an account? "}
            <a href="#" onClick={(e) => { e.preventDefault(); setIsRegistering(!isRegistering); setLoginError(''); }}>
              {isRegistering ? 'Sign in' : 'Sign up'}
            </a>
          </p>

          <div className="social-login-container">
            <a href="http://localhost:8000/api/auth/login/github" className="social-btn" style={{ textDecoration: 'none' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" style={{marginRight: '8px'}}>
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              <span>{isRegistering ? 'Sign up' : 'Sign in'} with GitHub</span>
            </a>
            <a href="http://localhost:8000/api/auth/login/google" className="social-btn" style={{ textDecoration: 'none' }}>
              <svg width="18" height="18" viewBox="0 0 48 48" style={{marginRight: '8px'}}>
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              <span>{isRegistering ? 'Sign up' : 'Sign in'} with Google</span>
            </a>
          </div>

          <div className="login-divider">
            <span>Or continue with</span>
          </div>

          <form onSubmit={isRegistering ? handleRegister : handleLogin} className="auth-form">
            <div className="input-group">
              <label>Email</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="auth-input login-input"
                required
              />
            </div>
            <div className="input-group password-group">
              <label>Password</label>
              <div className="password-input-wrapper">
                <input 
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="auth-input login-input"
                  required
                />
                <button type="button" className="eye-btn" onClick={() => setShowPassword(!showPassword)}>
                   {showPassword ? <EyeOff size={16} color="#9ca3af"/> : <Eye size={16} color="#9ca3af"/>}
                </button>
              </div>
            </div>
            
            {!isRegistering && (
              <div className="forgot-password">
                <a href="#">Forgot password?</a>
              </div>
            )}

            {loginError && <div className="auth-error">{loginError}</div>}
            
            <button type="submit" className="auth-btn sign-in-btn">
              {isRegistering ? 'Create Account' : 'Sign In'}
            </button>
            
            <div className="tos-text">
              By continuing, you agree to our <a href="#">Terms of Service</a>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // --- MAIN DASHBOARD (Sleek UI) ---
  return (
    <div className="app-layout">
      {/* Sidebar Navigation */}
      <div className="sidebar">
        <div className="sidebar-header">
          <img src="/logo.png" alt="Qorix AI Logo" className="sidebar-logo-img" />
          <div className="sidebar-brand-text">
            <h2>Qorix AI</h2>
            <p>Agent Studio</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          <a 
            href="#" 
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={(e) => { e.preventDefault(); setActiveTab('dashboard'); }}
          >
            <LayoutDashboard size={18} />
            <span>New Task</span>
          </a>
          <a 
            href="#" 
            className={`nav-item ${activeTab === 'history' ? 'active' : ''}`}
            onClick={(e) => { e.preventDefault(); setActiveTab('history'); }}
          >
            <History size={18} />
            <span>History</span>
          </a>
          <a 
            href="#" 
            className={`nav-item ${activeTab === 'schedules' ? 'active' : ''}`}
            onClick={(e) => { e.preventDefault(); setActiveTab('schedules'); }}
          >
            <Clock size={18} />
            <span>Schedules</span>
          </a>
          <a 
            href="#" 
            className={`nav-item ${activeTab === 'data' ? 'active' : ''}`}
            onClick={(e) => { e.preventDefault(); setActiveTab('data'); }}
          >
            <Database size={18} />
            <span>Data Vault</span>
          </a>
        </nav>

        <div className="sidebar-footer">
          <a 
            href="#" 
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={(e) => { e.preventDefault(); setShowSettings(true); }}
          >
            <Settings size={18} />
            <span>Settings</span>
          </a>
          <div className="user-profile-mini">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
              <div className="user-avatar">
                 <User size={16} color="#fff" />
              </div>
              <div className="user-info-mini">
                <span className="user-email-mini" style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{email || 'user@example.com'}</span>
                <span className="user-status-mini">
                  <div className={`dot ${connected ? 'active' : 'inactive'}`}></div>
                  {connected ? 'Connected' : 'Offline'}
                </span>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className="logout-btn"
              title="Log out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="main-content">
        {/* Settings Modal */}
        {showSettings && (
          <div className="modal-overlay">
            <div className="auth-box modal-content">
              <div className="auth-logo">
                <Settings size={40} className="auth-icon" />
              </div>
              <h2>Engine Settings</h2>
              <p>Select your LLM provider and API key.</p>
              <form onSubmit={handleSaveConfig} className="auth-form">
                <div className="input-group">
                  <label>Cloud Agent Model</label>
                  <select 
                    value={selectedModel} 
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="auth-input"
                  >
                    <option value="claude-sonnet-4.6">Claude Sonnet 4.6 (Recommended)</option>
                    <option value="claude-opus-4.6">Claude Opus 4.6 (Best Quality)</option>
                    <option value="gpt-5.4-mini">GPT-5.4 Mini (Budget)</option>
                  </select>
                </div>
                <div className="input-group">
                  <label>☁️ Browser Use API Key</label>
                  <input 
                    type="password" 
                    placeholder="bu_..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="auth-input"
                    required
                  />
                  <small style={{ color: '#9ca3af', fontSize: '11px', marginTop: '4px', display: 'block' }}>Get your key at cloud.browser-use.com</small>
                </div>
                <div className="input-group">
                  <label>Browser Profile</label>
                  <input 
                    type="text" 
                    placeholder="e.g. default, linkedin, github"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="auth-input"
                    required
                  />
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                  <button type="button" className="auth-btn secondary" style={{flex: 1, background: 'transparent', border: '1px solid #333'}} onClick={() => setShowSettings(false)}>Cancel</button>
                  <button type="submit" className="auth-btn" style={{flex: 1}}>Save Settings</button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="dashboard-content">
          {/* Dashboard Tab */}
          {activeTab === 'dashboard' && (
            <>
              {/* If no steps are running, show the big centered hero */}
              {steps.length === 0 && !isRunning && (
                <div className="hero-section">
                  <h1 className="hero-title">Qorix AI</h1>
                  <h2 className="hero-subtitle">
                    AI That Uses The Web<br/>
                    <span style={{ color: '#9ca3af' }}>Instead Of Just Talking About It.</span>
                  </h2>
                </div>
              )}

        {/* The main input box */}
        <div className={`input-wrapper ${steps.length > 0 || isRunning ? 'input-active' : ''}`}>
          <form onSubmit={handleStartTask} className="task-form">
            <textarea 
              className="sleek-input" 
              placeholder="Send a message..."
              value={task}
              onChange={(e) => setTask(e.target.value)}
              disabled={isRunning || !connected}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleStartTask(e);
                }
              }}
              rows={2}
            />
            <div className="input-toolbar">
              <div className="toolbar-left">
                <button type="button" className="tool-btn"><Plus size={16}/></button>
                <button 
                  type="button" 
                  className="tool-btn" 
                  onClick={toggleVoiceInput}
                  title="Voice Input"
                  style={{ color: isListening ? '#ef4444' : 'inherit' }}
                >
                  <Mic size={16}/>
                </button>
                <button type="button" className="tool-btn"><User size={16}/></button>
                <button type="button" className="tool-btn"><Database size={16}/></button>
                <button type="button" className="tool-btn"><Globe size={16}/></button>
                
                <div className="model-selector-chip" onClick={() => setShowSettings(true)}>
                  <BrainCircuit size={14} className="model-icon"/>
                  <span>{selectedModel}</span>
                </div>
              </div>
              <div className="toolbar-right">
                <button type="button" className="secondary-action-btn">
                  <Code size={14}/> Get code
                </button>
                {isRunning ? (
                  <button 
                    type="button" 
                    className="primary-action-btn"
                    onClick={handleStopTask}
                    style={{ backgroundColor: '#ef4444', borderColor: '#ef4444' }}
                  >
                    <Square size={16}/> Stop task
                  </button>
                ) : (
                  <button 
                    type="submit" 
                    className="primary-action-btn"
                    disabled={!connected || !task.trim()}
                  >
                    <ArrowUp size={16}/> Run task
                  </button>
                )}
              </div>
            </div>
          </form>
          
          {/* Below Input Integrations & Chips */}
          {steps.length === 0 && !isRunning && (
            <div className="below-input-area">
              <div className="integrations-bar">
                <Link size={14}/> <span>Connect your integrations</span>
              </div>
              <div className="filter-chips">
                <div className="chip"><Clock size={14}/> Scheduled</div>
                <div className="chip"><Link size={14}/> Integrations</div>
                <div className="chip"><ShieldCheck size={14}/> Authenticated</div>
                <div className="chip"><DatabaseZap size={14}/> Extraction</div>
              </div>
            </div>
          )}
        </div>

        {/* Task Execution Area & Live Preview PIP */}
        {(steps.length > 0 || isRunning) && (
          <div className="chat-execution-layout">
            
            {currentPrompt && (
              <div className="chat-bubble-container right">
                <div className="chat-bubble user-bubble">
                  {currentPrompt}
                </div>
              </div>
            )}

            <div className="agent-status-header">
              <Globe size={18} />
              <span className="agent-name">Browser Use</span>
              <span className="agent-model-badge">{selectedModel}</span>
            </div>

            <div className="chat-bubble-container left">
              <div className="chat-bubble agent-bubble">
                <div className="agent-working-status">
                  <CheckCircle2 size={16} /> 
                  <span>{isRunning ? 'Working...' : 'Completed'}</span>
                </div>

                <div className="agent-steps-timeline">
                  {steps.map((step, idx) => {
                    if (step.type === 'status') {
                      return <div key={idx} className="timeline-text">{step.message}</div>;
                    }

                    if (step.type === 'result') {
                      const fileMatches = step.result.match(/(reports|exports)\/[a-zA-Z0-9_.-]+\.(pdf|csv|txt|md|xlsx)/g) || [];

                      return (
                        <div key={idx} className="final-result-markdown">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {step.result}
                          </ReactMarkdown>
                          {fileMatches.length > 0 && (
                            <div className="download-buttons-container" style={{ marginTop: '15px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                              {fileMatches.map((filePath, i) => (
                                <a 
                                  key={i} 
                                  href={`http://localhost:8000/${filePath}`} 
                                  download
                                  target="_blank"
                                  rel="noreferrer"
                                  className="primary-action-btn"
                                  style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: '#3b82f6', color: 'white', borderRadius: '6px' }}
                                >
                                  ⬇️ Download {filePath.split('/').pop()}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    }

                    if (step.type === 'error') {
                      return (
                        <div key={idx} className="timeline-error">
                          <AlertCircle size={14}/> {step.message}
                        </div>
                      );
                    }

                    return (
                      <div key={idx} className="timeline-step">
                        {step.thinking && <div className="timeline-text">{step.thinking}</div>}
                        
                        {step.url && (
                          <div className="navigated-badge">
                            <span className="badge-icon">📍</span>
                            <strong>Navigated</strong> {step.url}
                          </div>
                        )}

                        {step.actions && step.actions.length > 0 && step.actions.map((act, actIdx) => {
                          const actionType = Object.keys(act)[0];
                          if (actionType === 'execute_script') {
                            return <ExpandableCode key={actIdx} code={act[actionType].script} />;
                          }
                          return null;
                        })}
                      </div>
                    );
                  })}
                  
                  {isRunning && (
                    <div className="running-indicator">
                      <Loader2 size={18} className="spin" /> Agent is analyzing...
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Live Browser Cloud URL iframe (Optional Toggle) */}
                {liveUrl && (
                  <div className="live-browser-section" style={{ marginBottom: '20px' }}>
                    <button 
                      type="button"
                      className="secondary-action-btn"
                      onClick={() => setShowLiveBrowser(!showLiveBrowser)}
                      style={{ width: '100%', padding: '12px', background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', border: '1px dashed rgba(59, 130, 246, 0.3)', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
                    >
                      <Globe size={18} />
                      {showLiveBrowser ? "Hide Live Browser" : "👀 Watch Live Browser (Cloud)"}
                    </button>
                    
                    {showLiveBrowser && (
                      <div className="live-browser-wrapper" style={{ marginTop: '15px' }}>
                        <iframe src={liveUrl} className="live-browser-iframe" title="Cloud Browser" allow="clipboard-read; clipboard-write" style={{ width: '100%', height: '400px', border: 'none', borderRadius: '12px' }} />
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>
          </div>
        )}
            </>
          )}

          {/* Placeholders for other tabs */}
          {activeTab === 'history' && (
            <div className="history-tab">
              <div className="vault-header">
                <div className="vault-title">
                  <History size={24} color="#60a5fa" />
                  <h2>Session History</h2>
                </div>
              </div>
              
              {loadingHistory ? (
                <div className="placeholder-tab">
                  <Loader2 size={32} className="spin" color="#4b5563" />
                  <p>Loading history...</p>
                </div>
              ) : historyData.length === 0 ? (
                <div className="placeholder-tab">
                  <History size={48} color="#4b5563" />
                  <h3>No History</h3>
                  <p>Your past agent sessions will appear here.</p>
                </div>
              ) : (
                <div className="history-list">
                  {historyData.map(session => (
                    <div key={session.id} className="history-card" style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <h3 style={{ margin: 0, fontSize: '16px', color: '#fff' }}>{session.task}</h3>
                        <span style={{ fontSize: '12px', color: '#9ca3af' }}>{new Date(session.created_at).toLocaleString()}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                        <span className="agent-model-badge">{session.model}</span>
                        <span className="agent-model-badge" style={{ borderColor: session.status === 'completed' ? '#10b981' : session.status === 'error' ? '#ef4444' : '#f59e0b' }}>
                          {session.status}
                        </span>
                      </div>
                      {session.final_result && (
                        <div className="final-result-markdown" style={{ marginTop: 0, background: '#111' }}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {session.final_result}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {activeTab === 'schedules' && (
            <div className="data-vault-tab">
              <div className="vault-header">
                <div className="vault-title">
                  <Clock size={24} color="#60a5fa" />
                  <h2>Scheduled Tasks</h2>
                </div>
              </div>

              <div className="settings-section" style={{ marginBottom: '20px', background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <form onSubmit={createSchedule}>
                  <div className="input-group">
                    <label>Task Prompt</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Scrape the top Hacker News stories..."
                      value={schedTask}
                      onChange={(e) => setSchedTask(e.target.value)}
                      className="auth-input"
                      required
                    />
                  </div>
                  <div className="input-group" style={{ marginTop: '15px' }}>
                    <label>Interval (Minutes)</label>
                    <input 
                      type="number" 
                      min="1"
                      value={schedInterval}
                      onChange={(e) => setSchedInterval(e.target.value)}
                      className="auth-input"
                      required
                    />
                  </div>
                  <button type="submit" className="primary-action-btn" style={{ marginTop: '15px' }}>
                    Create Schedule
                  </button>
                </form>
              </div>

              {loadingSchedules ? (
                <div className="placeholder-tab">
                  <Loader2 size={32} className="spin" color="#4b5563" />
                  <p>Loading schedules...</p>
                </div>
              ) : schedules.length === 0 ? (
                <div className="placeholder-tab">
                  <Clock size={48} color="#4b5563" />
                  <h3>No schedules</h3>
                  <p>Create a schedule above to run tasks automatically.</p>
                </div>
              ) : (
                <div className="history-list">
                  {schedules.map(sched => (
                    <div key={sched.id} className="history-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1a1a1a', border: '1px solid #333', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
                      <div>
                        <h4 style={{ margin: '0 0 8px 0', color: '#fff' }}>{sched.task}</h4>
                        <div className="history-meta" style={{ display: 'flex', gap: '15px', color: '#9ca3af', fontSize: '12px' }}>
                          <span className="history-model" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><BrainCircuit size={12}/> {sched.model}</span>
                          <span>⏳ Every {sched.interval_minutes} min</span>
                          <span>Created: {new Date(sched.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                      <button 
                        onClick={() => deleteSchedule(sched.id)}
                        style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer' }}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {activeTab === 'data' && (
            <div className="data-vault-tab">
              <div className="vault-header">
                <div className="vault-title">
                  <Database size={24} color="#60a5fa" />
                  <h2>Extracted Data Vault</h2>
                </div>
                <button 
                  className="auth-btn" 
                  onClick={downloadCSV}
                  disabled={vaultData.length === 0}
                  style={{ width: 'auto', padding: '8px 16px', fontSize: '14px', margin: 0 }}
                >
                  Download CSV
                </button>
              </div>

              {loadingVault ? (
                <div className="placeholder-tab">
                  <Loader2 size={32} className="spin" color="#4b5563" />
                  <p>Loading vault...</p>
                </div>
              ) : vaultData.length === 0 ? (
                <div className="placeholder-tab">
                  <Database size={48} color="#4b5563" />
                  <h3>Vault is Empty</h3>
                  <p>Run a task to extract data into SQLite.</p>
                </div>
              ) : (
                <div className="vault-table-container">
                  <table className="vault-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Source URL</th>
                        <th>Content Preview</th>
                        <th>Extracted At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vaultData.map((row) => (
                        <tr key={row.id}>
                          <td>#{row.id}</td>
                          <td className="truncate-cell" title={row.source_url}>{row.source_url}</td>
                          <td className="truncate-cell" title={row.content}>{row.content}</td>
                          <td>{new Date(row.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          
        </div>
      </div>
    </div>
  );
}

export default App;
