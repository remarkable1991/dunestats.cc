export type TierName = "Bronze" | "Silver" | "Gold" | "Platinum" | string;

/**
 * Metallic rank emblems drawn as inline SVG so they scale crisply and
 * stay theme-independent (pure metal gradients, no semantic tokens needed).
 */
export function RankEmblem({
  tier,
  size = 28,
  muted = false,
  className = "",
}: {
  tier: TierName;
  size?: number;
  muted?: boolean;
  className?: string;
}) {
  const uid = `${tier}-${size}`;
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 64 64",
    className: `${muted ? "opacity-50 saturate-50" : ""} ${className}`,
    "aria-hidden": true as const,
  };

  if (tier === "Bronze") {
    return (
      <svg {...common}>
        <defs>
          <radialGradient id={`b1-${uid}`} cx="35%" cy="28%" r="75%">
            <stop offset="0%" stopColor="#f5c78a" />
            <stop offset="45%" stopColor="#c87f30" />
            <stop offset="100%" stopColor="#6b3a12" />
          </radialGradient>
        </defs>
        <circle cx="32" cy="32" r="26" fill={`url(#b1-${uid})`} stroke="#8a5220" strokeWidth="2.5" />
        <circle cx="32" cy="32" r="19" fill="none" stroke="#f0b877" strokeOpacity="0.45" strokeWidth="1.5" />
        {/* 4-point lens flare, top-right */}
        <path
          d="M43 20 L45.4 26.6 L52 29 L45.4 31.4 L43 38 L40.6 31.4 L34 29 L40.6 26.6 Z"
          fill="#fff6e5"
          opacity="0.9"
        />
      </svg>
    );
  }

  if (tier === "Silver") {
    return (
      <svg {...common}>
        <defs>
          <linearGradient id={`s1-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="50%" stopColor="#cbd5e1" />
            <stop offset="100%" stopColor="#64748b" />
          </linearGradient>
          <linearGradient id={`s2-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e2f6ff" />
            <stop offset="100%" stopColor="#94a3b8" />
          </linearGradient>
        </defs>
        {/* 3-feather wings each side */}
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <path
              d={`M30 ${30 + i * 6} L${12 - i * 3} ${26 + i * 7} L30 ${34 + i * 6} Z`}
              fill={`url(#s2-${uid})`}
              opacity={0.9 - i * 0.18}
            />
            <path
              d={`M34 ${30 + i * 6} L${52 + i * 3} ${26 + i * 7} L34 ${34 + i * 6} Z`}
              fill={`url(#s2-${uid})`}
              opacity={0.9 - i * 0.18}
            />
          </g>
        ))}
        {/* faceted diamond gem */}
        <path d="M32 8 L46 28 L32 54 L18 28 Z" fill={`url(#s1-${uid})`} stroke="#475569" strokeWidth="1.6" />
        <path d="M32 8 L32 54 M18 28 L46 28" stroke="#f1f5f9" strokeOpacity="0.55" strokeWidth="1.2" />
        <path d="M32 8 L24 28 L32 54 Z" fill="#ffffff" opacity="0.22" />
      </svg>
    );
  }

  if (tier === "Gold") {
    return (
      <svg {...common}>
        <defs>
          <linearGradient id={`g1-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fde68a" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#b45309" />
          </linearGradient>
        </defs>
        {/* wing backdrop */}
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <path d={`M28 ${34 + i * 5} L${10 - i * 2} ${30 + i * 6} L28 ${38 + i * 5} Z`} fill="#fbbf24" opacity={0.75 - i * 0.18} />
            <path d={`M36 ${34 + i * 5} L${54 + i * 2} ${30 + i * 6} L36 ${38 + i * 5} Z`} fill="#fbbf24" opacity={0.75 - i * 0.18} />
          </g>
        ))}
        {/* crown */}
        <path d="M20 20 L26 12 L32 19 L38 12 L44 20 L42 24 L22 24 Z" fill={`url(#g1-${uid})`} stroke="#92400e" strokeWidth="1.4" />
        {/* hexagon */}
        <path d="M32 26 L46 34 L46 48 L32 56 L18 48 L18 34 Z" fill={`url(#g1-${uid})`} stroke="#92400e" strokeWidth="1.8" />
        <path d="M32 26 L18 34 L18 48 L32 41 Z" fill="#ffffff" opacity="0.18" />
      </svg>
    );
  }

  // Platinum
  return (
    <svg {...common}>
      <defs>
        <linearGradient id={`p1-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ecfeff" />
          <stop offset="45%" stopColor="#99f6e4" />
          <stop offset="100%" stopColor="#0891b2" />
        </linearGradient>
      </defs>
      {/* winged crest */}
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <path d={`M28 ${36 + i * 5} L${9 - i * 2} ${32 + i * 6} L28 ${40 + i * 5} Z`} fill="#67e8f9" opacity={0.7 - i * 0.16} />
          <path d={`M36 ${36 + i * 5} L${55 + i * 2} ${32 + i * 6} L36 ${40 + i * 5} Z`} fill="#67e8f9" opacity={0.7 - i * 0.16} />
        </g>
      ))}
      {/* icy multi-point crown */}
      <path d="M18 22 L23 12 L28 19 L32 9 L36 19 L41 12 L46 22 L44 26 L20 26 Z" fill={`url(#p1-${uid})`} stroke="#0e7490" strokeWidth="1.3" />
      {/* faceted pentagon gem */}
      <path d="M32 28 L48 39 L42 56 L22 56 L16 39 Z" fill={`url(#p1-${uid})`} stroke="#0e7490" strokeWidth="1.8" />
      <path d="M32 28 L16 39 L22 56 L32 42 Z" fill="#ffffff" opacity="0.25" />
      <path d="M32 28 L32 42 L42 56 M16 39 L32 42 L48 39" stroke="#ecfeff" strokeOpacity="0.6" strokeWidth="1" fill="none" />
    </svg>
  );
}
