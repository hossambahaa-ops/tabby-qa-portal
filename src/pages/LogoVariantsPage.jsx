import React from "react";

const GREEN = "#3BFF9D";
const GREEN_DEEP = "#1F7A4D";
const VIOLET = "#6A2C79";

/* ════════════════════════════════════════════════════════════════════
   1. Green Ring + Sharp Zigzag  (replicates image #1)
   Black bg, thick green circle ring, inside a white sharp angular
   zigzag mark. Motion: ring breathes + zigzag has a subtle pulse.
   ════════════════════════════════════════════════════════════════════ */
function R1_RingZigzag({ size = 140 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200">
      <rect width="200" height="200" rx="8" fill="#0a0a0a" />
      {/* outer ring */}
      <circle cx="100" cy="100" r="74" stroke={GREEN} strokeWidth="9" fill="none">
        <animate attributeName="r" values="74;76;74" dur="2.4s" repeatCount="indefinite" />
        <animate attributeName="stroke-width" values="9;10;9" dur="2.4s" repeatCount="indefinite" />
      </circle>
      {/* inside dark fill */}
      <circle cx="100" cy="100" r="70" fill="#0a0a0a" />
      {/* angular zigzag mark — replicates the white spike inside */}
      <g>
        <path d="M55 110
                 L72 110
                 L82 80
                 L92 130
                 L102 70
                 L114 130
                 L124 80
                 L134 110
                 L145 110
                 L145 118
                 L130 118
                 L120 145
                 L108 80
                 L98 145
                 L86 80
                 L76 145
                 L66 118
                 L55 118
                 Z"
              fill="#fff" stroke="#fff" strokeWidth="2"
              strokeLinejoin="miter">
          <animate attributeName="opacity" values="0.92;1;0.92"
                   dur="1.4s" repeatCount="indefinite" />
        </path>
      </g>
    </svg>
  );
}

/* ════════════════════════════════════════════════════════════════════
   2. Gradient P App Icon  (replicates image #2)
   Rounded square with gradient border + matching gradient "p" inside
   with a flag-like pointed descender. Brand-color gradient
   (green → teal → violet). Motion: gradient slowly rotates.
   ════════════════════════════════════════════════════════════════════ */
function R2_GradientP({ size = 140 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200">
      <defs>
        <linearGradient id="r2-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6A2C79">
            <animate attributeName="stop-color"
                     values="#6A2C79;#3BFF9D;#22D3EE;#6A2C79"
                     dur="6s" repeatCount="indefinite" />
          </stop>
          <stop offset="50%" stopColor="#22D3EE">
            <animate attributeName="stop-color"
                     values="#22D3EE;#6A2C79;#3BFF9D;#22D3EE"
                     dur="6s" repeatCount="indefinite" />
          </stop>
          <stop offset="100%" stopColor="#3BFF9D">
            <animate attributeName="stop-color"
                     values="#3BFF9D;#22D3EE;#6A2C79;#3BFF9D"
                     dur="6s" repeatCount="indefinite" />
          </stop>
        </linearGradient>
      </defs>
      {/* dark rounded square with gradient border */}
      <rect x="6" y="6" width="188" height="188" rx="42"
            fill="#0a0a0a" stroke="url(#r2-grad)" strokeWidth="9" />
      {/* lowercase "p": round bowl + thick stem ending in flag point */}
      <path d="M70 56
               Q70 36 95 36
               Q130 36 130 70
               Q130 104 95 104
               Q82 104 76 100
               L76 156
               L60 168
               L60 70
               Q60 56 70 56
               Z"
            fill="url(#r2-grad)" />
      {/* hollow inside the bowl */}
      <ellipse cx="98" cy="70" rx="16" ry="16" fill="#0a0a0a" />
    </svg>
  );
}

/* ════════════════════════════════════════════════════════════════════
   3. Pulse Wordmark  (inspired by image #3)
   Professional sans-serif "Pu" + EKG-as-'l' + "se".
   Only the EKG spike animates, slow and smooth, in tabby violet.
   Background: layered radial gradients + dot grid + soft glow blobs.
   ════════════════════════════════════════════════════════════════════ */
function R3_PulseWordmark({ size = 140 }) {
  const w = size * 4, h = size;
  // Matches the existing app header: "tabby" white + "Pulse" in
  // green→violet gradient — but the lowercase "l" in "Pulse" is
  // replaced by the animated EKG.
  const FONT = "'Inter','SF Pro Display','SF Pro Text',-apple-system,BlinkMacSystemFont,system-ui,sans-serif";
  const VIOLET_BRIGHT = "#C084FC";
  const VIOLET_DIM    = "#6A2C79";
  // EKG sits where the "l" would be — centered around x≈325.
  const EKG = "M298 72 L304 72 L310 62 L316 72 L323 38 L332 110 L340 62 L346 72 L352 72";
  return (
    <svg width={w} height={h} viewBox="0 0 560 140" style={{ display: "block" }}>
      <defs>
        <linearGradient id="r3-pulse-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"  stopColor="#3BFF9D" />
          <stop offset="100%" stopColor="#6A2C79" />
        </linearGradient>
        <filter id="r3-pulse-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* "tabby" — white */}
      <text x="20" y="100" fontFamily={FONT} fontSize="78" fontWeight="600"
            fill="#fff" letterSpacing="-3">tabby</text>
      {/* "Pu" — gradient */}
      <text x="208" y="100" fontFamily={FONT} fontSize="78" fontWeight="600"
            fill="url(#r3-pulse-grad)" letterSpacing="-3">Pu</text>
      {/* "se" — gradient, flush after EKG slot */}
      <text x="356" y="100" fontFamily={FONT} fontSize="78" fontWeight="600"
            fill="url(#r3-pulse-grad)" letterSpacing="-3">se</text>

      {/* EKG dim baseline */}
      <path d={EKG} stroke={VIOLET_DIM} strokeWidth="7"
            strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.55" />

      {/* Smooth violet pulse — slow + glow */}
      <path d={EKG} pathLength="100" stroke={VIOLET_BRIGHT} strokeWidth="7"
            strokeLinecap="round" strokeLinejoin="round" fill="none"
            strokeDasharray="26 100"
            filter="url(#r3-pulse-glow)">
        <animate attributeName="stroke-dashoffset"
                 from="26" to="-100"
                 dur="2.4s"
                 repeatCount="indefinite" />
      </path>
    </svg>
  );
}

/* ════════════════════════════════════════════════════════════════════
   4. Pulse Fitness  (replicates image #4 — italic + EKG + dot)
   Italic bold "Pulse" with "Fitness" tracked subscript. Long EKG
   line behind ending in a glowing GREEN dot (was orange).
   Motion: dot pulses, EKG has a traveling green segment.
   ════════════════════════════════════════════════════════════════════ */
function R4_PulseFitness({ size = 140 }) {
  const w = size * 3.2, h = size;
  const EKG = "M20 70 L80 70 L94 70 L102 42 L116 100 L128 32 L140 70 L380 70";
  return (
    <svg width={w} height={h} viewBox="0 0 400 140">
      <rect width="400" height="140" fill="#0a0a0a" />
      <defs>
        <filter id="r4-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {/* dim base EKG line */}
      <path d={EKG} stroke="#fff" strokeWidth="3" strokeLinecap="round"
            strokeLinejoin="round" fill="none" opacity="0.85" />
      {/* traveling green segment along the EKG */}
      <path d={EKG} pathLength="100" stroke={GREEN} strokeWidth="3.5"
            strokeLinecap="round" strokeLinejoin="round" fill="none"
            strokeDasharray="14 100">
        <animate attributeName="stroke-dashoffset" from="0" to="-114"
                 dur="3s" repeatCount="indefinite" />
      </path>
      {/* glowing terminator dot */}
      <circle cx="380" cy="70" r="7" fill={GREEN} filter="url(#r4-glow)">
        <animate attributeName="r" values="6;9;6" dur="1.4s" repeatCount="indefinite" />
      </circle>
      {/* "Pulse" italic bold */}
      <text x="160" y="76" fontFamily="ui-sans-serif, -apple-system, system-ui"
            fontSize="52" fontWeight="800" fontStyle="italic" fill="#fff"
            letterSpacing="-1">Pulse</text>
      {/* "Tabby" tracked subscript */}
      <text x="162" y="100" fontFamily="ui-sans-serif, -apple-system, system-ui"
            fontSize="14" fontWeight="500" fontStyle="italic" fill="#fff"
            letterSpacing="4" opacity="0.85">Tabby</text>
    </svg>
  );
}

/* ════════════════════════════════════════════════════════════════════
   5. Flag-style P  (replicates image #5)
   Bold "P" with curved flag silhouette. Two-tone green gradient
   (lighter top, darker bottom) with a horizontal split.
   Motion: a bright shimmer slides through the form.
   ════════════════════════════════════════════════════════════════════ */
function R5_FlagP({ size = 140 }) {
  // The reference P: tall stem on left, large rounded bowl that flares
  // out on top-right, a horizontal split halfway through the bowl,
  // and a leaf-shaped curve at the bottom of the stem.
  const P_TOP = "M50 30 L50 100 L130 100 Q160 100 160 65 Q160 30 130 30 Z";
  const P_BOT = "M50 100 L50 170 Q60 180 70 170 L70 130 L100 130 Q120 130 120 110 Q120 100 110 100 Z";
  return (
    <svg width={size} height={size} viewBox="0 0 200 200">
      <rect width="200" height="200" rx="12" fill="#0a0a0a" />
      <defs>
        <linearGradient id="r5-top" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5EEAB0" />
          <stop offset="100%" stopColor="#3BFF9D" />
        </linearGradient>
        <linearGradient id="r5-bot" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3BFF9D" />
          <stop offset="100%" stopColor="#1F7A4D" />
        </linearGradient>
        <linearGradient id="r5-shine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="50%" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id="r5-clip">
          <path d={P_TOP} />
          <path d={P_BOT} />
        </clipPath>
      </defs>
      {/* top half — lighter */}
      <path d={P_TOP} fill="url(#r5-top)" />
      {/* bottom half — deeper */}
      <path d={P_BOT} fill="url(#r5-bot)" />
      {/* shimmer */}
      <g clipPath="url(#r5-clip)">
        <rect x="-80" y="0" width="80" height="200" fill="url(#r5-shine)">
          <animate attributeName="x" from="-80" to="220" dur="3.2s" repeatCount="indefinite" />
        </rect>
      </g>
    </svg>
  );
}

/* ════════════════════════════════════════════════════════════════════ */
const VARIANTS = [
  { id: "ring",     ref: "ref #1", name: "Green Ring + Zigzag", note: "Thick green circle ring + sharp white zigzag inside",   Comp: R1_RingZigzag,   wide: false },
  { id: "gradient", ref: "ref #2", name: "Gradient P Icon",     note: "Rounded square + animated gradient border 'p'",         Comp: R2_GradientP,    wide: false },
  { id: "wordmark", ref: "ref #3", name: "Pulse Monoline",      note: "Geometric green 'pulse' with built-in heartbeat dip",   Comp: R3_PulseWordmark, wide: true },
  { id: "underline", ref: "ref #4", name: "Pulse + EKG + Dot",  note: "Italic 'Pulse' wordmark + EKG line + glowing green dot", Comp: R4_PulseFitness, wide: true },
  { id: "flagp",    ref: "ref #5", name: "Flag-style P",        note: "Bold split-tone P with shimmer (green gradient)",       Comp: R5_FlagP,        wide: false },
];

export default function LogoVariantsPage() {
  return (
    <div style={{ padding: "32px 20px 60px", maxWidth: 1200, margin: "0 auto", color: "#fff", background: "#000", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 6 }}>Logo variations</h1>
      <p style={{ opacity: 0.65, marginBottom: 32, fontSize: 14 }}>
        Five marks inspired by your reference images — same visual language, brand palette swapped in, each with subtle motion. Tell me an id to adopt.
      </p>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
        gap: 20,
      }}>
        {VARIANTS.map(({ id, ref, name, note, Comp, wide }) => (
          <div key={id} style={{
            background: "#0f1419",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 16,
            padding: 24,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
            gridColumn: wide ? "span 2" : "span 1",
          }}>
            <div style={{
              width: "100%",
              height: 220,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#000",
              border: "1px solid rgba(255,255,255,0.04)",
              borderRadius: 12,
              padding: 16,
            }}>
              <Comp size={wide ? 130 : 160} />
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{name} <span style={{ opacity: 0.4, fontWeight: 400, fontSize: 12 }}>· {ref}</span></div>
              <div style={{ fontSize: 12, opacity: 0.55, marginTop: 4 }}>{note}</div>
              <div style={{
                fontSize: 11, opacity: 0.4, marginTop: 8,
                fontFamily: "ui-monospace, monospace",
              }}>id: {id}</div>
            </div>
            <div style={{
              display: "flex", gap: 18, alignItems: "center",
              paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)",
              width: "100%", justifyContent: "center",
            }}>
              <Comp size={wide ? 70 : 32} />
              <Comp size={wide ? 100 : 56} />
              <Comp size={wide ? 140 : 80} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
