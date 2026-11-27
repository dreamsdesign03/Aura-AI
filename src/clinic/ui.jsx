import { useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { initials } from './api';

export function PageHead({ title, subtitle, children }) {
  return (
    <div className="co-head co-rise">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p className="co-head-sub">{subtitle}</p> : null}
      </div>
      {children ? <div className="co-head-actions">{children}</div> : null}
    </div>
  );
}

export function Card({ children, className = '', flush = false, rise = '' }) {
  return (
    <section className={`co-card ${flush ? 'co-card-flush' : ''} ${rise} ${className}`}>
      {children}
    </section>
  );
}

export function CardHead({ title, hint, children }) {
  return (
    <div className="co-card-hd" style={{ padding: title ? undefined : 0 }}>
      <div>
        <h2>{title}</h2>
        {hint ? <div className="co-hint">{hint}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function Avatar({ first, last, name, size = 'md' }) {
  const label = initials(first || name?.split(' ')[0], last || name?.split(' ')[1]);
  return <span className={`co-avatar ${size === 'lg' ? 'co-avatar-lg' : ''}`}>{label}</span>;
}

const STATUS = {
  booked: ['c-m', 'Booked'],
  confirmed: ['c-p', 'Confirmed'],
  arrived: ['c-g', 'Arrived'],
  in_consult: ['c-o', 'In consult'],
  completed: ['c-n', 'Completed'],
  no_show: ['c-r', 'No show'],
  cancelled: ['c-r', 'Cancelled'],
  open: ['c-o', 'Open'],
  done: ['c-g', 'Done'],
  active: ['c-p', 'Active'],
  draft: ['c-n', 'Draft'],
};

export function StatusChip({ status }) {
  const [cls, label] = STATUS[status] || ['c-n', status || '—'];
  return <span className={`co-chip ${cls}`}>{label}</span>;
}

export function Kpi({ label, value, foot, icon: Icon, badge, color = '#A4285E', bg = '#FDF2F8', border = '#FBCFE8', onClick }) {
  return (
    <div
      className="co-card co-kpi"
      style={{
        cursor: onClick ? 'pointer' : undefined,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        position: 'relative',
        padding: '14px 16px',
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#CB3273';
        e.currentTarget.style.boxShadow = '0 6px 18px -4px rgba(203, 50, 115, 0.12)';
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#F3D9E5';
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(15, 23, 42, 0.03)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#334155' }}>
          {label}
        </span>
        {Icon ? (
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: bg,
              border: `1px solid ${border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: color,
            }}
          >
            <Icon size={15} color={color} />
          </div>
        ) : null}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
        <span
          style={{
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            color: '#0F172A',
            lineHeight: 1,
          }}
        >
          {value}
        </span>
        {badge ? (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#A4285E',
              background: '#FDF2F8',
              border: '1px solid #FBCFE8',
              padding: '2px 7px',
              borderRadius: 999,
            }}
          >
            {badge}
          </span>
        ) : null}
      </div>

      {foot ? (
        <div style={{ fontSize: 12, color: '#475569', fontWeight: 500, marginTop: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {foot}
        </div>
      ) : null}
    </div>
  );
}

export function BarRow({ label, value, max, suffix }) {
  const pct = max > 0 ? Math.max(3, Math.round((value / max) * 100)) : 0;
  return (
    <div className="co-bar-row">
      <span className="co-sm co-mut" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      <span className="co-bar-track"><span className="co-bar-fill" style={{ width: `${pct}%` }} /></span>
      <span className="co-sm co-strong" style={{ textAlign: 'right' }}>{value}{suffix || ''}</span>
    </div>
  );
}

export function EmptyState({ title, children }) {
  return (
    <div className="co-empty">
      <div className="co-empty-title">{title}</div>
      {children}
    </div>
  );
}

export function Spinner({ label }) {
  return (
    <div className="co-empty" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <Loader2 size={20} className="animate-spin" style={{ color: '#A4285E' }} />
      {label ? <span className="co-sm">{label}</span> : null}
    </div>
  );
}

export function Modal({ title, subtitle, onClose, children, width = 560 }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 82,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div className="co-veil" onClick={onClose} role="presentation" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          position: 'relative',
          zIndex: 83,
          width: `min(${width}px, calc(100vw - 24px))`,
          maxHeight: '90dvh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: '#fff',
          borderRadius: 16,
          boxShadow: '0 30px 80px -30px rgba(30, 12, 20, .55)',
          animation: 'coRise .3s cubic-bezier(.22,1,.36,1) both',
        }}
      >
        <div className="co-drawer-hd" style={{ padding: '16px 20px', flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2>{title}</h2>
            {subtitle ? <p className="co-sm co-mut" style={{ marginTop: 4 }}>{subtitle}</p> : null}
          </div>
          <button type="button" className="co-btn co-btn-sm co-icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: '18px 20px 22px', overflowY: 'auto', flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}

export function Drawer({ title, subtitle, onClose, children, actions }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="co-veil" onClick={onClose} role="presentation" />
      <aside className="co-drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="co-drawer-hd">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2>{title}</h2>
            {subtitle ? <p className="co-sm co-mut" style={{ marginTop: 4 }}>{subtitle}</p> : null}
          </div>
          {actions}
          <button type="button" className="co-btn co-btn-sm co-icon-btn" onClick={onClose} aria-label="Close panel">
            <X size={16} />
          </button>
        </div>
        <div className="co-drawer-bd">{children}</div>
      </aside>
    </>
  );
}

export function Tabs({ value, onChange, items, className = '' }) {
  return (
    <div className={`co-pill-tabs ${className}`} role="tablist">
      {items.map((item) => {
        const isActive = value === item.value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`co-pill-tab ${isActive ? 'active on' : ''}`}
            onClick={() => onChange(item.value)}
          >
            {item.icon && <span style={{ display: 'inline-flex', alignItems: 'center' }}>{item.icon}</span>}
            <span>{item.label}</span>
            {item.badge !== undefined && (
              <span className="co-pill-badge">{item.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
