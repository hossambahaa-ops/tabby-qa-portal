import React, { useState, useEffect, useRef } from "react";
import { hasRole, sortMonthsDesc } from "../lib/constants.js";
import { sb, SUPABASE_URL, SUPABASE_ANON, dataCache } from "../lib/supabase.js";
import { nameFromEmail, logActivity, csatPctValue, csatColor } from "../lib/utils.js";
import { listRoster } from "../api/roster.js";
import { listProfiles } from "../api/profiles.js";
import { listMtd } from "../api/mtd.js";
import { callEdgeFunction } from "../lib/edgeSync.js";
import { Icon, icons } from "../components/Icons.jsx";
import SkeletonPage from "../components/Skeleton.jsx";
import SearchableSelect from "../components/SearchableSelect.jsx";
import PageFilters from "../components/PageFilters.jsx";
import { useApp } from "../lib/AppContext.jsx";
import { SYSTEM_COLS, DEFAULT_MTD_COLS, COL_LABELS } from "../lib/mtdColumns.js";
import MtdUploadModal from "../components/mtd/MtdUploadModal.jsx";
import MtdBulkTaskModal from "../components/mtd/MtdBulkTaskModal.jsx";
import { useRowContextMenu } from "../components/RowContextMenu.jsx";
import SavedViews from "../components/SavedViews.jsx";

function ScoreEntryPage(){
  const{token,profile,gf,globalToast}=useApp();
  const [data, setData] = useState([]);
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState([]);
  const [selMonth, setSelMonth] = useState("");
  const [selQA, setSelQA] = useState([]);
  // Lead + team filters are multi-select.
  const [selTL, setSelTL] = useState([]);
  const [selDomain, setSelDomain] = useState("");
  const [selTeam, setSelTeam] = useState([]);
  // Track whether filter init has run. The data-load effect re-fires
  // every 60s via reloadKey for live refresh — but the seeded-from-gf
  // filter init below must only run ONCE, otherwise every minute the
  // user's manual filter choices get overwritten by gf defaults.
  const didInitFiltersRef = useRef(false);
  const [mtdView, setMtdView] = useState("qa"); // qa | lead
  // Upload modal state
  const [showUpload, setShowUpload] = useState(false);
  const [uploadStep, setUploadStep] = useState("config"); // config | preview | done
  const [uploadMonth, setUploadMonth] = useState("");
  const [uploadCols, setUploadCols] = useState([]);
  const [uploadOverwrite, setUploadOverwrite] = useState(false);
  const [uploadPreview, setUploadPreview] = useState([]);
  const [uploadFile, setUploadFile] = useState(null);
  const [selectedRows, setSelectedRows] = useState(new Set());
  // Refresh-live: triggers the mtd-sync edge function on demand and
  // re-loads the table after it finishes. reloadKey is included in the
  // data-load useEffect's deps so bumping it forces a fresh fetch.
  const [refreshing, setRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const ctxMenu = useRowContextMenu();
  // Click-to-sort on the By QA table. Default = performance descending,
  // matching the previous static sort. Two-state cycle: desc ↔ asc.
  const [qaSort, setQaSort] = useState({ key: "csat_pct", dir: "desc" });
  // Same pattern for the By Lead aggregation table. Previously the
  // lead view was a hard-coded sort on avg(performance) desc with no
  // user control. Mirroring qaSort keeps the keyboard model consistent
  // across the two views.
  const [leadSort, setLeadSort] = useState({ key: "csat", dir: "desc" });
  // Collapsible column groups on the By QA table. Defaults to
  // collapsed for both Evaluations and Coachings — that's the
  // headline layout the user asked for; click the column header to
  // expand the group. Persisted under a versioned key so any stale
  // pre-rollout value is ignored.
  const [groupsCollapsed, setGroupsCollapsed] = useState(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem("mtd_groups_v4"));
      const obj = (parsed && typeof parsed === "object") ? parsed : {};
      return {
        evals: typeof obj.evals === "boolean" ? obj.evals : false,
        coachings: typeof obj.coachings === "boolean" ? obj.coachings : true,
      };
    } catch { return { evals: false, coachings: true }; }
  });
  useEffect(() => { localStorage.setItem("mtd_groups_v4", JSON.stringify(groupsCollapsed)); }, [groupsCollapsed]);
  // Density + column visibility — saved per-user in localStorage so the
  // table remembers their preferred layout across visits.
  const [tableDense, setTableDense] = useState(() => localStorage.getItem("mtd_table_dense") === "true");
  useEffect(() => { localStorage.setItem("mtd_table_dense", tableDense); }, [tableDense]);
  const [hiddenCols, setHiddenCols] = useState(() => {
    try { const raw = localStorage.getItem("mtd_hidden_cols"); return raw ? new Set(JSON.parse(raw)) : new Set(); }
    catch { return new Set(); }
  });
  useEffect(() => { localStorage.setItem("mtd_hidden_cols", JSON.stringify([...hiddenCols])); }, [hiddenCols]);
  const [showColMenu, setShowColMenu] = useState(false);
  const [tableSearch, setTableSearch] = useState("");
  const [bulkTaskModal, setBulkTaskModal] = useState(false);
  const [bulkForm, setBulkForm] = useState({title:"",description:"",priority:"medium",due_date:""});
  const [bulkSending, setBulkSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadLogs, setUploadLogs] = useState([]);
  const isUploadAllowed = hasRole(profile?.role,"admin");

  useEffect(() => {
    (async () => {
      try {
        const [rows, rosterRows, profRows] = await Promise.all([
          listMtd({ token, filters: "order=month.desc,qa_email.asc" }),
          listRoster({ token, select: "email,queue,manager_email" }),
          listProfiles({ token, select: "id,email,role", cacheKey: "profiles_slim" }),
        ]);
        setRoster(rosterRows);
        // Build blacklist: exclude both domain variants of non-QA users
        const nonQaProfiles = profRows.filter(p => p.role !== "qa");
        const blacklist = new Set();
        // Only qa_lead role counts as valid manager (not supervisors/admins)
        const qaLeadSet = new Set();
        profRows.filter(p => p.role === "qa_lead").forEach(p => {
          const email = p.email?.toLowerCase();
          if (!email) return;
          qaLeadSet.add(email);
          const local = email.split("@")[0];
          if (email.endsWith("@tabby.ai")) qaLeadSet.add(local + "@tabby.sa");
          if (email.endsWith("@tabby.sa")) qaLeadSet.add(local + "@tabby.ai");
          qaLeadSet.add(local);
        });
        nonQaProfiles.forEach(p => {
          const email = p.email?.toLowerCase();
          if (!email) return;
          blacklist.add(email);
          const local = email.split("@")[0];
          if (email.endsWith("@tabby.ai")) blacklist.add(local + "@tabby.sa");
          if (email.endsWith("@tabby.sa")) blacklist.add(local + "@tabby.ai");
        });
        // Filter MTD: exclude non-QA profiles AND entries NOT managed by a QA lead
        const rosterMgrValid = new Set(rosterRows.filter(r => {
          const mgr = r.manager_email?.toLowerCase();
          if (!mgr) return false;
          return qaLeadSet.has(mgr) || qaLeadSet.has(mgr.split("@")[0]);
        }).map(r => r.email?.toLowerCase()));
        const filtered = rows.filter(r => {
          const em = r.qa_email?.toLowerCase();
          if (blacklist.has(em)) return false;
          // Check qa_tl: must be a known QA lead
          const tl = r.qa_tl?.toLowerCase();
          if (tl && !qaLeadSet.has(tl) && !qaLeadSet.has(tl.split("@")[0])) return false;
          // If email is in roster, check if their manager is a QA lead
          if (rosterRows.some(x => x.email?.toLowerCase() === em)) {
            return rosterMgrValid.has(em);
          }
          return true;
        });
        setData(filtered);
        const uniqueMonths = sortMonthsDesc([...new Set(filtered.map(r => r.month))]);
        setMonths(uniqueMonths);
        // Seed-from-defaults block — ONLY runs on first load.
        // Re-runs (auto-refresh every 60s, manual ↻ Refresh button)
        // skip this so they don't overwrite filters the user has
        // actively changed since first load.
        if (!didInitFiltersRef.current) {
          if (uniqueMonths.length > 0) setSelMonth(uniqueMonths[0]);
          if (hasRole(profile?.role,"qa_supervisor") && !hasRole(profile?.role,"admin")) {
            const svDomain = profile?.operational_domain || profile?.domain || "";
            if (svDomain) setSelDomain(svDomain);
          }
          if (gf?.domain) setSelDomain(gf.domain);
          if (gf?.month && uniqueMonths.includes(gf.month)) setSelMonth(gf.month);
          // setSelTeam expects an array (later code does
          // selTeam.includes(...)). Previously this passed a single
          // string from gf.teams[0], which made `.includes(queue)` a
          // substring test on a string instead of an Array.includes.
          if (gf?.teams?.length > 0) setSelTeam(gf.teams.filter(Boolean));
          didInitFiltersRef.current = true;
        }
      } catch (e) { console.error("MTD Scores:", e); }
      setLoading(false);
    })();
  }, [token, gf?.domain, gf?.month, gf?.teams, reloadKey]);

  // Auto-refresh every minute so MTD numbers stay live without the
  // user having to click "Refresh live". Piggybacks on reloadKey
  // (which the manual button also bumps) so the load logic stays in
  // one place. Pro plan can absorb this; on Free we'd never have
  // dared.
  useEffect(() => {
    const id = setInterval(() => setReloadKey(k => k + 1), 60000);
    return () => clearInterval(id);
  }, []);

  // Format percentage values — handles "94.46%", 0.9446, 1.345, "1", etc.
  // Normalise any percentage the source throws at us to a single, clean
  // format: always one decimal place. The MTD sheet is inconsistent —
  // the same column arrives as "100%", "97.70%", "0.00%" or a bare 0–1
  // fraction depending on the row. We strip "%", parse, and reformat so
  // every percentage column reads the same down the table.
  const fmtPct = (val) => {
    if (val === null || val === undefined || val === "") return "—";
    const s = String(val).trim();
    if (s === "--" || s === "-") return "—";
    const hasPct = s.includes("%");
    const n = parseFloat(s.replace(/\s/g, "").replace(",", ".").replace("%", ""));
    if (isNaN(n)) return "—";
    // A bare 0–1 value is a fraction we scale up; anything carrying "%"
    // or already > 1 is taken as a percentage as-is.
    const pct = hasPct ? n : (n > 1 ? n : n * 100);
    return pct.toFixed(1) + "%";
  };

  // "Did this QA have any coaching activity this month?" — coachings
  // delivered plus coachings still pending. Drives the "—" gate on the
  // Pending / Completion columns so QAs with no coaching context don't
  // show a misleading 0% or 0.
  const coachCtx = (r) => (Number(r.coaching_sessions) || 0) + (Number(r.not_coached) || 0);

  // === UPLOAD DATA LOGIC ===
  // Column metadata lives in lib/mtdColumns.js. SYSTEM_COLS / COL_LABELS
  // imported above; the active editable list is derived from row keys
  // once data has loaded.
  const allMtdCols = data.length > 0
    ? Object.keys(data[0]).filter(k => !SYSTEM_COLS.includes(k)).sort()
    : DEFAULT_MTD_COLS;

  const downloadTemplate = () => {
    if (!uploadMonth || uploadCols.length === 0) return;
    const allEmails = [...new Set(roster.map(r => r.email?.toLowerCase()).filter(Boolean))].sort();
    const header = ["qa_email", ...uploadCols].join(",");
    const rows = allEmails.map(email => [email, ...uploadCols.map(() => "")].join(","));
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], {type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `mtd_upload_${uploadMonth}_${uploadCols.join("-")}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const parseCSV = (text) => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
    return lines.slice(1).map(line => {
      const vals = line.split(",");
      const obj = {};
      headers.forEach((h, i) => { obj[h] = vals[i]?.trim() || ""; });
      return obj;
    }).filter(r => r.qa_email);
  };

  const handleFileUpload = (file) => {
    if (!file) return;
    setUploadFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const parsed = parseCSV(e.target.result);
      const preview = parsed.map(row => {
        const existing = data.find(d => d.qa_email?.toLowerCase() === row.qa_email?.toLowerCase() && d.month === uploadMonth);
        const changes = {};
        let hasChanges = false;
        uploadCols.forEach(col => {
          const newVal = row[col];
          if (newVal === "" || newVal === undefined) return;
          const oldVal = existing ? existing[col] : null;
          const willUpdate = uploadOverwrite || oldVal === null || oldVal === "" || oldVal === 0 || oldVal === "0";
          if (willUpdate) { changes[col] = { old: oldVal, new: newVal }; hasChanges = true; }
        });
        return { qa_email: row.qa_email, name: nameFromEmail(row.qa_email), existing: !!existing, changes, hasChanges, raw: row };
      }).filter(r => r.hasChanges);
      setUploadPreview(preview);
      setUploadStep("preview");
    };
    reader.readAsText(file);
  };

  const executeUpload = async () => {
    setUploading(true);
    let rowsAffected = 0, rowsCreated = 0, errors = [];
    try {
      for (const row of uploadPreview) {
        try {
          const body = {};
          const manualFields = {};
          Object.entries(row.changes).forEach(([col, { new: val }]) => {
            body[col] = val; manualFields[col] = true;
          });
          const existing = data.find(d => d.qa_email?.toLowerCase() === row.qa_email?.toLowerCase() && d.month === uploadMonth);
          if (existing) {
            const existingManual = existing.manual_fields || {};
            body.manual_fields = JSON.stringify({ ...existingManual, ...manualFields });
            await sb.query("mtd_scores", { token, method: "PATCH", body, filters: `id=eq.${existing.id}` });
            rowsAffected++;
          } else {
            // Use upsert via PostgREST Prefer header to handle duplicates
            const rosterEntry = roster.find(r => r.email?.toLowerCase() === row.qa_email?.toLowerCase());
            body.qa_email = row.qa_email;
            body.month = uploadMonth;
            body.qa_tl = rosterEntry?.manager_email || "";
            body.manual_fields = JSON.stringify(manualFields);
            const resp = await fetch(`${SUPABASE_URL}/rest/v1/mtd_scores`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "apikey": SUPABASE_ANON,
                "Authorization": `Bearer ${token}`,
                "Prefer": "resolution=merge-duplicates,return=minimal",
              },
              body: JSON.stringify(body),
            });
            if (!resp.ok) {
              const errText = await resp.text();
              throw new Error(errText);
            }
            rowsCreated++;
          }
        } catch (rowErr) {
          errors.push(`${row.qa_email}: ${rowErr.message?.slice(0,80)}`);
        }
      }
      await sb.query("mtd_upload_log", { token, method: "POST", body: {
        uploaded_by: profile?.email, month: uploadMonth, columns_updated: uploadCols,
        rows_affected: rowsAffected, rows_created: rowsCreated,
        overwrite_enabled: uploadOverwrite, filename: uploadFile?.name || "unknown",
      }});
      logActivity(token, profile?.email, "mtd_csv_upload", "mtd_scores", null, 
        `Month: ${uploadMonth}, Columns: ${uploadCols.join(",")}, Updated: ${rowsAffected}, Created: ${rowsCreated}${errors.length>0?`, Errors: ${errors.length}`:""}`);
      if (errors.length > 0 && (rowsAffected + rowsCreated) === 0) {
        setUploadResult({ success: false, error: `All rows failed. First error: ${errors[0]}` });
      } else {
        setUploadResult({ success: true, rowsAffected, rowsCreated, errors: errors.length > 0 ? errors : null });
      }
      setUploadStep("done");
      // Invalidate the shared cache and let each consumer refetch
      // through its own filter (useDashboardData filters by month
      // window, Leaderboard pulls per-month, etc.). Previously we
      // dataCache.set("mtd_scores", newRows) here with the FULL
      // unfiltered payload, poisoning downstream callers that
      // expected only their filtered slice — they got over-broad
      // months mixed into their views until the next 30s TTL.
      dataCache.invalidate("mtd_scores");
      const newRows = await sb.query("mtd_scores_v", {select:"*",filters:"order=month.desc,qa_email.asc",token});
      setData(newRows);
    } catch (e) {
      setUploadResult({ success: false, error: e.message });
      setUploadStep("done");
    }
    setUploading(false);
  };

  const loadUploadLogs = async () => {
    try { const logs = await sb.query("mtd_upload_log", {select:"*",filters:"order=created_at.desc&limit=20",token}); setUploadLogs(logs); } catch(e) { console.error(e); }
  };

  const resetUpload = () => {
    setUploadStep("config"); setUploadCols([]); setUploadOverwrite(false);
    setUploadPreview([]); setUploadFile(null); setUploadResult(null); setUploadLogs([]);
    setUploadMonth(selMonth || (months.length > 0 ? months[0] : ""));
  };

  // Format general values
  const fmt = (val) => {
    if (val === null || val === undefined || val === "") return "—";
    if (typeof val === "string" && val.includes("%")) return val;
    if (typeof val === "number" && !Number.isInteger(val)) return val.toFixed(2);
    return String(val);
  };

  const rosterMap = {};
  roster.forEach(r => { rosterMap[r.email?.toLowerCase()] = r; });
  // Sr QAs (qa_roster.role = 'Sr QA') are intentionally excluded from MTD
  // scoring per product spec — they stay on the roster for visibility but
  // don't appear here.
  const isSrQa = (r) => /^(sr\.?|senior)\s*qa$/i.test((r?.role || "").trim());
  const srQaEmails = new Set(roster.filter(isSrQa).map(r => r.email?.toLowerCase()).filter(Boolean));
  const monthData = data.filter(r => r.month === selMonth && !srQaEmails.has(r.qa_email?.toLowerCase()));
  const qaEmails = [...new Set(monthData.map(r => r.qa_email))].sort();
  const tlEmails = [...new Set(monthData.map(r => r.qa_tl).filter(Boolean))].sort();
  // Skip compound LOBs ("CCU, Escalation, Dispute") that occasionally
  // sneak in from the roster CSV — they're never a real team.
  const scoreTeams = [...new Set(roster.filter(r => r.queue && !r.queue.includes(",") && !isSrQa(r) && (!selDomain || r.email?.endsWith("@"+selDomain))).map(r => r.queue))].sort();
  let filtered = monthData;
  if (selDomain) filtered = filtered.filter(r => r.qa_email?.endsWith("@"+selDomain));
  if (selTeam.length > 0) filtered = filtered.filter(r => selTeam.includes(rosterMap[r.qa_email?.toLowerCase()]?.queue));
  if (selTL.length > 0) filtered = filtered.filter(r => selTL.includes(r.qa_tl));
  if (selQA.length > 0) {
    // Match by the local-part (everything before @) so cross-domain
    // duplicates of the same person collapse. selQA may hold either
    // local-parts (new dropdown format) or full emails (legacy saved
    // views) — normalize both sides to the local-part.
    const selLocals = new Set(selQA.map(e => String(e || "").toLowerCase().split("@")[0]));
    filtered = filtered.filter(r => selLocals.has(String(r.qa_email || "").toLowerCase().split("@")[0]));
  }
  // Apply the slim global filter (Month + Domain only). Page-level
  // selDomain/selTeam/selTL/selQA take precedence — gf.domain is just
  // a default scope when the user hasn't picked one here. People +
  // Teams used to live on gf but were dropped in the filter
  // unification — they're now per-page (selQA / selTeam above).
  if (gf?.domain && !selDomain) filtered = filtered.filter(r => r.qa_email?.endsWith("@"+gf.domain));
  // Live name/email filter — works on top of all the dropdown filters.
  if (tableSearch.trim()) {
    const q = tableSearch.toLowerCase().trim();
    filtered = filtered.filter(r => (r.qa_email || "").toLowerCase().includes(q) || nameFromEmail(r.qa_email).toLowerCase().includes(q));
  }
  // Pull a numeric value out of a percent-or-text cell ("94.00%", "0.94",
  // "—" all map to 94, 94, null). null values are pushed to the bottom
  // regardless of sort direction so they never elbow real data out of view.
  const numFromText = (v) => {
    if (v == null) return null;
    const s = String(v).trim();
    if (!s || s === "--" || s === "—") return null;
    const n = parseFloat(s.replace("%", "").replace(",", "."));
    if (isNaN(n)) return null;
    return s.includes("%") ? n : (n > 0 && n <= 1 ? n * 100 : n);
  };
  const qaSortVal = (r, key) => {
    switch (key) {
      case "specialist":      return nameFromEmail(r.qa_email).toLowerCase();
      case "tl":              return r.qa_tl ? nameFromEmail(r.qa_tl).toLowerCase() : "";
      case "wds":             return r.working_days ?? null;
      case "csat_pct": {
        const v = csatPctValue(r.csat_pct);
        return Number(r.csat_total||0) > 0 ? v : null;
      }
      case "surveys":         return r.csat_total ?? null;
      case "sbs":             return r.sbs ?? null;
      case "non_sbs":         return r.non_sbs ?? null;
      case "dsat":            return r.dsat ?? null;
      // Synthetic keys for the collapsed column groups — sort the
      // combined "Evaluations" column by total evals (SBS+Non-SBS+
      // DSAT) and the combined "Coachings" column by session count.
      case "__evals__":       return (r.sbs || 0) + (r.non_sbs || 0) + (r.dsat || 0);
      case "__coachings__":   return r.coaching_sessions ?? null;
      case "late":            return r.late_count ?? null;
      case "never":           return r.never_count ?? null;
      case "valid":           return r.valid_count ?? null;
      case "invalid":         return r.invalid_count ?? null;
      case "sessions":        return r.coaching_sessions ?? null;
      case "ontime_count":    return r.total_ontime_coachings ?? null;
      case "eligible":        return r.coaching_eligibility_count ?? null;
      case "not_coached":     return r.not_coached ?? null;
      case "rtr":             return r.rtr_count ?? null;
      case "rtr_score":       return numFromText(r.avg_rtr_score);
      case "obs":             return r.observed_coaching_count ?? null;
      case "obs_pct":         return numFromText(r.avg_observation_score_pct);
      case "calib":           return r.calibration_count ?? null;
      case "calib_pct":       return numFromText(r.avg_calibration_match_rate);
      case "completion":      return numFromText(r.coaching_completion_pct);
      case "ontime_pct":      return numFromText(r.ontime_coaching_pct);
      case "jkq":             return r.jkq_result === "Pass" ? 2 : r.jkq_result === "Missed" ? 0 : 1;
      case "tickets_per_day": return Number(r.ticket_per_day) || null;
      case "occupancy":       return numFromText(r.occupancy_pct);
      case "st_time":         return r.side_tasks_duration_mins ?? null;
      case "performance":     return Number(r.final_performance) || null;
      default:                return null;
    }
  };
  const sorted = [...filtered].sort((a, b) => {
    const av = qaSortVal(a, qaSort.key);
    const bv = qaSortVal(b, qaSort.key);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "string") {
      const c = av.localeCompare(bv);
      return qaSort.dir === "asc" ? c : -c;
    }
    return qaSort.dir === "asc" ? av - bv : bv - av;
  });
  // 3-state cycle on the active column: desc → asc → default (performance desc).
  // Clicking a different column always starts at desc.
  const toggleQaSort = (key) => setQaSort(prev => {
    if (prev.key !== key) return { key, dir: "desc" };
    if (prev.dir === "desc") return { key, dir: "asc" };
    return { key: "csat_pct", dir: "desc" }; // back to default
  });
  const qaSortArrow = (key) => qaSort.key === key ? (qaSort.dir === "asc" ? " ▲" : " ▼") : "";


  // Single source of truth for the MTD By-QA table columns. Each entry
  // controls header label, alignment, sort key (matches qaSortVal), the
  // cell renderer, and whether it belongs to a quick-preset bundle.
  // Keys here drive both the header and body, so adding/removing a
  // column is a one-line change.
  const MTD_COLUMNS = [
    { k: "specialist", label: "QA", align: "left", style: { minWidth: 160 }, presets: ["all","perf","coach"], render: r => (
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <div style={{width:28,height:28,borderRadius:"50%",flexShrink:0,background:"var(--accent-light)",color:"var(--accent-text)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:600}}>
          {nameFromEmail(r.qa_email).split(" ").map(p=>p[0]).join("").toUpperCase().slice(0,2)}
        </div>
        <div style={{fontWeight:500,fontSize:13,whiteSpace:"nowrap"}}>{nameFromEmail(r.qa_email)}</div>
      </div>
    )},
    { k: "tl",              label: "TL",          align: "left", presets: ["all","perf","coach"], render: r => <span style={{fontSize:12,color:"var(--tx2)",whiteSpace:"nowrap"}}>{r.qa_tl ? nameFromEmail(r.qa_tl) : "—"}</span> },
    { k: "wds",             label: "WDs",         presets: ["all","perf"],         render: r => r.working_days ?? "—" },
    { k: "csat_pct",        label: "CSAT %",      presets: ["all","perf"],         render: r => { const v=csatPctValue(r.csat_pct); const s=Number(r.csat_total||0); const show=v!=null&&s>0; return <span style={{fontWeight:show?600:400,color:csatColor(v,s)}}>{show?v.toFixed(1)+"%":"—"}</span>; } },
    { k: "surveys",         label: "Surveys",     presets: ["all","perf"],         render: r => r.csat_total ?? "—" },
    { k: "sbs",             label: "SBS",         presets: ["all","perf"],         render: r => r.sbs ?? "—" },
    { k: "non_sbs",         label: "Non-SBS",     presets: ["all","perf"],         render: r => r.non_sbs ?? "—" },
    { k: "dsat",            label: "DSAT",        presets: ["all","perf"],         render: r => r.dsat ?? "—" },
    // Coaching trio, all driven by the live sheet columns (coaching_sessions,
    // not_coached, coaching_completion_pct). We gate Pending / Completion on
    // whether the QA had any coaching activity at all — delivered or pending —
    // so a QA with no coachings shows "—" rather than a misleading 0% / 0.
    { k: "sessions",        label: "Coachings",            presets: ["all","coach"], render: r => r.coaching_sessions ?? "—" },
    { k: "not_coached",     label: "Pending Coachings",    presets: ["all","coach"], render: r => coachCtx(r) === 0 ? <span style={{color:"var(--tx3)"}}>—</span> : <span style={{color:(r.not_coached||0)>0?"var(--amber)":"var(--tx2)",fontWeight:(r.not_coached||0)>0?600:400}}>{r.not_coached ?? 0}</span> },
    { k: "completion",      label: "Coachings Completion", presets: ["all","coach"], render: r => coachCtx(r) === 0 ? "—" : fmtPct(r.coaching_completion_pct) },
    { k: "rtr",             label: "RTR#",                 presets: ["all"],         render: r => r.rtr_count ?? "—" },
    { k: "rtr_score",       label: "RTR Score",            presets: ["all"],         render: r => fmtPct(r.avg_rtr_score) },
    { k: "obs",             label: "CO#",                  presets: ["all","coach"], render: r => r.observed_coaching_count ?? "—" },
    { k: "obs_pct",         label: "CO Score",             presets: ["all","coach"], render: r => fmtPct(r.avg_observation_score_pct) },
    // Calibration % resolves from the sheet's "New Calibration" column (AH)
    // via mtd_scores_v (priority: manual override → calibration_responses →
    // new_calibration → NULL). NULL renders as "—" (e.g. month not yet
    // calibrated) rather than a misleading 0%.
    { k: "calib_pct",       label: "Calibration %",        presets: ["all","coach"], render: r => fmtPct(r.avg_calibration_match_rate) },
    { k: "jkq",             label: "JKQ",                  align: "center", presets: ["all","perf"], render: r =>
      r.jkq_result && r.jkq_result !== "N/A"
        ? <span style={{fontSize:11,padding:"2px 8px",borderRadius:12,fontWeight:500,background:r.jkq_result==="Pass"?"var(--green-bg)":"var(--red-bg)",color:r.jkq_result==="Pass"?"var(--green)":"var(--red)"}}>{r.jkq_result}{r.jkq_score>0?` (${r.jkq_score})`:""}</span>
        : <span style={{color:"var(--tx3)"}}>—</span>
    },
    { k: "tickets_per_day", label: "Tickets/D",            presets: ["all","perf"],  render: r => <span style={{color:"var(--blue)",fontWeight:500}}>{r.ticket_per_day ?? "—"}</span> },
    { k: "occupancy",       label: "Occupancy",            presets: ["all","perf"],  render: r => fmtPct(r.occupancy_pct) },
    { k: "st_time",         label: "ST Time",              presets: ["all"],         render: r => <span style={{fontSize:12,color:"var(--tx2)"}}>{r.side_tasks_duration_mins ? `${Math.floor(r.side_tasks_duration_mins/60)}h ${r.side_tasks_duration_mins%60}m` : "—"}</span> },
  ];
  // Two collapsible groups. EVAL_KEYS / COACH_KEYS list the underlying
  // MTD_COLUMNS that fold into each synthetic header column. The
  // synthetic column is sortable (via __evals__ / __coachings__ in
  // qaSortVal) and renders a chevron next to the label so the
  // affordance ("click to expand") is obvious.
  const EVAL_KEYS = new Set(["sbs", "non_sbs", "dsat"]);
  const COACH_KEYS = new Set();
  const toggleGroup = (g) => setGroupsCollapsed(prev => ({ ...prev, [g]: !prev[g] }));
  // Build the actual rendered column list by walking MTD_COLUMNS in
  // order. When a column belongs to a collapsed group, swap the FIRST
  // hit for the synthetic group column and skip its siblings.
  const baseColumns = MTD_COLUMNS.filter(c => !hiddenCols.has(c.k));
  const visibleColumns = (() => {
    const evalsCol = {
      k: "__evals__",
      label: groupsCollapsed.evals ? "Evaluations ▸" : "Evaluations ▾",
      align: "right",
      // Collapsed: show combined count of SBS+Non-SBS+DSAT so the
      // column carries a meaningful number, not just a label. Header
      // click expands the group rather than sorting — sorting still
      // works via the body's accessor, just on a normal click of the
      // sort chevron via toggleQaSort.
      render: r => {
        const total = (r.sbs || 0) + (r.non_sbs || 0) + (r.dsat || 0);
        return total > 0 ? total : "—";
      },
      isGroupHeader: "evals",
    };
    const coachCol = {
      k: "__coachings__",
      label: groupsCollapsed.coachings ? "Coachings ▸" : "Coachings ▾",
      align: "right",
      render: r => r.coaching_sessions ?? "—",
      isGroupHeader: "coachings",
    };
    const out = [];
    let evalsInserted = false;
    let coachingsInserted = false;
    for (const c of baseColumns) {
      if (EVAL_KEYS.has(c.k)) {
        // Synthetic header is ALWAYS inserted at the group's first
        // child position — that's the only stable click target users
        // have to collapse the group again. When the group is
        // expanded, we also push the individual sub-columns after it;
        // when collapsed, we skip the children entirely.
        if (!evalsInserted) { out.push(evalsCol); evalsInserted = true; }
        if (groupsCollapsed.evals) continue;
      }
      if (COACH_KEYS.has(c.k)) {
        if (!coachingsInserted) { out.push(coachCol); coachingsInserted = true; }
        if (groupsCollapsed.coachings) continue;
      }
      out.push(c);
    }
    return out;
  })();
  const applyPreset = (preset) => {
    if (preset === "all") setHiddenCols(new Set());
    else setHiddenCols(new Set(MTD_COLUMNS.filter(c => !c.presets.includes(preset)).map(c => c.k)));
    setShowColMenu(false);
  };

  if (loading) return <div className="page"><SkeletonPage/></div>;

  return (<div className="page">
    <div className="page-header" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div>
          <div className="page-title">MTD</div>
          <div className="page-subtitle">Month-to-date performance — synced from Metabase hourly</div>
        </div>
        {/* Refresh live — pulls the latest MTD CSV from Google Sheets via
            the mtd-sync edge function, then reloads the table. Visible to
            qa_lead+ only since it triggers a server-side sync. */}
        {hasRole(profile?.role,"qa_lead")&&<button className="btn btn-outline btn-sm" disabled={refreshing} onClick={async()=>{
          if (refreshing) return;
          setRefreshing(true);
          const r = await callEdgeFunction("mtd-sync", { token });
          if (!r.ok) {
            globalToast("error", `Sync failed — ${r.error}`);
          } else {
            dataCache?.invalidate?.();
            setReloadKey(k => k + 1);
            const upserted = r.data?.rows_upserted ?? "?";
            globalToast("success", `Synced ${upserted} row${upserted===1?"":"s"} — refreshing…`);
          }
          setRefreshing(false);
        }} title="Pull the latest MTD data from the Google Sheet" style={{fontSize:12,marginLeft:8,display:"flex",alignItems:"center",gap:6}}>
          {refreshing
            ? <><div className="spinner" style={{width:12,height:12,borderWidth:2}}/>Refreshing…</>
            : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>Refresh live</>}
        </button>}
        {isUploadAllowed&&<button className="btn btn-outline btn-sm" onClick={()=>{resetUpload();setShowUpload(true);loadUploadLogs();}} style={{fontSize:12,marginLeft:8}}>
          <Icon d={icons.upload} size={14}/>Upload data
        </button>}
      </div>
      {sorted.length>0&&<div style={{display:"flex",gap:16,alignItems:"center"}}>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:11,color:"var(--tx3)",fontWeight:600,textTransform:"uppercase",letterSpacing:".5px"}}>QAs</div>
          <div style={{fontSize:22,fontWeight:800,letterSpacing:"-1px"}}>{sorted.length}</div>
        </div>
        <div style={{width:1,height:32,background:"var(--bd)"}}/>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:11,color:"var(--tx3)",fontWeight:600,textTransform:"uppercase",letterSpacing:".5px"}}>Total DSAT</div>
          <div style={{fontSize:22,fontWeight:800,letterSpacing:"-1px",color:"var(--tx)"}}>{sorted.reduce((a,r)=>a+(r.dsat||0),0)}</div>
        </div>
      </div>}
    </div>

    {/* Saved views — star a filter combo, recall it next visit */}
    <div style={{marginBottom: 12}}>
      <SavedViews
        pageKey="mtd"
        currentFilters={{selMonth, selDomain, selTeam, selTL, selQA, mtdView, qaSort, leadSort, groupsCollapsed, tableDense, tableSearch, hiddenCols: [...hiddenCols]}}
        onApply={(f) => {
          if ('selMonth' in f) setSelMonth(f.selMonth || "");
          if ('selDomain' in f) setSelDomain(f.selDomain || "");
          if ('selTeam' in f) setSelTeam(Array.isArray(f.selTeam) ? f.selTeam : (f.selTeam ? [f.selTeam] : []));
          if ('selTL' in f) setSelTL(Array.isArray(f.selTL) ? f.selTL : (f.selTL ? [f.selTL] : []));
          if ('selQA' in f) setSelQA(Array.isArray(f.selQA) ? f.selQA : []);
          if ('mtdView' in f) setMtdView(f.mtdView || "qa");
          if ('qaSort' in f && f.qaSort) setQaSort(f.qaSort);
          if ('leadSort' in f && f.leadSort) setLeadSort(f.leadSort);
          if ('groupsCollapsed' in f && f.groupsCollapsed) setGroupsCollapsed(f.groupsCollapsed);
          if ('tableDense' in f) setTableDense(!!f.tableDense);
          if ('tableSearch' in f) setTableSearch(f.tableSearch || "");
          if ('hiddenCols' in f) setHiddenCols(new Set(Array.isArray(f.hiddenCols) ? f.hiddenCols : []));
        }}
      />
    </div>

    {/* Unified PageFilters strip — same component, same spot, same
        clear behaviour as every other page. The old card-wrapped
        flex-row was 5 form-groups with floating labels; this puts
        each control in one row with the standard "× Clear" at the
        right and an inline search input that filters the table.

        Bug fix: previously, picking a different Month wiped every
        other selection (domain / team / lead / specialist). Now Month
        only changes the time scope — the rest of the filters stick. */}
    {/* No search input here — the "Quick filter" above the table
        already drives tableSearch, so a second input was a duplicate.
        × Clear in this strip wipes Domain/Team/Lead/Specialist
        + the Quick filter text in one go. */}
    <PageFilters
      onClear={() => { setSelDomain(""); setSelTeam([]); setSelTL([]); setSelQA([]); setTableSearch(""); }}
    >
      <SearchableSelect
        options={months}
        value={selMonth}
        onChange={v => setSelMonth(v)}
        placeholder="Select month"
      />
      <SearchableSelect
        options={[{value:"tabby.ai",label:"tabby.ai"},{value:"tabby.sa",label:"tabby.sa"}]}
        value={selDomain}
        onChange={v => { setSelDomain(v); setSelTeam([]); setSelTL([]); setSelQA([]); }}
        placeholder="All domains"
      />
      <SearchableSelect
        multi
        options={scoreTeams}
        value={selTeam}
        onChange={v => { setSelTeam(v); setSelTL([]); setSelQA([]); }}
        placeholder="All teams"
      />
      <SearchableSelect
        multi
        options={tlEmails.map(e => ({ value: e, label: nameFromEmail(e) }))}
        value={selTL}
        onChange={v => { setSelTL(v); setSelQA([]); }}
        placeholder={`All leads (${tlEmails.length})`}
      />
      <SearchableSelect
        options={(() => {
          // Dedupe by local-part so QAs with both @tabby.ai and
          // @tabby.sa email rows (cross-domain split) show up once.
          // Option value is the local-part — the filter above is
          // local-part-aware and accepts either format from legacy
          // saved views.
          const seen = new Map(); // local-part → { value, label }
          for (const r of filtered) {
            const e = r.qa_email;
            if (!e) continue;
            const lp = String(e).toLowerCase().split("@")[0];
            if (!seen.has(lp)) seen.set(lp, { value: lp, label: nameFromEmail(e) });
          }
          return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
        })()}
        value={selQA}
        onChange={setSelQA}
        placeholder={`All specialists (${filtered.length})`}
        multi
      />
    </PageFilters>

    {sorted.length === 0 ? (() => {
      // Distinguish between "no data synced at all" and "filtered down
      // to nothing" so the user knows whether to clear filters or
      // wait for the next sync. Lead/Domain/Team/Specialist counts
      // are the user's filter signals; tableSearch is the inline one.
      const hasFilter =
        (selQA && selQA.length > 0) ||
        (selTL && selTL.length > 0) ||
        !!selDomain ||
        (selTeam && selTeam.length > 0) ||
        (tableSearch && tableSearch.trim().length > 0);
      // Pre-compute the human-readable filter summary outside JSX so
      // we don't end up with template-literals nested in template-
      // literals inside an inline JSX ternary (parser hates that).
      const filterParts = [];
      if (selQA && selQA.length > 0) filterParts.push(selQA.length + " specialist" + (selQA.length > 1 ? "s" : ""));
      if (selTL && selTL.length > 0) filterParts.push(selTL.length === 1 ? "lead: " + nameFromEmail(selTL[0]) : selTL.length + " leads");
      if (selDomain) filterParts.push("domain: " + selDomain);
      if (selTeam && selTeam.length > 0) filterParts.push(selTeam.length === 1 ? "team: " + selTeam[0] : selTeam.length + " teams");
      if (tableSearch && tableSearch.trim()) filterParts.push('search: "' + tableSearch.trim() + '"');
      const filterDesc = filterParts.length > 0 ? " (" + filterParts.join(" · ") + ")" : "";
      const clearAll = () => {
        setSelQA([]); setSelTL([]); setSelDomain(""); setSelTeam([]); setTableSearch("");
      };
      const searchActive = !!(tableSearch && tableSearch.trim());
      return (
        <div className="card">
          {/* When the Quick filter is what killed the results, render
              the same Quick-filter input that lives in the normal
              table-controls row right at the top of the empty state,
              autofocused. Lets the user backspace the bad text away
              instead of having to find a button to click. */}
          {searchActive && (
            <div style={{display:"flex",gap:8,alignItems:"center",padding:"10px 12px",borderBottom:"1px solid var(--bd2)",flexWrap:"wrap"}}>
              <div style={{position:"relative",flex:1,minWidth:200,maxWidth:380}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--tx3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)"}}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                <input
                  className="form-input"
                  value={tableSearch}
                  onChange={(e)=>setTableSearch(e.target.value)}
                  placeholder="Quick filter (0 rows)"
                  autoFocus
                  ref={(el) => { if (el && document.activeElement !== el) { try { el.setSelectionRange(el.value.length, el.value.length); } catch {} } }}
                  style={{paddingLeft:30,fontSize:12,height:32}}
                />
                {tableSearch && (
                  <button onClick={()=>setTableSearch("")} title="Clear (or just backspace)" style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"var(--tx3)",fontSize:14,lineHeight:1}}>×</button>
                )}
              </div>
              <span style={{fontSize:11,color:"var(--tx3)"}}>Press <kbd style={{padding:"1px 6px",borderRadius:4,border:"1px solid var(--bd)",fontSize:10,fontFamily:"var(--font)",background:"var(--bg)"}}>Backspace</kbd> to edit</span>
            </div>
          )}
          <div className="placeholder" style={{padding:searchActive?"32px 24px":"56px 24px",textAlign:"center"}}>
            {hasFilter ? <>
              <div style={{fontSize:searchActive?28:36,marginBottom:10}}>🔍</div>
              <h3 style={{fontSize:15,fontWeight:700,color:"var(--tx)",marginBottom:6}}>No matching records</h3>
              <p style={{color:"var(--tx3)",fontSize:13,maxWidth:340,margin:"0 auto 18px"}}>
                {selMonth} has data, but nothing matches your current filters{filterDesc}.
              </p>
              <button className="btn btn-outline btn-sm" onClick={clearAll}>Clear all filters</button>
            </> : <>
              <div style={{fontSize:36,marginBottom:10}}>📭</div>
              <h3 style={{fontSize:15,fontWeight:700,color:"var(--tx)",marginBottom:6}}>No data for {selMonth}</h3>
              <p style={{color:"var(--tx3)",fontSize:13,maxWidth:340,margin:"0 auto"}}>
                The Google Sheet hasn't synced data for this month yet. Try a different month, or wait for the next hourly sync.
              </p>
            </>}
          </div>
        </div>
      );
    })() : (
      <div className="card">
        <div className="card-header">
          <span className="card-title">{selMonth} — {sorted.length} specialists</span>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{display:"flex",borderRadius:8,border:"1px solid var(--bd)",overflow:"hidden"}}>
              <button onClick={()=>setMtdView("qa")} style={{padding:"4px 10px",fontSize:11,fontWeight:600,border:"none",cursor:"pointer",fontFamily:"var(--font)",background:mtdView==="qa"?"var(--tabby-purple)":"transparent",color:mtdView==="qa"?"#fff":"var(--tx3)"}}>By QA</button>
              <button onClick={()=>setMtdView("lead")} style={{padding:"4px 10px",fontSize:11,fontWeight:600,border:"none",cursor:"pointer",fontFamily:"var(--font)",background:mtdView==="lead"?"var(--tabby-purple)":"transparent",color:mtdView==="lead"?"#fff":"var(--tx3)"}}>By Lead</button>
            </div>
            <span style={{fontSize:12,color:"var(--tx3)"}}>Synced: {sorted[0]?.synced_at ? new Date(sorted[0].synced_at).toLocaleString() : "—"}</span>
            <button className="btn btn-outline btn-sm" onClick={()=>{
              const csv=["QA,Email,TL,SBS,Non-SBS,DSAT,Late,Never,Valid,Invalid,Sessions,On-time Coaching,Eligible,Not Coached,RTR,RTR Score,Observations,Obs %,Calibrations,Calib %,Completion %,On-time %,JKQ,JKQ Result,Tickets/day,Occupancy %,Working Days,ST Time (mins),ST Time,CSAT %,Surveys"];
              sorted.forEach(r=>{
                const stMins=r.side_tasks_duration_mins||0;
                const stFormatted=stMins?`${Math.floor(stMins/60)}h ${stMins%60}m`:"";
                csv.push([
                  `"${nameFromEmail(r.qa_email)}"`,r.qa_email,`"${r.qa_tl?nameFromEmail(r.qa_tl):""}"`,
                  r.sbs||0,r.non_sbs||0,r.dsat||0,r.late_count||0,r.never_count||0,r.valid_count||0,r.invalid_count||0,
                  r.coaching_sessions||0,r.total_ontime_coachings||0,r.coaching_eligibility_count||0,r.not_coached||0,
                  r.rtr_count||0,r.avg_rtr_score||0,r.observed_coaching_count||0,r.avg_observation_score_pct||0,
                  r.calibration_count||0,r.avg_calibration_match_rate||0,
                  r.coaching_completion_pct||0,r.ontime_coaching_pct||0,
                  r.jkq_score||"",`"${r.jkq_result||""}"`,r.ticket_per_day||0,r.occupancy_pct||0,
                  r.working_days||0,stMins,`"${stFormatted}"`,
                  csatPctValue(r.csat_pct)!=null?csatPctValue(r.csat_pct).toFixed(1):"",r.csat_total??0
                ].join(","));
              });
              const blob=new Blob([csv.join("\n")],{type:"text/csv"});
              const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`performance_${selMonth}.csv`;a.click();
            }} style={{fontSize:11}}>
              <Icon d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" size={13}/>Export CSV
            </button>
            <button className="btn btn-outline btn-sm" onClick={()=>{
              const header="QA\tEmail\tTL\tSBS\tNon-SBS\tDSAT\tLate\tNever\tValid\tInvalid\tSessions\tOn-time Coaching\tEligible\tNot Coached\tRTR\tRTR Score\tObservations\tObs %\tCalibrations\tCalib %\tCompletion %\tOn-time %\tJKQ\tJKQ Result\tTickets/day\tOccupancy %\tWorking Days\tST Time (mins)\tST Time\tCSAT %\tSurveys";
              const rows=sorted.map(r=>{
                const stMins=r.side_tasks_duration_mins||0;
                const stFormatted=stMins?`${Math.floor(stMins/60)}h ${stMins%60}m`:"";
                return [
                  nameFromEmail(r.qa_email),r.qa_email,r.qa_tl?nameFromEmail(r.qa_tl):"",
                  r.sbs||0,r.non_sbs||0,r.dsat||0,r.late_count||0,r.never_count||0,r.valid_count||0,r.invalid_count||0,
                  r.coaching_sessions||0,r.total_ontime_coachings||0,r.coaching_eligibility_count||0,r.not_coached||0,
                  r.rtr_count||0,r.avg_rtr_score||0,r.observed_coaching_count||0,r.avg_observation_score_pct||0,
                  r.calibration_count||0,r.avg_calibration_match_rate||0,
                  r.coaching_completion_pct||0,r.ontime_coaching_pct||0,
                  r.jkq_score||"",r.jkq_result||"",r.ticket_per_day||0,r.occupancy_pct||0,
                  r.working_days||0,stMins,stFormatted,
                  csatPctValue(r.csat_pct)!=null?csatPctValue(r.csat_pct).toFixed(1):"",r.csat_total??0
                ].join("\t");
              });
              navigator.clipboard.writeText([header,...rows].join("\n")).then(()=>globalToast("success","Copied to clipboard — paste into Google Sheets"));
            }} style={{fontSize:11}}>
              <Icon d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" size={13}/>Copy for Sheets
            </button>
          </div>
        </div>
        {mtdView==="qa"&&<>
          {/* Table controls — search, density toggle, column visibility menu */}
          <div style={{display:"flex",gap:8,alignItems:"center",padding:"10px 12px",borderBottom:"1px solid var(--bd2)",flexWrap:"wrap"}}>
            <div style={{position:"relative",flex:1,minWidth:200,maxWidth:320}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--tx3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)"}}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input className="form-input" value={tableSearch} onChange={e=>setTableSearch(e.target.value)} placeholder={`Quick filter (${filtered.length} rows)`} style={{paddingLeft:30,fontSize:12,height:32}}/>
              {tableSearch && <button onClick={()=>setTableSearch("")} style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"var(--tx3)",fontSize:14,lineHeight:1}}>×</button>}
            </div>
            <button className="btn btn-outline btn-sm" onClick={()=>setTableDense(d=>!d)} title="Toggle row density" style={{fontSize:11}}>
              {tableDense ? "↕ Comfortable" : "↔ Compact"}
            </button>
            <div style={{position:"relative"}}>
              <button className="btn btn-outline btn-sm" onClick={()=>setShowColMenu(s=>!s)} style={{fontSize:11}}>
                ⚙ Columns ({visibleColumns.length}/{MTD_COLUMNS.length})
              </button>
              {showColMenu && <>
                <div onClick={()=>setShowColMenu(false)} style={{position:"fixed",inset:0,zIndex:99}}/>
                <div style={{position:"absolute",top:"calc(100% + 6px)",right:0,zIndex:100,background:"var(--bg3)",border:"1px solid var(--bd)",borderRadius:10,boxShadow:"var(--shadow-lg)",minWidth:240,maxHeight:420,overflowY:"auto"}}>
                  <div style={{padding:"8px 12px",borderBottom:"1px solid var(--bd2)",display:"flex",gap:6,flexWrap:"wrap"}}>
                    <button className="btn btn-outline btn-sm" onClick={()=>applyPreset("all")} style={{fontSize:10,padding:"3px 8px"}}>All</button>
                    <button className="btn btn-outline btn-sm" onClick={()=>applyPreset("perf")} style={{fontSize:10,padding:"3px 8px"}}>Performance</button>
                    <button className="btn btn-outline btn-sm" onClick={()=>applyPreset("coach")} style={{fontSize:10,padding:"3px 8px"}}>Coaching</button>
                  </div>
                  <div style={{padding:"4px 0"}}>
                    {MTD_COLUMNS.map(c => (
                      <label key={c.k} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 12px",fontSize:12,cursor:"pointer"}}
                        onMouseEnter={e=>e.currentTarget.style.background="var(--bg)"}
                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                        <input type="checkbox" checked={!hiddenCols.has(c.k)} onChange={e=>{
                          const next = new Set(hiddenCols);
                          if (e.target.checked) next.delete(c.k); else next.add(c.k);
                          setHiddenCols(next);
                        }} style={{cursor:"pointer"}}/>
                        <span>{c.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </>}
            </div>
          </div>
          <div className={`table-wrap table-wrap-sticky table-sticky-first${tableDense ? " table-dense" : ""}`}>
            <table>
              <thead>
                <tr>
                  <th style={{width:36,textAlign:"center"}}><input type="checkbox" checked={sorted.length>0&&selectedRows.size===sorted.length} onChange={e=>{if(e.target.checked){setSelectedRows(new Set(sorted.map(r=>r.qa_email)));}else{setSelectedRows(new Set());}}} style={{cursor:"pointer"}}/></th>
                  {visibleColumns.map(c => (
                    <th
                      key={c.k}
                      onClick={() => c.isGroupHeader ? toggleGroup(c.isGroupHeader) : toggleQaSort(c.k)}
                      title={c.isGroupHeader ? `Click to ${groupsCollapsed[c.isGroupHeader] ? "expand" : "collapse"}` : `Sort by ${c.label}`}
                      className={c.isGroupHeader ? "" : `sortable${qaSort.key === c.k ? " is-sorted" : ""}`}
                      style={{ textAlign: c.align || "center", whiteSpace: "nowrap", cursor: "pointer", ...(c.style || {}), ...(c.isGroupHeader ? { background: "var(--bg2)", color: "var(--tabby-purple)", fontWeight: 700 } : {}) }}
                    >
                      {c.label}{c.isGroupHeader ? "" : qaSortArrow(c.k)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.id} className={selectedRows.has(r.qa_email) ? "is-selected" : ""}
                      onContextMenu={(e) => ctxMenu.openFor(e, [
                        { label: "View profile", onClick: () => { window.location.hash = `#/profile?qa=${encodeURIComponent(r.qa_email)}`; } },
                        { label: "Open Leaderboard", onClick: () => { window.location.hash = "#/leaderboard"; } },
                        { divider: true },
                        { label: "Copy email", onClick: () => navigator.clipboard?.writeText(r.qa_email).then(() => globalToast("success", "Email copied")) },
                        { label: "Copy name", onClick: () => navigator.clipboard?.writeText(nameFromEmail(r.qa_email)).then(() => globalToast("success", "Name copied")) },
                      ])}
                      style={{background:selectedRows.has(r.qa_email)?"var(--primary-light)":undefined}}>
                    <td style={{textAlign:"center"}}><input type="checkbox" checked={selectedRows.has(r.qa_email)} onChange={e=>{const next=new Set(selectedRows);if(e.target.checked)next.add(r.qa_email);else next.delete(r.qa_email);setSelectedRows(next);}} style={{cursor:"pointer"}} onClick={e=>e.stopPropagation()}/></td>
                    {visibleColumns.map(c => (
                      <td key={c.k} style={{textAlign: c.align || "center"}}>{c.render(r)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>}

        {/* Lead Aggregation View */}
        {mtdView==="lead"&&(()=>{
          // Bugfix: previous code did `if (r.avg_rtr_score) push(parseFloat(...)||0)`,
          // which is truthy for the string "0" (and "0.00") — Postgres returns
          // numerics as strings, so QAs with no activity for a metric (RTR=0,
          // occupancy=0, etc.) had a literal 0 pushed into the lead's average,
          // dragging it down. Helper below parses first and only includes
          // values strictly > 0, so QAs with no activity for a metric are
          // excluded from THAT metric's average (they still count for the
          // sums above).
          const pushPos=(arr,raw)=>{const v=parseFloat(raw);if(!isNaN(v)&&v>0)arr.push(v);};
          // Same as pushPos but normalises fractional percentages (e.g., 0.95)
          // to whole percentages (95). Most rows already arrive as 0-100 but
          // some upstream paths return 0-1, and mixing both in one average
          // produces nonsense. Threshold is <= 1 (not <= 2) so a legitimate
          // "1.5%" stays as 1.5 instead of being misread as 150.
          const pushPctPos=(arr,raw)=>{let v=parseFloat(raw);if(isNaN(v)||v<=0)return;if(v<=1)v*=100;arr.push(v);};
          const leadMap={};
          sorted.forEach(r=>{
            const tl=(r.qa_tl||"unknown").toLowerCase();
            if(!leadMap[tl])leadMap[tl]={tl:r.qa_tl||"Unknown",count:0,sbs:0,non_sbs:0,dsat:0,late:0,never:0,valid:0,invalid:0,sessions:0,ontime:0,eligible:0,not_coached:0,rtr:0,rtr_scores:[],obs:0,obs_scores:[],calib:0,calib_scores:[],completion:[],ontime_pct:[],tickets:[],occupancy:[],days:0,st_mins:0,performance:[],csat_weighted_sum:0,csat_weight:0,csat_simple_sum:0,csat_simple_count:0,csat_total:0};
            const l=leadMap[tl];
            l.count++;l.sbs+=(r.sbs||0);l.non_sbs+=(r.non_sbs||0);l.dsat+=(r.dsat||0);l.late+=(r.late_count||0);l.never+=(r.never_count||0);l.valid+=(r.valid_count||0);l.invalid+=(r.invalid_count||0);
            l.sessions+=(r.coaching_sessions||0);l.ontime+=(r.total_ontime_coachings||0);l.eligible+=(r.coaching_eligibility_count||0);l.not_coached+=(r.not_coached||0);
            l.rtr+=(r.rtr_count||0);pushPos(l.rtr_scores,r.avg_rtr_score);
            l.obs+=(r.observed_coaching_count||0);pushPos(l.obs_scores,r.avg_observation_score_pct);
            l.calib+=(r.calibration_count||0);pushPos(l.calib_scores,r.avg_calibration_match_rate);
            pushPctPos(l.completion,r.coaching_completion_pct);
            pushPctPos(l.ontime_pct,r.ontime_coaching_pct);
            pushPos(l.tickets,r.ticket_per_day);
            pushPctPos(l.occupancy,r.occupancy_pct);
            l.days+=(r.working_days||0);l.st_mins+=(r.side_tasks_duration_mins||0);
            pushPos(l.performance,r.final_performance);
            const _csat=csatPctValue(r.csat_pct);
            if(_csat!=null){
              const surveys=Number(r.csat_total||0);
              l.csat_simple_sum+=_csat; l.csat_simple_count++;
              if(surveys>0){ l.csat_weighted_sum+=_csat*surveys; l.csat_weight+=surveys; }
              l.csat_total+=surveys;
            }
          });
          const avg=(arr)=>arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:0;
          const leadCsat=(l)=>l.csat_weight>0?l.csat_weighted_sum/l.csat_weight:(l.csat_simple_count>0?l.csat_simple_sum/l.csat_simple_count:null);
          // Click-to-sort on the lead table. Default is avg performance
          // desc (the previous static sort); any column can be clicked
          // to override. Two-state cycle on the active column (desc ↔
          // asc); a click on a different column always starts at desc.
          const leadSortVal = (l, k) => {
            switch (k) {
              case "lead":         return nameFromEmail(l.tl || "").toLowerCase();
              case "qas":          return l.count;
              case "csat":         return leadCsat(l);
              case "surveys":      return l.csat_total ?? null;
              case "sbs":          return l.sbs;
              case "non_sbs":      return l.non_sbs;
              case "dsat":         return l.dsat;
              case "sessions":     return l.sessions;
              case "ontime":       return l.ontime;
              case "not_coached":  return l.not_coached;
              case "rtr":          return l.rtr;
              case "avg_rtr":      return avg(l.rtr_scores);
              case "obs":          return l.obs;
              case "co_score":     return avg(l.obs_scores);
              case "calib":        return l.calib;
              case "calib_pct":    return avg(l.calib_scores);
              case "completion":   return avg(l.completion);
              case "tickets":      return avg(l.tickets);
              case "occupancy":    return avg(l.occupancy);
              case "days":         return l.days;
              case "st_time":      return l.st_mins;
              case "performance":  return avg(l.performance);
              default:             return null;
            }
          };
          const leadCols = [
            { k: "lead",        label: "Lead",                 align: "left", style: { minWidth: 160 } },
            { k: "qas",         label: "QAs" },
            { k: "days",        label: "WDs" },
            { k: "csat",        label: "CSAT %" },
            { k: "surveys",     label: "Surveys" },
            { k: "sbs",         label: "SBS" },
            { k: "non_sbs",     label: "Non-SBS" },
            { k: "dsat",        label: "DSAT" },
            { k: "sessions",    label: "Coachings" },
            { k: "not_coached", label: "Pending Coachings" },
            { k: "completion",  label: "Coachings Completion" },
            { k: "rtr",         label: "RTR#" },
            { k: "avg_rtr",     label: "RTR Score" },
            { k: "obs",         label: "CO#" },
            { k: "co_score",    label: "CO Score" },
            { k: "calib_pct",   label: "Calibration %" },
            { k: "tickets",     label: "Tickets/D" },
            { k: "occupancy",   label: "Occupancy" },
            { k: "st_time",     label: "ST Time" },
          ];
          const leads = Object.values(leadMap).sort((a, b) => {
            const av = leadSortVal(a, leadSort.key);
            const bv = leadSortVal(b, leadSort.key);
            if (av == null && bv == null) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            if (typeof av === "string") {
              const c = av.localeCompare(bv);
              return leadSort.dir === "asc" ? c : -c;
            }
            return leadSort.dir === "asc" ? av - bv : bv - av;
          });
          const toggleLeadSort = (k) => setLeadSort(prev => {
            if (prev.key !== k) return { key: k, dir: "desc" };
            if (prev.dir === "desc") return { key: k, dir: "asc" };
            return { key: "csat", dir: "desc" };
          });
          const leadSortArrow = (k) => leadSort.key === k ? (leadSort.dir === "asc" ? " ▲" : " ▼") : "";
          return <div className="table-wrap table-wrap-sticky"><table>
            <thead><tr>
              {leadCols.map(c => (
                <th
                  key={c.k}
                  onClick={() => toggleLeadSort(c.k)}
                  title={`Sort by ${c.label}`}
                  className={`sortable${leadSort.key === c.k ? " is-sorted" : ""}`}
                  style={{ textAlign: c.align || "center", cursor: "pointer", whiteSpace: "nowrap", ...(c.style || {}) }}
                >
                  {c.label}{leadSortArrow(c.k)}
                </th>
              ))}
            </tr></thead>
            <tbody>
              {leads.map(l=>{
                return <tr key={l.tl}>
                  <td><div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:28,height:28,borderRadius:"50%",flexShrink:0,background:"var(--accent-light)",color:"var(--accent-text)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:600}}>
                      {nameFromEmail(l.tl).split(" ").map(p=>p[0]).join("").toUpperCase().slice(0,2)}
                    </div>
                    <div><div style={{fontWeight:600,fontSize:13}}>{nameFromEmail(l.tl)}</div><div style={{fontSize:10,color:"var(--tx3)"}}>{l.count} QA{l.count!==1?"s":""}</div></div>
                  </div></td>
                  <td style={{textAlign:"center",fontWeight:600}}>{l.count}</td>
                  <td style={{textAlign:"center"}}>{l.days}</td>
                  {(()=>{const v=leadCsat(l);const s=Number(l.csat_total||0);const show=v!=null&&s>0;return <td style={{textAlign:"center",fontWeight:600,color:csatColor(v,s)}}>{show?v.toFixed(1)+"%":"—"}</td>;})()}
                  <td style={{textAlign:"center"}}>{l.csat_total || "—"}</td>
                  <td style={{textAlign:"center"}}>{l.sbs}</td>
                  <td style={{textAlign:"center"}}>{l.non_sbs}</td>
                  <td style={{textAlign:"center",color:"var(--tx2)"}}>{l.dsat}</td>
                  <td style={{textAlign:"center"}}>{l.sessions}</td>
                  <td style={{textAlign:"center",color:l.not_coached>0?"var(--amber)":"var(--tx3)",fontWeight:l.not_coached>0?600:400}}>{l.not_coached}</td>
                  <td style={{textAlign:"center"}}>{avg(l.completion).toFixed(1)}%</td>
                  <td style={{textAlign:"center"}}>{l.rtr}</td>
                  <td style={{textAlign:"center"}}>{avg(l.rtr_scores).toFixed(1)}</td>
                  <td style={{textAlign:"center"}}>{l.obs}</td>
                  <td style={{textAlign:"center"}}>{avg(l.obs_scores).toFixed(1)}%</td>
                  <td style={{textAlign:"center"}}>{l.calib_scores.length?avg(l.calib_scores).toFixed(1)+"%":"—"}</td>
                  <td style={{textAlign:"center"}}>{avg(l.tickets).toFixed(1)}</td>
                  <td style={{textAlign:"center"}}>{avg(l.occupancy).toFixed(1)}%</td>
                  <td style={{textAlign:"center",fontSize:12,color:"var(--tx2)"}}>{l.st_mins?`${Math.floor(l.st_mins/60)}h ${l.st_mins%60}m`:"—"}</td>
                </tr>;
              })}
            </tbody>
          </table></div>;
        })()}
      </div>
    )}

    {/* Upload Data Modal */}
    <MtdUploadModal
      open={showUpload}
      onClose={() => setShowUpload(false)}
      uploadStep={uploadStep} setUploadStep={setUploadStep}
      uploadMonth={uploadMonth} setUploadMonth={setUploadMonth}
      uploadCols={uploadCols} setUploadCols={setUploadCols}
      uploadOverwrite={uploadOverwrite} setUploadOverwrite={setUploadOverwrite}
      uploadPreview={uploadPreview} setUploadPreview={setUploadPreview}
      uploading={uploading}
      uploadResult={uploadResult}
      uploadLogs={uploadLogs}
      months={months}
      allMtdCols={allMtdCols}
      nameFromEmail={nameFromEmail}
      handleFileUpload={handleFileUpload}
      executeUpload={executeUpload}
      downloadTemplate={downloadTemplate}
    />
    {/* Floating action bar for bulk selection */}
    {selectedRows.size>0&&<div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",zIndex:1000,background:"rgba(13,11,16,.85)",backdropFilter:"blur(12px)",borderRadius:14,padding:"12px 20px",display:"flex",alignItems:"center",gap:16,boxShadow:"0 12px 40px rgba(0,0,0,.4)",border:"1px solid rgba(255,255,255,.08)"}}>
      <span style={{fontSize:13,fontWeight:600,color:"#fff"}}>{selectedRows.size} selected</span>
      <button className="btn btn-primary btn-sm" onClick={()=>{setBulkTaskModal(true);setBulkForm({title:"",description:"",priority:"medium",due_date:""});}} style={{fontSize:12}}>
        <Icon d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" size={14}/>Assign Task
      </button>
      <button onClick={()=>setSelectedRows(new Set())} style={{background:"none",border:"1px solid rgba(255,255,255,.2)",borderRadius:8,padding:"5px 12px",fontSize:12,color:"rgba(255,255,255,.7)",cursor:"pointer",fontFamily:"var(--font)",fontWeight:500}}>Clear</button>
    </div>}

    <MtdBulkTaskModal
      open={bulkTaskModal}
      onClose={() => setBulkTaskModal(false)}
      selectedRows={selectedRows}
      bulkForm={bulkForm}
      setBulkForm={setBulkForm}
      bulkSending={bulkSending}
      onSubmit={async () => {
        setBulkSending(true);
        let created = 0;
        try {
          for (const email of selectedRows) {
            await sb.query("tasks", { token, method: "POST", body: {
              assigned_to: email,
              created_by: profile?.email,
              title: bulkForm.title.trim(),
              description: bulkForm.description.trim() || null,
              priority: bulkForm.priority,
              due_date: bulkForm.due_date || null,
              status: "pending",
            } });
            created++;
          }
          globalToast("success", `Created ${created} task${created !== 1 ? "s" : ""}`);
          setBulkTaskModal(false);
          setSelectedRows(new Set());
        } catch (e) {
          globalToast("error", `Created ${created}/${selectedRows.size} — ${e.message || "error"}`);
        }
        setBulkSending(false);
      }}
    />
    <ctxMenu.Menu />
  </div>);
}

export default ScoreEntryPage;
