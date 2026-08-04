import React from 'react';
import { Search, Bell, Database, RefreshCw, Plus } from 'lucide-react';

export default function Navbar({ onOpenAddModal, dbStatus, onRefresh }) {
  return (
    <header style={{
      height: '70px',
      borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
      background: 'rgba(10, 14, 23, 0.6)',
      backdropFilter: 'blur(12px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 32px',
      position: 'sticky',
      top: 0,
      zIndex: 100
    }}>
      {/* Search Input */}
      <div style={{ position: 'relative', width: '380px' }}>
        <Search size={16} color="var(--text-dim)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
        <input 
          type="text" 
          placeholder="Search leads, companies, campaigns, or tables..." 
          className="input-field"
          style={{ paddingLeft: '40px', height: '40px', borderRadius: '20px' }}
        />
      </div>

      {/* Right Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* DB Connection Badge */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 14px',
          borderRadius: '20px',
          background: 'rgba(203, 50, 115, 0.08)',
          border: '1px solid rgba(203, 50, 115, 0.25)',
          fontSize: '12px',
          color: '#E15C94'
        }}>
          <Database size={14} />
          <span>{dbStatus ? 'neondb (Connected)' : 'Connecting...'}</span>
        </div>

        <button className="btn-icon" onClick={onRefresh} title="Refresh Data">
          <RefreshCw size={16} />
        </button>

        <button className="btn-primary" onClick={onOpenAddModal}>
          <Plus size={16} />
          <span>New Lead</span>
        </button>
      </div>
    </header>
  );
}
