export default function LiquidityReactor() {
  return (
    <div style={{ animation: 'float 14s ease-in-out infinite' }}>
      <svg
        width="400"
        height="460"
        viewBox="0 0 400 460"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Sphere gradient — faked 3D highlight */}
          <radialGradient id="sg" cx="32%" cy="28%" r="65%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="55%" stopColor="#D6D6D6" />
            <stop offset="100%" stopColor="#B8B8B8" />
          </radialGradient>

          {/* Core disc gradient */}
          <radialGradient id="core" cx="38%" cy="33%" r="70%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="55%" stopColor="#EFEFEF" />
            <stop offset="100%" stopColor="#DEDEDE" />
          </radialGradient>

          {/* Center node gradient */}
          <radialGradient id="node" cx="35%" cy="30%" r="65%">
            <stop offset="0%" stopColor="#E8E8E8" />
            <stop offset="100%" stopColor="#B4B4B4" />
          </radialGradient>

          {/* Pedestal tier gradient */}
          <radialGradient id="ped" cx="50%" cy="25%" r="70%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#DEDEDE" />
          </radialGradient>

          {/* Sphere drop shadow */}
          <filter id="sf" x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="1.5" dy="3" stdDeviation="3.5" floodColor="rgba(0,0,0,0.13)" />
          </filter>

          {/* Core disc shadow */}
          <filter id="cf" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="8" stdDeviation="16" floodColor="rgba(0,0,0,0.12)" />
          </filter>

          {/* Portal ring shadow */}
          <filter id="pf" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="6" stdDeviation="12" floodColor="rgba(0,0,0,0.08)" />
          </filter>
        </defs>

        {/* ── Floating spheres ───────────────────────────── */}
        {/* Far left, mid-height */}
        <circle cx="38" cy="230" r="22" fill="url(#sg)" filter="url(#sf)" />
        {/* Top left */}
        <circle cx="72" cy="100" r="13" fill="url(#sg)" filter="url(#sf)" />
        {/* Top center-left */}
        <circle cx="148" cy="44" r="10" fill="url(#sg)" filter="url(#sf)" />
        {/* Top right */}
        <circle cx="320" cy="70" r="16" fill="url(#sg)" filter="url(#sf)" />
        {/* Far right, upper */}
        <circle cx="372" cy="160" r="11" fill="url(#sg)" filter="url(#sf)" />
        {/* Far right, lower */}
        <circle cx="360" cy="290" r="19" fill="url(#sg)" filter="url(#sf)" />
        {/* Bottom left */}
        <circle cx="84" cy="340" r="14" fill="url(#sg)" filter="url(#sf)" />
        {/* Tiny accent near top */}
        <circle cx="255" cy="32" r="7" fill="url(#sg)" filter="url(#sf)" />

        {/* ── Portal outer ring ──────────────────────────── */}
        <circle
          cx="200"
          cy="205"
          r="132"
          stroke="#D0D0D0"
          strokeWidth="1.5"
          fill="rgba(252,252,252,0.5)"
          filter="url(#pf)"
        />

        {/* ── Orbital rings (2D rotated ellipses = orbit feel) */}
        {/* Ring 1 */}
        <g style={{ transformOrigin: '200px 205px', animation: 'spinOrbit 28s linear infinite' }}>
          <ellipse cx="200" cy="205" rx="130" ry="36" stroke="#CFCFCF" strokeWidth="1.2" fill="none" />
        </g>
        {/* Ring 2 — counter-rotate, different aspect ratio */}
        <g style={{ transformOrigin: '200px 205px', animation: 'spinOrbit 20s linear infinite reverse' }}>
          <ellipse cx="200" cy="205" rx="130" ry="22" stroke="#CFCFCF" strokeWidth="0.8" fill="none" strokeDasharray="4 6" />
        </g>
        {/* Ring 3 — slow outer accent */}
        <g style={{ transformOrigin: '200px 205px', animation: 'spinOrbit 40s linear infinite' }}>
          <ellipse cx="200" cy="205" rx="130" ry="12" stroke="#CFCFCF" strokeWidth="0.5" fill="none" />
        </g>

        {/* ── Core disc ──────────────────────────────────── */}
        <circle cx="200" cy="205" r="82" fill="url(#core)" filter="url(#cf)" />

        {/* Subtle inner ring on core */}
        <circle cx="200" cy="205" r="82" stroke="#E0E0E0" strokeWidth="1" fill="none" />

        {/* Inner highlight arc (top-left) */}
        <path
          d="M 148 160 A 65 65 0 0 1 252 160"
          stroke="rgba(255,255,255,0.9)"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
        />

        {/* Center node */}
        <circle cx="200" cy="205" r="18" fill="url(#node)" />
        <circle cx="200" cy="205" r="18" stroke="#C8C8C8" strokeWidth="0.8" fill="none" />
        {/* Inner dot */}
        <circle cx="200" cy="205" r="6" fill="#C0C0C0" />

        {/* ── Pedestal — 3 stacked tiers ─────────────────── */}
        {/* Top tier */}
        <rect x="157" y="327" width="86" height="14" rx="7" fill="url(#ped)" />
        <ellipse cx="200" cy="341" rx="43" ry="6" fill="#D8D8D8" opacity="0.5" />

        {/* Middle tier */}
        <rect x="136" y="342" width="128" height="17" rx="8.5" fill="url(#ped)" />
        <ellipse cx="200" cy="359" rx="64" ry="7" fill="#D0D0D0" opacity="0.45" />

        {/* Bottom tier — widest */}
        <rect x="112" y="360" width="176" height="20" rx="10" fill="url(#ped)" />
        <ellipse cx="200" cy="380" rx="88" ry="9" fill="#C8C8C8" opacity="0.35" />

        {/* Ground shadow / contact shadow */}
        <ellipse cx="200" cy="392" rx="96" ry="10" fill="rgba(0,0,0,0.06)" />

        {/* ── Connecting dots on orbital rings ───────────── */}
        <circle cx="200" cy="73" r="4" fill="#CFCFCF" />
        <circle cx="200" cy="337" r="4" fill="#CFCFCF" />
        <circle cx="68" cy="205" r="4" fill="#CFCFCF" />
        <circle cx="332" cy="205" r="4" fill="#CFCFCF" />
      </svg>
    </div>
  )
}
