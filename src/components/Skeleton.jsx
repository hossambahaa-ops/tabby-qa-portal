import React from "react";

/* ── Reusable skeleton building block ── */
const Bone = ({ w = "100%", h = 14, r = 6, mb = 0, style }) => (
  <div
    className="skeleton"
    style={{ width: w, height: h, borderRadius: r, marginBottom: mb, ...style }}
  />
);

/* ── Card-shaped skeleton: title bar + 3 text lines ── */
export const SkeletonCard = () => (
  <div className="card" style={{ padding: 20 }}>
    <Bone w="45%" h={16} r={8} mb={18} />
    <Bone w="90%" h={12} mb={10} />
    <Bone w="75%" h={12} mb={10} />
    <Bone w="60%" h={12} />
  </div>
);

/* ── Table-shaped skeleton: header + 5 data rows ── */
export const SkeletonTable = () => (
  <div className="card" style={{ padding: 0, overflow: "hidden" }}>
    {/* header row */}
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "14px 18px",
        borderBottom: "2px solid var(--bd)",
      }}
    >
      {[22, 30, 18, 14, 16].map((w, i) => (
        <Bone key={i} w={`${w}%`} h={12} r={4} />
      ))}
    </div>
    {/* data rows */}
    {Array.from({ length: 5 }).map((_, row) => (
      <div
        key={row}
        style={{
          display: "flex",
          gap: 12,
          padding: "12px 18px",
          borderBottom: row < 4 ? "1px solid var(--bd2)" : "none",
        }}
      >
        {[22, 30, 18, 14, 16].map((w, i) => (
          <Bone key={i} w={`${w}%`} h={10} r={4} style={{ animationDelay: `${row * 0.08}s` }} />
        ))}
      </div>
    ))}
  </div>
);

/* ── Stats grid skeleton: 4 stat cards ── */
export const SkeletonStats = () => (
  <div className="stats-grid">
    {[0, 1, 2, 3].map((i) => (
      <div key={i} className="stat-card" style={{ minHeight: 100, padding: 20 }}>
        <Bone w="50%" h={10} r={4} mb={16} style={{ animationDelay: `${i * 0.12}s` }} />
        <Bone w="40%" h={28} r={8} style={{ animationDelay: `${i * 0.12 + 0.05}s` }} />
      </div>
    ))}
  </div>
);

/* ── Full page skeleton: stats + table ── */
export const SkeletonPage = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
    <SkeletonStats />
    <SkeletonTable />
  </div>
);

export default SkeletonPage;
