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

/* ── Card list skeleton — n stacked cards at a fixed height.
      Use where the real content is a column of cards (dashboard
      widgets, tracker lanes) so the page doesn't grow by 600px the
      moment data lands. ── */
export const SkeletonCards = ({ count = 3, height = 120 }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="card" style={{ padding: 18, minHeight: height }}>
        <Bone w="35%" h={13} r={6} mb={14} style={{ animationDelay: `${i * 0.1}s` }} />
        <Bone w="80%" h={11} mb={9} style={{ animationDelay: `${i * 0.1 + 0.04}s` }} />
        <Bone w="55%" h={11} style={{ animationDelay: `${i * 0.1 + 0.08}s` }} />
      </div>
    ))}
  </div>
);

/* ── Attendance-grid skeleton.
      The schedule grid used to collapse to zero height while loading, so
      the page jumped by the full height of the month once rows arrived —
      and an empty grid was visually identical to a failed one. This keeps
      the exact footprint: a sticky-looking name column plus `days` cells
      per row, `rows` rows deep.

      Callers should pass the row count they EXPECT (e.g. the previously
      rendered team size) so the reflow on load is zero. Defaults are a
      reasonable team-sized guess for a first-ever load. ── */
export const SkeletonGrid = ({ rows = 8, days = 31, cell = 30, nameWidth = 180 }) => (
  <div className="card" style={{ padding: 0, overflow: "hidden" }}>
    {/* header strip — day numbers */}
    <div style={{ display: "flex", gap: 3, padding: "10px 12px", borderBottom: "2px solid var(--bd)" }}>
      <Bone w={`${nameWidth}px`} h={12} r={4} style={{ flexShrink: 0 }} />
      {Array.from({ length: days }).map((_, d) => (
        <Bone key={d} w={`${cell}px`} h={12} r={3} style={{ flexShrink: 0 }} />
      ))}
    </div>
    {Array.from({ length: rows }).map((_, r) => (
      <div
        key={r}
        style={{
          display: "flex",
          gap: 3,
          padding: "7px 12px",
          borderBottom: r < rows - 1 ? "1px solid var(--bd2)" : "none",
        }}
      >
        <Bone w={`${nameWidth}px`} h={cell - 8} r={5} style={{ flexShrink: 0, animationDelay: `${r * 0.05}s` }} />
        {Array.from({ length: days }).map((_, d) => (
          <Bone
            key={d}
            w={`${cell}px`}
            h={cell - 8}
            r={4}
            style={{ flexShrink: 0, animationDelay: `${(r * 0.05) + (d * 0.006)}s` }}
          />
        ))}
      </div>
    ))}
  </div>
);

export default SkeletonPage;
