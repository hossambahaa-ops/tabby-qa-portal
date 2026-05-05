import React from "react";
import { riyadhTodayStr, computeAttendanceHealth, computeTeamAttendanceHealth, healthColor } from "../../lib/attendancePlan.js";

const nameFromEmail = (email) => {
  if (!email) return "—";
  const local = email.split("@")[0];
  return local.split(".").map(p => { const c = p.replace(/[\d]+$/, ""); return c ? c.charAt(0).toUpperCase() + c.slice(1) : ""; }).filter(Boolean).join(" ");
};

const dash = (val) => (val > 0 ? val : "—");

export default function MonthlySummary({ visibleQAs, attendance, selMonth, token, profile }) {
  const [year, month] = selMonth.split("-").map(Number);
  const monthLabel = new Date(year, month - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const isApproved = (a) => !a.approval_status || a.approval_status === "approved";
  // Only count days that have actually occurred. Future-dated rows can
  // carry a status that came from the plan auto-sync (lead saved a plan
  // with H/P/OFF, the system mirrored it into status for visibility on
  // the calendar) — but those aren't real check-ins yet, so they
  // shouldn't inflate the monthly counts. Cutoff is today's Riyadh date.
  const todayStr = riyadhTodayStr();
  const isOnOrBeforeToday = (a) => a.date && a.date <= todayStr;

  const summaryRows = [...visibleQAs]
    .sort((a, b) => (a.email || "").localeCompare(b.email || ""))
    .map(qa => {
      const em = qa.email?.toLowerCase();
      const qaAtt = attendance.filter(a => a.email?.toLowerCase() === em && isApproved(a) && isOnOrBeforeToday(a));
      const count = (...codes) => qaAtt.filter(a => codes.includes(a.status)).length;
      const otHours = qaAtt.filter(a => a.status === "OT").reduce((s, a) => s + (parseFloat(a.ot_hours) || 0), 0);
      // Health % = healthy / scheduled (planned H or P) MTD; higher = better.
      // computeAttendanceHealth handles its own date cutoff and planned filter.
      const allRowsForQa = attendance.filter(a => a.email?.toLowerCase() === em);
      const health = computeAttendanceHealth(allRowsForQa, selMonth);
      return {
        email: em,
        name: nameFromEmail(em),
        wdPayable: count("P", "H", "PH", "CDO"),
        transDays: count("P"),
        otHours,
        phDays: count("PH"),
        cdoDays: count("CDO"),
        alDays: count("AL"),
        slDays: count("Paid SL"),
        ulDays: count("UL"),
        nsnc: count("NSNC"),
        wfhDays: count("H"),
        tabbyDay: count("Tabby Day"),
        elDays: count("EL"),
        lateDays: count("L"),
        healthPct: health.healthPct,
        healthScheduled: health.scheduledDays,
        healthAbsent: health.absentDays,
      };
    });

  // Team-level aggregate health (weighted by scheduled days, not avg of %).
  const teamHealth = computeTeamAttendanceHealth(
    attendance,
    visibleQAs.map(qa => qa.email?.toLowerCase()).filter(Boolean),
    selMonth,
  );

  const tot = summaryRows.reduce((acc, r) => {
    acc.wdPayable += r.wdPayable;
    acc.transDays += r.transDays;
    acc.otHours   += r.otHours;
    acc.phDays    += r.phDays;
    acc.cdoDays   += r.cdoDays;
    acc.alDays    += r.alDays;
    acc.slDays    += r.slDays;
    acc.nsnc      += r.nsnc;
    return acc;
  }, { wdPayable: 0, transDays: 0, otHours: 0, phDays: 0, cdoDays: 0, alDays: 0, slDays: 0, nsnc: 0 });

  const downloadCsv = () => {
    const headers = ["Name", "Email", "WD Payable", "Trans Days", "OT Hours", "PH Days", "CDO Days", "WFH Days", "AL Days", "SL Days", "UL Days", "Tabby Day", "EL Days", "Late Days", "NSNC", "Health %", "Scheduled Days", "Healthy Days"];
    const csvRows = summaryRows.map(r => [
      `"${r.name}"`, r.email,
      r.wdPayable, r.transDays, r.otHours.toFixed(2),
      r.phDays, r.cdoDays, r.wfhDays,
      r.alDays, r.slDays, r.ulDays, r.tabbyDay,
      r.elDays, r.lateDays, r.nsnc,
      r.healthPct === null ? "" : r.healthPct.toFixed(1),
      r.healthScheduled,
      r.healthScheduled - r.healthAbsent,
    ].join(","));
    const csv = [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `payroll_summary_${selMonth}.csv`;
    a.click();
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--tx)" }}>Monthly Summary — {monthLabel}</div>
          <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 2 }}>Approved records only · Days through today only · WD = P + H + PH + CDO · Trans = P only</div>
        </div>
        <button
          className="btn btn-outline btn-sm"
          onClick={downloadCsv}
          style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5 }}
        >
          📥 Download payroll CSV
        </button>
      </div>

      {/* Team totals strip */}
      <div className="card" style={{ padding: "12px 20px", marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tx3)", marginBottom: 10 }}>Team totals</div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
          {[
            ["WD Payable", tot.wdPayable, "var(--green)"],
            ["Trans Days", tot.transDays, "#3B82F6"],
            ["OT Hours",  `${tot.otHours.toFixed(1)}h`, "#0D9488"],
            ["PH Days",   tot.phDays, "#8B5CF6"],
            ["CDO Days",  tot.cdoDays, "#14B8A6"],
            ["AL Days",   tot.alDays, "var(--red)"],
            ["SL Days",   tot.slDays, "#B91C1C"],
            ["NSNC",      tot.nsnc, "var(--red)"],
          ].map(([label, val, color]) => (
            <div key={label} style={{ textAlign: "center", minWidth: 52 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color, lineHeight: 1.1 }}>{val}</div>
              <div style={{ fontSize: 9, color: "var(--tx3)", marginTop: 3, letterSpacing: 0.2 }}>{label}</div>
            </div>
          ))}
          {/* Team Health % — separated from absolute totals so it reads
              as a derived metric, not another count. Same dataset
              (approved, today-or-earlier rows). */}
          <div style={{ width: 1, alignSelf: "stretch", background: "var(--bd2)" }} />
          <div style={{ textAlign: "center", minWidth: 64 }} title="Health = scheduled days the team showed up / scheduled days. Higher = healthier.">
            <div style={{ fontSize: 18, fontWeight: 800, color: healthColor(teamHealth.teamHealthPct), lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
              {teamHealth.teamHealthPct === null ? "—" : `${teamHealth.teamHealthPct.toFixed(1)}%`}
            </div>
            <div style={{ fontSize: 9, color: "var(--tx3)", marginTop: 3, letterSpacing: 0.2 }}>Team Health</div>
          </div>
        </div>
      </div>


      {/* Detail table */}
      <div className="card" style={{ overflow: "auto" }}>
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", whiteSpace: "nowrap" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--bd)", background: "var(--bg3)" }}>
              <th style={{ padding: "9px 14px", textAlign: "left", fontWeight: 600, color: "var(--tx2)", fontSize: 11, position: "sticky", left: 0, background: "var(--bg3)", zIndex: 1 }}>QA</th>
              <th style={{ padding: "9px 12px", textAlign: "center", fontWeight: 700, color: "var(--green)", fontSize: 11 }} title="P + H + PH + CDO · approved">WD</th>
              <th style={{ padding: "9px 12px", textAlign: "center", fontWeight: 600, color: "#3B82F6", fontSize: 11 }} title="Present days only (transport)">Trans</th>
              <th style={{ padding: "9px 12px", textAlign: "center", fontWeight: 600, color: "#0D9488", fontSize: 11 }}>OT h</th>
              <th style={{ padding: "9px 12px", textAlign: "center", fontWeight: 600, color: "#8B5CF6", fontSize: 11 }}>PH</th>
              <th style={{ padding: "9px 12px", textAlign: "center", fontWeight: 600, color: "#14B8A6", fontSize: 11 }}>CDO</th>
              <th style={{ padding: "9px 12px", textAlign: "center", fontWeight: 600, color: "#3B82F6", fontSize: 11 }}>WFH</th>
              <th style={{ padding: "9px 12px", textAlign: "center", fontWeight: 600, color: "var(--red)", fontSize: 11 }}>AL</th>
              <th style={{ padding: "9px 12px", textAlign: "center", fontWeight: 600, color: "#B91C1C", fontSize: 11 }}>SL</th>
              <th style={{ padding: "9px 12px", textAlign: "center", fontWeight: 600, color: "#6B7280", fontSize: 11 }}>UL</th>
              <th style={{ padding: "9px 12px", textAlign: "center", fontWeight: 600, color: "#A855F7", fontSize: 11 }} title="Tabby Day">TD</th>
              <th style={{ padding: "9px 12px", textAlign: "center", fontWeight: 600, color: "var(--red)", fontSize: 11 }}>NSNC</th>
              <th style={{ padding: "9px 12px", textAlign: "center", fontWeight: 700, color: "var(--tx2)", fontSize: 11 }} title="Health = scheduled days where the QA showed up (status set, not NSNC) / scheduled days. Higher = healthier.">Health</th>
            </tr>
          </thead>
          <tbody>
            {summaryRows.map(r => (
              <tr key={r.email} style={{ borderBottom: "1px solid var(--bd)" }}>
                <td style={{ padding: "11px 14px", position: "sticky", left: 0, background: "var(--bg3)", zIndex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--accent-light)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "var(--accent-text)", flexShrink: 0 }}>
                      {r.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <span style={{ fontWeight: 500 }}>{r.name}</span>
                  </div>
                </td>
                <td style={{ padding: "11px 12px", textAlign: "center", fontWeight: 800, fontSize: 13, color: r.wdPayable > 0 ? "var(--green)" : "var(--tx3)" }}>{r.wdPayable}</td>
                <td style={{ padding: "11px 12px", textAlign: "center", color: r.transDays > 0 ? "#3B82F6" : "var(--tx3)", fontWeight: r.transDays > 0 ? 700 : 400 }}>{dash(r.transDays)}</td>
                <td style={{ padding: "11px 12px", textAlign: "center", color: r.otHours > 0 ? "#0D9488" : "var(--tx3)", fontWeight: r.otHours > 0 ? 700 : 400 }}>{r.otHours > 0 ? r.otHours.toFixed(1) : "—"}</td>
                <td style={{ padding: "11px 12px", textAlign: "center", color: r.phDays > 0 ? "#8B5CF6" : "var(--tx3)" }}>{dash(r.phDays)}</td>
                <td style={{ padding: "11px 12px", textAlign: "center", color: r.cdoDays > 0 ? "#14B8A6" : "var(--tx3)" }}>{dash(r.cdoDays)}</td>
                <td style={{ padding: "11px 12px", textAlign: "center", color: r.wfhDays > 0 ? "#3B82F6" : "var(--tx3)" }}>{dash(r.wfhDays)}</td>
                <td style={{ padding: "11px 12px", textAlign: "center", color: r.alDays > 0 ? "var(--red)" : "var(--tx3)", fontWeight: r.alDays > 0 ? 700 : 400 }}>{dash(r.alDays)}</td>
                <td style={{ padding: "11px 12px", textAlign: "center", color: r.slDays > 0 ? "#B91C1C" : "var(--tx3)" }}>{dash(r.slDays)}</td>
                <td style={{ padding: "11px 12px", textAlign: "center", color: r.ulDays > 0 ? "#6B7280" : "var(--tx3)" }}>{dash(r.ulDays)}</td>
                <td style={{ padding: "11px 12px", textAlign: "center", color: r.tabbyDay > 0 ? "#A855F7" : "var(--tx3)" }}>{dash(r.tabbyDay)}</td>
                <td style={{ padding: "11px 12px", textAlign: "center", color: r.nsnc > 0 ? "var(--red)" : "var(--tx3)", fontWeight: r.nsnc > 0 ? 800 : 400 }}>{dash(r.nsnc)}</td>
                <td style={{ padding: "11px 12px", textAlign: "center", color: healthColor(r.healthPct), fontWeight: 700, fontVariantNumeric: "tabular-nums" }} title={r.healthScheduled === 0 ? "No scheduled days yet this month" : `${r.healthScheduled - r.healthAbsent}/${r.healthScheduled} scheduled days · ${r.healthAbsent} blank or NSNC`}>
                  {r.healthPct === null ? "—" : `${r.healthPct.toFixed(0)}%`}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid var(--bd)", background: "var(--bg3)", fontWeight: 700 }}>
              <td style={{ padding: "10px 14px", fontSize: 11, color: "var(--tx2)", position: "sticky", left: 0, background: "var(--bg3)", zIndex: 1 }}>Totals</td>
              <td style={{ padding: "10px 12px", textAlign: "center", color: "var(--green)", fontWeight: 800 }}>{tot.wdPayable}</td>
              <td style={{ padding: "10px 12px", textAlign: "center", color: "#3B82F6" }}>{tot.transDays || "—"}</td>
              <td style={{ padding: "10px 12px", textAlign: "center", color: "#0D9488" }}>{tot.otHours > 0 ? tot.otHours.toFixed(1) : "—"}</td>
              <td style={{ padding: "10px 12px", textAlign: "center", color: "#8B5CF6" }}>{dash(tot.phDays)}</td>
              <td style={{ padding: "10px 12px", textAlign: "center", color: "#14B8A6" }}>{dash(tot.cdoDays)}</td>
              <td style={{ padding: "10px 12px", textAlign: "center", color: "var(--tx3)" }}>—</td>
              <td style={{ padding: "10px 12px", textAlign: "center", color: "var(--red)" }}>{dash(tot.alDays)}</td>
              <td style={{ padding: "10px 12px", textAlign: "center", color: "#B91C1C" }}>{dash(tot.slDays)}</td>
              <td style={{ padding: "10px 12px", textAlign: "center", color: "var(--tx3)" }}>—</td>
              <td style={{ padding: "10px 12px", textAlign: "center", color: "var(--tx3)" }}>—</td>
              <td style={{ padding: "10px 12px", textAlign: "center", color: "var(--red)" }}>{dash(tot.nsnc)}</td>
              <td style={{ padding: "10px 12px", textAlign: "center", color: healthColor(teamHealth.teamHealthPct), fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                {teamHealth.teamHealthPct === null ? "—" : `${teamHealth.teamHealthPct.toFixed(1)}%`}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
