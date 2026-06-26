import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';

// Import Icons
import { 
  Home, Search, PlusSquare, MessageSquare, User, 
  Shield, LogOut, Sun, Moon, Bell, CheckCircle
} from 'lucide-react';

// Import Pages
import Onboarding from './pages/Onboarding';
import Feed from './pages/Feed';
import Explore from './pages/Explore';
import CreatePost from './pages/CreatePost';
import Chat from './pages/Chat';
import Profile from './pages/Profile';
import AdminDashboard from './pages/AdminDashboard';

const AppContent = () => {
  const { user, loading, logout, token } = useAuth();
  const [darkMode, setDarkMode] = useState(true);

  useEffect(() => {
    // Apply dark mode class
    if (darkMode) {
      document.body.classList.remove('light-mode');
    } else {
      document.body.classList.add('light-mode');
    }
  }, [darkMode]);

  if (loading) {
    return (
      <div style={loadingContainerStyle}>
        <div style={spinnerStyle}></div>
        <h2 style={{ marginTop: '16px', fontWeight: '400', background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Loading Aura...
        </h2>
      </div>
    );
  }

  // If not logged in, route to auth page
  if (!token || !user) {
    return (
      <Routes>
        <Route path="*" element={<Onboarding />} />
      </Routes>
    );
  }



  return (
    <div style={layoutContainerStyle}>
      {/* Sidebar for Desktop */}
      <aside style={sidebarStyle} className="glass-panel">
        <div style={sidebarLogoStyle}>
          <span style={logoTextStyle}>Aura</span>
        </div>

        <nav style={sidebarNavStyle}>
          <SidebarLink to="/" icon={<Home size={22} />} label="Feed" />
          <SidebarLink to="/explore" icon={<Search size={22} />} label="Explore" />
          <SidebarLink to="/create" icon={<PlusSquare size={22} />} label="Create" />
          <SidebarLink to="/chat" icon={<MessageSquare size={22} />} label="Messages" />
          <SidebarLink to={`/profile/${user.username}`} icon={<User size={22} />} label="Profile" />
          
          {user.username.toLowerCase() === 'admin' && (
            <SidebarLink to="/admin" icon={<Shield size={22} />} label="Admin Panel" />
          )}
        </nav>

        <div style={sidebarFooterStyle}>
          <button onClick={() => setDarkMode(!darkMode)} style={themeToggleStyle}>
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            <span>{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
          
          <button onClick={logout} style={logoutButtonStyle}>
            <LogOut size={20} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main style={mainContentStyle}>
        <Routes>
          <Route path="/" element={<Feed />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/create" element={<CreatePost />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/profile/:username" element={<Profile />} />
          <Route path="/admin" element={user.username.toLowerCase() === 'admin' ? <AdminDashboard /> : <Navigate to="/" />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav style={mobileNavbarStyle} className="glass-panel">
        <MobileNavLink to="/" icon={<Home size={22} />} />
        <MobileNavLink to="/explore" icon={<Search size={22} />} />
        <MobileNavLink to="/create" icon={<PlusSquare size={22} />} />
        <MobileNavLink to="/chat" icon={<MessageSquare size={22} />} />
        <MobileNavLink to={`/profile/${user.username}`} icon={<User size={22} />} />
      </nav>
    </div>
  );
};

// Sub-Component for Sidebar navigation links with active state styling
const SidebarLink = ({ to, icon, label }) => {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link 
      to={to} 
      style={{
        ...sidebarLinkStyle,
        background: isActive ? 'var(--accent-gradient)' : 'transparent',
        color: '#ffffff',
        fontWeight: isActive ? '600' : '400',
        boxShadow: isActive ? '0 4px 12px var(--glow-color)' : 'none',
      }}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
};

// Sub-Component for Mobile Bottom Nav links
const MobileNavLink = ({ to, icon }) => {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link 
      to={to} 
      style={{
        ...mobileNavLinkStyle,
        color: isActive ? 'var(--accent-1)' : 'var(--text-secondary)',
        transform: isActive ? 'scale(1.15)' : 'scale(1)',
      }}
    >
      {icon}
    </Link>
  );
};


// Layout Styles
const loadingContainerStyle = {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  height: '100vh',
  backgroundColor: '#0b0c10',
};

const spinnerStyle = {
  width: '50px',
  height: '50px',
  border: '4px solid rgba(138, 43, 226, 0.15)',
  borderTop: '4px solid var(--accent-1)',
  borderRadius: '50%',
  animation: 'spin 1s linear infinite',
};

// Injected CSS Keyframes for Spinner animation
const styleSheet = document.createElement("style");
styleSheet.innerText = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
document.head.appendChild(styleSheet);

const layoutContainerStyle = {
  display: 'flex',
  minHeight: '100vh',
};

const sidebarStyle = {
  width: '260px',
  position: 'fixed',
  top: '0',
  left: '0',
  bottom: '0',
  display: 'flex',
  flexDirection: 'column',
  padding: '30px 20px',
  borderRadius: '0',
  borderRight: '1px solid var(--card-border)',
  borderLeft: 'none',
  borderTop: 'none',
  borderBottom: 'none',
  background: 'rgba(18, 20, 28, 0.55)',
  zIndex: 100,
};

const sidebarLogoStyle = {
  marginBottom: '40px',
  paddingLeft: '10px',
};

const logoTextStyle = {
  fontFamily: 'Outfit',
  fontWeight: '800',
  fontSize: '28px',
  letterSpacing: '1px',
  background: 'linear-gradient(135deg, #8a2be2 0%, #00ffff 100%)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
};

const sidebarNavStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  flex: 1,
};

const sidebarLinkStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
  padding: '12px 18px',
  borderRadius: '12px',
  textDecoration: 'none',
  fontSize: '16px',
  transition: 'all 0.25s ease',
};

const sidebarFooterStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
};

const themeToggleStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
  padding: '12px 18px',
  color: 'var(--text-secondary)',
  fontSize: '15px',
  borderRadius: '12px',
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'var(--transition)',
};

const logoutButtonStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
  padding: '12px 18px',
  color: '#ff4757',
  fontSize: '15px',
  borderRadius: '12px',
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'var(--transition)',
};

const mainContentStyle = {
  flex: 1,
  marginLeft: '260px', // matches sidebar width
  padding: '40px 30px',
  minHeight: '100vh',
  width: 'calc(100% - 260px)',
  backgroundColor: 'var(--bg-primary)',
};

const mobileNavbarStyle = {
  display: 'none', // hidden by default on desktop
  position: 'fixed',
  bottom: '0',
  left: '0',
  right: '0',
  height: '65px',
  background: 'rgba(18, 20, 28, 0.85)',
  borderTop: '1px solid var(--card-border)',
  borderLeft: 'none',
  borderRight: 'none',
  borderBottom: 'none',
  borderRadius: '0',
  alignItems: 'center',
  justifyContent: 'space-around',
  padding: '0 10px',
  zIndex: 1000,
};

const mobileNavLinkStyle = {
  padding: '10px 20px',
  transition: 'var(--transition)',
};

// Media Queries handling in CSS styles injection
const responsiveStyles = document.createElement("style");
responsiveStyles.innerText = `
  @media (max-width: 768px) {
    aside {
      display: none !important;
    }
    main {
      margin-left: 0 !important;
      padding: 20px 15px 85px 15px !important;
      width: 100% !important;
    }
    nav.glass-panel {
      display: flex !important;
    }
  }
`;
document.head.appendChild(responsiveStyles);


export default function App() {
  return (
    <Router>
      <AuthProvider>
        <SocketProvider>
          <AppContent />
        </SocketProvider>
      </AuthProvider>
    </Router>
  );
}
