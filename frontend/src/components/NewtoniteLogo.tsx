import React from 'react';

interface NewtoniteLogoProps {
  size?: number;
  className?: string;
  glow?: boolean;
}

export const NewtoniteLogo: React.FC<NewtoniteLogoProps> = ({
  size = 38,
  className = '',
  glow = true,
}) => {
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          width: '100%',
          height: '100%',
          filter: glow ? 'drop-shadow(0 0 16px rgba(99, 102, 241, 0.35))' : 'none',
          transition: 'transform 0.2s ease, filter 0.2s ease',
        }}
      >
        <defs>
          <linearGradient id="navNewtoniteBg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#1e1b4b" />
            <stop offset="60%" stop-color="#0f172a" />
            <stop offset="100%" stop-color="#090d16" />
          </linearGradient>
          <linearGradient id="navNewtoniteBeam" x1="16" y1="14" x2="48" y2="50" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#00f2fe" />
            <stop offset="35%" stop-color="#38bdf8" />
            <stop offset="70%" stop-color="#6366f1" />
            <stop offset="100%" stop-color="#c084fc" />
          </linearGradient>
          <linearGradient id="navNewtoniteLeft" x1="16" y1="16" x2="25" y2="48" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#38bdf8" />
            <stop offset="100%" stop-color="#4f46e5" />
          </linearGradient>
          <linearGradient id="navNewtoniteRight" x1="39" y1="16" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#818cf8" />
            <stop offset="100%" stop-color="#c084fc" />
          </linearGradient>
          <filter id="navNewtoniteGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="2" flood-color="#00f2fe" flood-opacity="0.8" />
          </filter>
        </defs>

        {/* Deep Cosmic Squircle Background */}
        <rect
          x="2"
          y="2"
          width="60"
          height="60"
          rx="16"
          fill="url(#navNewtoniteBg)"
          stroke="rgba(99, 102, 241, 0.45)"
          strokeWidth="1.5"
        />

        {/* Monogram Left Pillar */}
        <path
          d="M16 48V19C16 17.3 17.3 16 19 16H24.5V48H16Z"
          fill="url(#navNewtoniteLeft)"
        />

        {/* Dynamic Force & Prism Beam (F = ma) */}
        <path
          d="M22 16H29L47 43.5V48H40L22 20.5V16Z"
          fill="url(#navNewtoniteBeam)"
        />

        {/* Monogram Right Pillar */}
        <path
          d="M39.5 16H48V45C48 46.7 46.7 48 45 48H39.5V16Z"
          fill="url(#navNewtoniteRight)"
        />

        {/* Quantum Kinetic Particle */}
        <circle
          cx="49"
          cy="15"
          r="3.5"
          fill="#00f2fe"
          filter="url(#navNewtoniteGlow)"
        />
      </svg>
    </div>
  );
};
