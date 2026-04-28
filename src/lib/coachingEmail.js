// Pure HTML formatters for the coaching session email. Nothing in
// here touches React or component state — everything comes in via
// arguments so the same builder can power preview rendering, the
// actual send, and any future export.

import { INTRO_MAP, PERF_MESSAGES } from "./coachingTemplates.js";

export const firstNameFromEmail = (email) => {
  if (!email) return "Team Member";
  const f = email.split("@")[0].split(/[.\-_]/)[0];
  return f.charAt(0).toUpperCase() + f.slice(1).toLowerCase();
};

export const fmtCoachingDate = (s) => {
  if (!s) return "";
  try {
    return new Date(s + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  } catch {
    return s;
  }
};

// End-of-month metric: average of the available weekly values.
export const calcEom = (vals) => {
  const nums = vals.map(v => parseFloat(v)).filter(v => !isNaN(v) && v > 0);
  return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
};

// Difference between target and actual for a single week. Returns null
// when either side is missing so the table can render "--".
export const calcDiff = (target, actual) => {
  const t = parseFloat(target), a = parseFloat(actual);
  if (isNaN(t) || isNaN(a) || !actual) return null;
  return Math.round((a - t) * 10) / 10;
};

// Build the inline-styled HTML body of a coaching session email. Pure
// function — every piece of state the page knows about is passed in.
export function buildCoachingEmailBody(params) {
  const {
    toEmail,
    meetingType,
    isTargetType,
    outcome,
    nextSteps,
    topics,
    strengths,
    weaknesses,
    goals,
    actions,
    perfRating,
    targetRows,
    sigName,
    sigTitle,
  } = params;

  const fn = firstNameFromEmail(toEmail);
  const isConclusion = isTargetType && outcome;
  const planName = meetingType === "PIP Review" ? "Performance Improvement Plan" : "Action Plan";
  let html = "";

  html += `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.8;color:#1a1a1a;max-width:680px;">`;
  html += `<p style="margin:0 0 16px;"><span style="background:#E8F5E8;color:#1A3D2B;padding:5px 16px;border-radius:20px;font-weight:700;font-size:12px;letter-spacing:.03em;">${meetingType}</span></p>`;
  html += `<p style="margin:0 0 16px;">Dear ${fn},</p>`;

  if (isConclusion && outcome === "pass") {
    html += `<p style="margin:0 0 20px;">I am pleased to formally confirm that you have successfully completed your ${planName}. Your commitment, consistency, and improvement throughout this period have been genuinely noted and are greatly appreciated. This concludes the formal ${planName} process, and your performance will continue to be monitored through our regular 1:1 sessions.</p>`;
  } else if (isConclusion && outcome === "fail") {
    html += `<p style="margin:0 0 12px;">Following a full review of your ${planName}, I regret to formally notify you that the required performance targets were not met within the agreed timeframe. This outcome has been documented and will be shared with the relevant stakeholders, including Human Resources.</p>`;
    if (nextSteps) html += `<p style="margin:0 0 6px;font-weight:700;">Agreed Next Steps:</p><p style="margin:0 0 20px;">${nextSteps.replace(/\n/g, "<br>")}</p>`;
  } else {
    html += `<p style="margin:0 0 20px;">${INTRO_MAP[meetingType] || "This is a formal summary of our session."}</p>`;
  }

  const mkList = (text) => {
    if (!text?.trim()) return "";
    return `<ul style="margin:8px 0;padding-left:22px;">${text.split("\n").filter(l => l.trim()).map(l => `<li style="margin-bottom:6px;">${l.replace(/^[-•]\s*/, "").trim()}</li>`).join("")}</ul>`;
  };
  const mkSection = (title, body) => `<div style="margin-top:24px;"><p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#1A3D2B;border-bottom:1px solid #E8F5E8;padding-bottom:4px;">${title}</p>${body}</div>`;

  if (topics?.trim()) html += mkSection("Topics Discussed", mkList(topics));

  if (perfRating) {
    const pillStyles = {
      "Outstanding": "background:#C5F5C5;color:#1A3D2B;",
      "Exceeds Expectations": "background:#A0E8A0;color:#1A3D2B;",
      "Meets Expectations": "background:#E8F5E8;color:#2A5A2A;",
      "Below Expectations": "background:#FEF9F0;color:#854F0B;",
      "Needs Attention": "background:#FCEBEB;color:#A32D2D;",
    };
    html += mkSection("Overall Performance Rating", `<p style="margin:8px 0 6px;"><span style="${pillStyles[perfRating] || ""}padding:4px 16px;border-radius:20px;font-weight:700;font-size:13px;">${perfRating}</span></p><p style="margin:0 0 4px;">${PERF_MESSAGES[perfRating] || ""}</p>`);
  }

  if (strengths?.trim()) html += mkSection("Strengths & Recognized Contributions", mkList(strengths));
  if (weaknesses?.trim()) html += mkSection("Areas for Development", mkList(weaknesses));
  if (goals?.trim()) html += mkSection("Goals & Progress Update", mkList(goals));
  if (actions?.trim()) html += mkSection("Action Items & Agreed Next Steps", mkList(actions));

  // Target table — only for AP / PIP review meeting types.
  if (isTargetType && targetRows.some(r => r.metric.trim())) {
    const s = "padding:9px 11px;font-size:13px;text-align:center;border:1px solid #C8E8C8;";
    html += `<div style="margin-top:24px;"><p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#1A3D2B;">Weekly QA Review — Score Tracking</p>`;
    html += `<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;">`;
    html += `<tr>${["Metric", "Row", "Start", "W1", "W2", "W3", "W4", "EOM"].map((c, i) => `<th style="${s}font-weight:700;color:#C5F5C5;background:#1A3D2B;${i <= 1 ? "text-align:left;" : ""}">${c}</th>`).join("")}</tr>`;

    targetRows.filter(r => r.metric.trim()).forEach((r, ri) => {
      const bg = ri % 2 === 0 ? "#fff" : "#F0FCF0";
      const tEom = calcEom([r.w1, r.w2, r.w3, r.w4]);
      const aEom = calcEom([r.a1, r.a2, r.a3, r.a4]);
      html += `<tr style="background:${bg}"><td style="${s}text-align:left;font-weight:700;" rowspan="3">${r.metric}</td>`;
      html += `<td style="${s}text-align:left;font-weight:600;background:#E8F5E8;color:#1A3D2B;font-size:10px;">Target</td>`;
      html += `<td style="${s}">${r.start ? r.start + "%" : "--"}</td>`;
      ["w1", "w2", "w3", "w4"].forEach(k => { html += `<td style="${s}">${r[k] ? r[k] + "%" : "--"}</td>`; });
      html += `<td style="${s}background:#C5F5C5;color:#1A3D2B;font-weight:700;">${tEom !== null ? tEom + "%" : "--"}</td></tr>`;
      html += `<tr style="background:${bg}"><td style="${s}text-align:left;font-weight:600;background:#FEF9F0;color:#854F0B;font-size:10px;">Actual</td>`;
      html += `<td style="${s}color:#aaa;">--</td>`;
      ["a1", "a2", "a3", "a4"].forEach(k => { html += `<td style="${s}">${r[k] ? r[k] + "%" : "--"}</td>`; });
      const eAbg = aEom !== null && tEom !== null ? (aEom >= tEom ? "#E0F8E0" : "#FCEBEB") : "#FEF9F0";
      const eAc = aEom !== null && tEom !== null ? (aEom >= tEom ? "#1A6B2A" : "#A32D2D") : "#854F0B";
      html += `<td style="${s}background:${eAbg};color:${eAc};font-weight:700;">${aEom !== null ? aEom + "%" : "--"}</td></tr>`;
      html += `<tr style="background:${bg}"><td style="${s}text-align:left;font-weight:600;background:#F5F5F5;color:#555;font-size:10px;">Difference</td>`;
      html += `<td style="${s}color:#aaa;">--</td>`;
      ["w1", "w2", "w3", "w4"].forEach((wk, i) => {
        const d = calcDiff(r[wk], r["a" + (i + 1)]);
        if (d !== null) {
          const dc = d > 0 ? "#1A6B2A" : d < 0 ? "#A32D2D" : "#555";
          const dbg = d > 0 ? "#E0F8E0" : d < 0 ? "#FCEBEB" : "#F5F5F5";
          html += `<td style="${s}background:${dbg};color:${dc};font-weight:700;">${d > 0 ? "+" : ""}${d}%</td>`;
        } else html += `<td style="${s}color:#ccc;">--</td>`;
      });
      if (aEom !== null && tEom !== null) {
        const ed = Math.round((aEom - tEom) * 10) / 10;
        const ec = ed > 0 ? "#1A6B2A" : ed < 0 ? "#A32D2D" : "#555";
        const eb = ed > 0 ? "#E0F8E0" : ed < 0 ? "#FCEBEB" : "#F5F5F5";
        html += `<td style="${s}background:${eb};color:${ec};font-weight:700;">${ed > 0 ? "+" : ""}${ed}%</td></tr>`;
      } else html += `<td style="${s}color:#ccc;">--</td></tr>`;
    });
    html += `</table></div>`;
  }

  html += `<div style="margin-top:28px;padding-top:16px;border-top:1px solid #E8F5E8;">`;
  html += `<p style="margin:0 0 10px;">Should you have any questions, please do not hesitate to reach out.</p>`;
  html += `<p style="margin:0 0 16px;">I appreciate your continued commitment and professionalism.</p>`;
  html += `<p style="margin:0;">Best regards,<br><strong>${sigName || "QA Leader"}</strong><br>${sigTitle || "QA Lead"} | Tabby</p>`;
  html += `</div></div>`;
  return html;
}
