import React from "react";

// Super-admin-only embed of the external "Quality Evaluations & DSAT Reviews"
// app (deployed separately on Cloudflare Pages). It is fully self-contained —
// its own backend / Anthropic API calls stay on its own origin — so we simply
// surface it here in an iframe as a Pulse tab. Access is gated in App.jsx:
// both the nav item (minRole) and the route require super_admin.
const DSAT_URL = "https://quality-evaluation-dsat.pages.dev/";

export default function DsatReviewsPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "20px 24px", height: "100%", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h1 className="page-title">Brixi Review</h1>
          <p className="page-subtitle">Quality evaluations &amp; DSAT reviews — visible to super admins only.</p>
        </div>
        <a
          href={DSAT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-outline"
          style={{ textDecoration: "none", fontSize: 13, whiteSpace: "nowrap" }}
        >
          Open in new tab ↗
        </a>
      </div>
      <iframe
        src={DSAT_URL}
        title="Quality Evaluations & DSAT Reviews"
        style={{
          flex: 1,
          width: "100%",
          minHeight: "calc(100vh - 210px)",
          border: "1px solid var(--bd2)",
          borderRadius: "var(--radius-lg)",
          background: "var(--bg3)",
          boxShadow: "var(--shadow)",
        }}
        allow="clipboard-read; clipboard-write"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
