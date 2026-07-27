import React from 'react';
import logoImg from '../assets/logo.png';

export default function Logo({ size = 48, showText = true }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '12px' }}>
      <img 
        src={logoImg} 
        alt="Aura AI Logo" 
        style={{ 
          height: `${size}px`,
          width: 'auto',
          maxHeight: `${size}px`,
          objectFit: 'contain'
        }} 
      />
      {showText && (
        <span style={{ 
          fontFamily: 'Outfit, sans-serif', 
          fontWeight: 800, 
          fontSize: `${Math.round(size * 0.5)}px`,
          background: 'linear-gradient(135deg, #00f2fe 0%, #7f00ff 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          letterSpacing: '-0.5px'
        }}>
          Aura AI
        </span>
      )}
    </div>
  );
}
