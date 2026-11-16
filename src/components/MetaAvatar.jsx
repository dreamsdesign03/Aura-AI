import { useState, useMemo } from 'react';

const AVATAR_PALETTE = [
  '#4F46E5', // Indigo
  '#7C3AED', // Purple
  '#DB2777', // Pink
  '#E11D48', // Rose
  '#EA580C', // Orange
  '#D97706', // Amber
  '#059669', // Emerald
  '#0D9488', // Teal
  '#0284C7', // Sky
  '#2563EB', // Blue
  '#6D28D9', // Violet
  '#A4285E', // Aura Magenta
];

function getHashColor(str) {
  if (!str) return '#64748B';
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

function getInitials(name, username) {
  if (username) {
    const cleanUser = String(username).replace(/^@/, '').trim();
    if (cleanUser) return cleanUser.charAt(0).toUpperCase();
  }
  if (!name || name === 'Instagram User' || name === 'Facebook User') {
    return 'U';
  }
  const parts = String(name).trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

export function ChannelBadge({ channel, size = 16 }) {
  const normChannel = String(channel || '').toLowerCase();

  if (normChannel === 'instagram' || normChannel === 'comment_ig') {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 999,
          background: 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '2px solid #FFFFFF',
          boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
          flexShrink: 0,
        }}
        title="Instagram"
      >
        <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/>
          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
          <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
        </svg>
      </div>
    );
  }

  if (normChannel === 'facebook' || normChannel === 'comment_fb' || normChannel === 'messenger') {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 999,
          background: '#0084FF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '2px solid #FFFFFF',
          boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
          flexShrink: 0,
        }}
        title="Messenger"
      >
        {/* Messenger lightning icon */}
        <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="#FFFFFF">
          <path d="M12 2C6.477 2 2 6.145 2 11.258c0 2.912 1.453 5.518 3.734 7.215V22l3.354-1.84c.915.253 1.889.39 2.912.39 5.523 0 10-4.145 10-9.258C22 6.145 17.523 2 12 2zm1.042 12.433l-2.583-2.755-5.042 2.755 5.542-5.882 2.625 2.755 5-2.755-5.542 5.882z" />
        </svg>
      </div>
    );
  }

  if (normChannel === 'whatsapp') {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 999,
          background: '#25D366',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '2px solid #FFFFFF',
          boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
          flexShrink: 0,
        }}
        title="WhatsApp"
      >
        <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="#FFFFFF">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
        </svg>
      </div>
    );
  }

  return null;
}

export function MetaAvatar({
  name,
  username,
  avatarUrl,
  channel,
  size = 40,
  showBadge = true,
  className = "",
  style = {}
}) {
  const [imgError, setImgError] = useState(false);

  const initials = useMemo(() => getInitials(name, username), [name, username]);
  const bgColor = useMemo(() => getHashColor(username || name), [name, username]);
  const badgeSize = Math.max(14, Math.round(size * 0.36));

  const hasValidImage = Boolean(avatarUrl && !imgError);

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        display: 'inline-block',
        ...style,
      }}
    >
      {hasValidImage ? (
        <img
          src={avatarUrl}
          alt={name || username || 'Participant'}
          loading="lazy"
          onError={() => setImgError(true)}
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            objectFit: 'cover',
            display: 'block',
            background: '#F1F5F9',
          }}
        />
      ) : (
        <div
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            background: bgColor,
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: Math.round(size * 0.38),
            letterSpacing: size > 40 ? 0.5 : 0,
            userSelect: 'none',
          }}
        >
          {initials}
        </div>
      )}

      {showBadge && channel && (
        <div
          style={{
            position: 'absolute',
            bottom: -2,
            right: -2,
            zIndex: 2,
          }}
        >
          <ChannelBadge channel={channel} size={badgeSize} />
        </div>
      )}
    </div>
  );
}

export default MetaAvatar;

