import React, { useState, useEffect, useCallback } from "react";
import { sb } from "../lib/supabase.js";
import { useApp } from "../lib/AppContext.jsx";
import { hasRole } from "../lib/constants.js";
import { nameFromEmail } from "../lib/utils.js";
import EmptyState from "../components/EmptyState.jsx";

// AdminMigrationsPage — surfaces every QA in "split-brain" state, where
// the same person has profiles under both @tabby.ai and @tabby.sa. A
// one-click button per row consolidates them via migrate_qa_email RPC
// (newer-domain wins, all historical data preserved).
//
// Surfaced because the alternative was "ping a super-admin to run SQL"
// every time a KSA-bound teammate switched email domains.
export default function AdminMigrationsPage() {
  const { token, profile, globalToast } = useApp();
  const [loading, setLoading] = useState(true);
  const [pairs, setPairs] = useState([]); // [{ localPart, ai: profile, sa: profile, aiCounts, saCounts }]
  const [migrating, setMigrating] = useState(null); // localPart currently being migrated
  const [error, setError] = useState(null);

  const isAdmin = hasRole(profile?.role, "admin");

  const loadPairs = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      // Pull every profile and find local-parts that appear under
      // BOTH @tabby.ai AND @tabby.sa. Those are the split-brain cases.
      const profiles = await sb.query("profiles", {
        token,
        select: "id,email,display_name,role,operational_domain",
        cache: false,
      });
      const byLocal = new Map();
      for (const p of (Array.isArray(profiles) ? profiles : [])) {
        const em = (p.email || "").toLowerCase();
        const at = em.indexOf("@");
        if (at < 0) continue;
        const local = em.slice(0, at);
        const domain = em.slice(at + 1);
        if (domain !== "tabby.ai" && domain !== "tabby.sa") continue;
        const entry = byLocal.get(local) || { localPart: local };
        if (domain === "tabby.ai") entry.ai = p;
        else entry.sa = p;
        byLocal.set(local, entry);
      }
      const splitBrain = [...byLocal.values()].filter(e => e.ai && e.sa);
      // For each pair, fetch row counts on both sides so the admin
      // sees what's about to move. Done in parallel per pair.
      const enriched = await Promise.all(splitBrain.map(async (e) => {
        const [aiAtt, aiMtd, saAtt, saMtd] = await Promise.all([
          sb.query("qa_attendance", { token, select: "email", filters: `email=eq.${encodeURIComponent(e.ai.email.toLowerCase())}&limit=1000`, cache: false }).catch(() => []),
          sb.query("mtd_scores",    { token, select: "month",  filters: `qa_email=eq.${encodeURIComponent(e.ai.email.toLowerCase())}`,                cache: false }).catch(() => []),
          sb.query("qa_attendance", { token, select: "email", filters: `email=eq.${encodeURIComponent(e.sa.email.toLowerCase())}&limit=1000`, cache: false }).catch(() => []),
          sb.query("mtd_scores",    { token, select: "month",  filters: `qa_email=eq.${encodeURIComponent(e.sa.email.toLowerCase())}`,                cache: false }).catch(() => []),
        ]);
        return {
          ...e,
          aiCounts: { att: (aiAtt || []).length, mtd: (aiMtd || []).length },
          saCounts: { att: (saAtt || []).length, mtd: (saMtd || []).length },
        };
      }));
      setPairs(enriched);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadPairs(); }, [loadPairs]);

  const runMigrate = async (pair, direction) => {
    if (!isAdmin) { globalToast("error", "Admin access required"); return; }
    const old_email = direction === "to_sa" ? pair.ai.email : pair.sa.email;
    const new_email = direction === "to_sa" ? pair.sa.email : pair.ai.email;
    if (!window.confirm(
      `Migrate ${pair.localPart}?\n\n` +
      `Old: ${old_email} (will be deleted)\n` +
      `New: ${new_email} (will keep all history)\n\n` +
      `This is irreversible. Continue?`
    )) return;
    setMigrating(pair.localPart);
    try {
      const res = await sb.rpc("migrate_qa_email", { p_old: old_email, p_new: new_email }, token);
      globalToast("success", `Migrated ${pair.localPart} → ${new_email}`);
      console.log("migrate_qa_email result:", res);
      await loadPairs();
    } catch (e) {
      globalToast("error", `Migration failed: ${e?.message || String(e)}`);
    } finally {
      setMigrating(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="page">
        <EmptyState title="Admin only" description="Email migration is restricted to admins / super-admins." icon="M12 15v2m0 0v2m0-2h2m-2 0H10m9-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v8a2 2 0 002 2h10z" />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div className="page-title">Email migrations</div>
          <div className="page-subtitle">
            QAs whose Google identity moved across Tabby domains. Pick a direction and merge their history into one email.
          </div>
        </div>
        <button className="btn btn-outline btn-sm" onClick={loadPairs} disabled={loading} style={{ fontSize: 11 }}>↻ Refresh</button>
      </div>

      {/* How this works callout */}
      <div className="card" style={{ padding: "10px 14px", marginBottom: 12, fontSize: 12, color: "var(--tx2)", borderLeft: "3px solid var(--tabby-purple)" }}>
        <div style={{ fontWeight: 700, color: "var(--tx)", marginBottom: 4 }}>How this works</div>
        Both profiles exist when a teammate signs in with a new email before the old one's been removed. Migrating consolidates every email-keyed row (MTD, CSAT, attendance, coaching, expertise, etc.) under the chosen email and deletes the other profile. Conflicting rows (e.g. attendance on the same day under both emails) — the destination email wins. Irreversible.
      </div>

      {loading && <div style={{ padding: 24, textAlign: "center", color: "var(--tx3)" }}>Loading…</div>}
      {error && (
        <div className="card" style={{ padding: 12, marginBottom: 12, borderLeft: "3px solid var(--red)", color: "var(--red)", fontSize: 13 }}>
          {error}
        </div>
      )}

      {!loading && !error && pairs.length === 0 && (
        <EmptyState title="No pending migrations" description="Every QA has exactly one Tabby profile. You're all clean." icon="M5 13l4 4L19 7" />
      )}

      {pairs.map(pair => {
        const isThis = migrating === pair.localPart;
        const aiLabel = `${pair.ai.email} · ${pair.aiCounts.att}d att · ${pair.aiCounts.mtd}mo MTD`;
        const saLabel = `${pair.sa.email} · ${pair.saCounts.att}d att · ${pair.saCounts.mtd}mo MTD`;
        // Recommend the direction with MORE recent data unless one side is clearly empty
        const recommendSa = pair.saCounts.att + pair.saCounts.mtd >= pair.aiCounts.att + pair.aiCounts.mtd
          || (pair.saCounts.att === 0 && pair.aiCounts.att === 0); // tie → default to .sa (KSA migration path)
        return (
          <div key={pair.localPart} className="card" style={{ padding: 14, marginBottom: 12, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div style={{
              width: 36, height: 36, borderRadius: "50%",
              background: "linear-gradient(135deg, #6A2C79, #C9A0FF)",
              color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, fontSize: 12, flexShrink: 0,
            }}>
              {nameFromEmail(pair.localPart).split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2)}
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{nameFromEmail(pair.localPart)}</div>
              <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 2 }}>
                <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: 3, background: "rgba(255,255,255,.06)", marginRight: 6, fontVariantNumeric: "tabular-nums" }}>{aiLabel}</span>
                <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: 3, background: "rgba(60,255,165,.10)", color: "#3CFFA5", fontVariantNumeric: "tabular-nums" }}>{saLabel}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => runMigrate(pair, "to_sa")}
                disabled={isThis}
                title={`Merge .ai → .sa. Drops the .ai row and rewrites all history to ${pair.sa.email}.`}
                style={{ fontSize: 11, opacity: recommendSa ? 1 : 0.65, border: recommendSa ? "1px solid #3CFFA5" : undefined }}
              >
                {isThis ? "…" : "→ .sa"}
              </button>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => runMigrate(pair, "to_ai")}
                disabled={isThis}
                title={`Reverse direction: keep .ai, drop .sa.`}
                style={{ fontSize: 11, opacity: recommendSa ? 0.65 : 1 }}
              >
                {isThis ? "…" : "→ .ai"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
