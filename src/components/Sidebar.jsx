import React from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Target, 
  Bot, 
  Database, 
  FileText, 
  Sparkles,
  Zap
} from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab }) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'leads', label: 'Lead CRM', icon: Users },
    { id: 'campaigns', label: 'Campaigns & ICPs', icon: Target },
    { id: 'agent-logs', label: 'AI Agent Activity', icon: Bot },
    { id: 'db-explorer', label: 'Neon DB Explorer', icon: Database },
  ];

  return (
    <aside style={{
      width: '260px',
      background: 'rgba(12, 17, 29, 0.9)',
      backdropFilter: 'blur(20px)',
      borderRight: '1px solid rgba(255, 255, 255, 0.08)',
      display: 'flex',
      flexDirection: 'column',
      padding: '24px 16px',
      height: '100vh',
      position: 'sticky',
      top: 0
    }}>
      {/* Brand Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0 8px 28px 8px' }}>
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: '12px',
          background: 'linear-gradient(135deg, #00f2fe 0%, #7f00ff 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 15px rgba(0, 242, 254, 0.4)'
        }}>
          <Sparkles size={22} color="#fff" />
        </div>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.5px' }} className="gradient-text">
            Aura AI
          </h2>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Neon Postgres Engine
          </span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                borderRadius: '10px',
                background: isActive ? 'linear-gradient(90deg, rgba(0, 242, 254, 0.15) 0%, rgba(127, 0, 255, 0.05) 100%)' : 'transparent',
                border: isActive ? '1px solid rgba(0, 242, 254, 0.3)' : '1px solid transparent',
                color: isActive ? '#00f2fe' : 'var(--text-muted)',
                fontWeight: isActive ? 600 : 400,
                fontSize: '14px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease'
              }}
            >
              <Icon size={18} color={isActive ? '#00f2fe' : '#64748b'} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Neon DB Status Footer */}
      <div className="glass-card" style={{ padding: '14px', borderRadius: '12px', background: 'rgba(0, 0, 0, 0.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: '#38ef7d',
            boxShadow: '0 0 10px #38ef7d'
          }} />
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#38ef7d' }}>
            Neon Postgres Live
          </span>
        </div>
        <p style={{ fontSize: '11px', color: 'var(--text-dim)', margin: 0 }}>
          ep-muddy-cell (aws-ap-southeast-1)
        </p>
      </div>
    </aside>
  );
}
