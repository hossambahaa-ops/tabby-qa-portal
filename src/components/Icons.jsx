import React from "react";

export const Icon=({d,size=20,color="currentColor",className,style})=>(<svg className={className} style={style} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>);
export const icons={
  dashboard:"M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1",
  leaderboard:"M16 8v8m-8-4v4m4-12v12M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
  dam:"M12 9v2m0 4h.01M5.07 19H19a2 2 0 001.75-2.97L13.75 4a2 2 0 00-3.5 0L3.32 16.03A2 2 0 005.07 19z",
  plan:"M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  coaching:"M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z",
  hr:"M17 20h5v-2a3 3 0 00-5.36-1.81M17 20H7m10 0v-2c0-.66-.13-1.29-.36-1.86M7 20H2v-2a3 3 0 015.36-1.81M7 20v-2c0-.66.13-1.29.36-1.86m0 0A5.97 5.97 0 0112 14c1.66 0 3.18.68 4.28 1.78M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
  escalation:"M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm0 0h12",
  settings:"M10.33 3.94c.09-.56.6-.94 1.17-.94h1c.57 0 1.08.38 1.17.94l.14.84c.08.49.4.88.84 1.1.13.07.26.14.38.22.44.28.97.34 1.44.12l.8-.28c.54-.19 1.13.02 1.41.5l.5.87c.29.48.18 1.1-.25 1.45l-.66.56c-.38.32-.56.8-.52 1.28.01.15.01.3 0 .44-.04.49.14.96.52 1.28l.66.56c.43.36.54.97.25 1.45l-.5.87c-.28.48-.87.69-1.41.5l-.8-.28c-.47-.17-1-.1-1.44.12-.12.08-.25.15-.38.22-.44.22-.76.61-.84 1.1l-.14.84c-.09.56-.6.94-1.17.94h-1c-.57 0-1.08-.38-1.17-.94l-.14-.84c-.08-.49-.4-.88-.84-1.1-.13-.07-.26-.14-.38-.22-.44-.28-.97-.34-1.44-.12l-.8.28c-.54.19-1.13-.02-1.41-.5l-.5-.87c-.29-.48-.18-1.1.25-1.45l.66-.56c.38-.32.56-.8.52-1.28-.01-.15-.01-.3 0-.44.04-.49-.14-.96-.52-1.28l-.66-.56c-.43-.36-.54-.97-.25-1.45l.5-.87c.28-.48.87-.69 1.41-.5l.8.28c.47.17 1 .1 1.44-.12.12-.08.25-.15.38-.22.44-.22.76-.61.84-1.1l.14-.84zM14 12a2 2 0 11-4 0 2 2 0 014 0z",
  logout:"M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1",
  menu:"M4 6h16M4 12h16M4 18h16",
  upload:"M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12",
  plus:"M12 4v16m8-8H4",
  scores:"M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  check:"M5 13l4 4L19 7",
  edit:"M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
  trash:"M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
  // Three-column board / Kanban — used by /tracker.
  tracker:"M5 4h3a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1zm6 0h3a1 1 0 011 1v8a1 1 0 01-1 1h-3a1 1 0 01-1-1V5a1 1 0 011-1zm6 0h3a1 1 0 011 1v5a1 1 0 01-1 1h-3a1 1 0 01-1-1V5a1 1 0 011-1z",
  // ── Sidebar-only glyphs ────────────────────────────────────────────
  // Added 2026-05-17 so every nav item has its own unique symbol.
  // Keep the existing keys above untouched — they're referenced by
  // buttons, headers, and modals across the app.
  // Podium 1-2-3 (Leaderboard).
  podium:"M3 22V15h5v7zM10 22V9h5v13zM17 22v-4h5v4z",
  // Four-point "north star" — Quality DNA (vision/values).
  northstar:"M12 3l1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8L12 3z",
  // ID card with head + shoulders + two text lines (QA Profile).
  profile:"M3 5h18v14H3zM9 12a2 2 0 100-4 2 2 0 000 4zM6 17a3 3 0 016 0M14 11h5M14 15h4",
  // Speedometer arc with needle + center pivot (CSAT score reading).
  csat:"M4 18a8 8 0 0 1 16 0M12 18l3-5M11 18a1 1 0 102 0 1 1 0 00-2 0",
  // Five-point star (Expertise — mastery).
  expertise:"M12 3l2.5 6.5 6.5.5-5 4.5 2 7-6-3.5-6 3.5 2-7-5-4.5 6.5-.5z",
  // Bullseye (three rings) with an arrow striking from upper-right (Targets).
  targets:"M12 3a9 9 0 110 18 9 9 0 010-18zM12 6a6 6 0 110 12 6 6 0 010-12zM12 9a3 3 0 110 6 3 3 0 010-6zM12 12l7-7M16 5h3v3",
  // Calendar with binder tabs + a checkmark on one day (Attendance).
  attendance:"M4 5h16v15H4zM4 9h16M8 3v4M16 3v4M10 14l1.5 1.5L15 12",
  // Magnifying glass with a check inside the lens (Quality Control).
  quality:"M16 10a6 6 0 11-12 0 6 6 0 0112 0M14.5 14.5l5 5M7 10l2 2 4-4",
  // Folder with tab and a document line inside (HR cases).
  folder:"M3 7v12a1 1 0 001 1h16a1 1 0 001-1V9a1 1 0 00-1-1h-9l-2-2H4a1 1 0 00-1 1zM8 14h8",
  // Key — head + shaft + two teeth (Admin panel — access).
  key:"M11 12a4 4 0 11-8 0 4 4 0 018 0M11 12h10M18 12v3M21 12v2",
  // ECG / heartbeat line (App utilization — wink at the "Pulse" name).
  utilization:"M3 12h5l2-4 3 8 3-8 2 4h4",
  // Trophy cup with handles + base (NPA Winners — recognition).
  award:"M7 4h10v4a5 5 0 01-10 0zM7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3M12 13v4M9 21h6M10 17h4v4h-4z",
};
export const TabbyLogo = ({size=24, color="#3BFF9D"}) => (
  <svg width={size * 5} height={size} viewBox="0 0 500 100" fill="none">
    <rect width="500" height="100" rx="16" fill="var(--sidebar-bg)"/>
    <path d="M30 50 L55 50 L65 25 L80 75 L95 35 L105 50 L130 50" stroke="url(#logoGrad)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <defs><linearGradient id="logoGrad" x1="30" y1="50" x2="130" y2="50"><stop offset="0%" stopColor="#3BFF9D"/><stop offset="100%" stopColor="#6A2C79"/></linearGradient></defs>
    <text x="142" y="68" fontFamily="'Inter Tight', sans-serif" fontSize="52" fontWeight="700" fill="#fff" letterSpacing="-1">tabby</text>
    <text x="336" y="68" fontFamily="'Inter Tight', sans-serif" fontSize="52" fontWeight="700" fill={color} letterSpacing="-1">Pulse</text>
  </svg>
);
export const GoogleLogo=()=>(<svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>);
