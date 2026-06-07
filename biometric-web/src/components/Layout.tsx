import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Shield, Settings, Bell, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Layout = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#f6d32d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-scan-face-icon lucide-scan-face">
              <path d="M3 7V5a2 2 0 0 1 2-2h2"/>
              <path d="M17 3h2a2 2 0 0 1 2 2v2"/>
              <path d="M21 17v2a2 2 0 0 1-2 2h-2"/>
              <path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
              <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
              <path d="M9 9h.01"/>
              <path d="M15 9h.01"/>
            </svg>
          </div>
          Aegis Admin
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
          <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end>
            <LayoutDashboard size={20} />
            Live Feed
          </NavLink>
          <NavLink to="/users" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Users size={20} />
            Users & Identity
          </NavLink>
          <NavLink to="/security" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Shield size={20} />
            Security & Hardware
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Settings size={20} />
            System Config
          </NavLink>
        </nav>

        <div style={{ marginTop: 'auto', borderTop: '1px solid var(--color-hairline)', paddingTop: '16px' }}>
          <button onClick={handleSignOut} className="nav-link" style={{ width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
            <LogOut size={20} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <header className="topbar">
          <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Operations Center</h2>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', position: 'relative' }}>
              <Bell size={20} />
              <span style={{ position: 'absolute', top: '-2px', right: '-2px', width: '8px', height: '8px', background: 'var(--color-error)', borderRadius: '50%' }}></span>
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--color-primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.875rem', fontWeight: 600 }}>
                {user?.email?.charAt(0).toUpperCase() || 'A'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-charcoal)' }}>{user?.email || 'Admin User'}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>Superadmin</span>
              </div>
            </div>
          </div>
        </header>

        <div className="page-content fade-in">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
