import React from "react";
import { Icon, icons } from "../Icons.jsx";
import SearchableSelect from "../SearchableSelect.jsx";
import { COL_LABELS } from "../../lib/mtdColumns.js";
import Modal from "../Modal.jsx";

// Three-step MTD CSV upload modal: config (pick month + columns +
// safe-mode), preview (diff per QA), done (success/error summary).
// All side-effects (fetch + Supabase mutations) live in the parent
// (ScoreEntryPage). The modal is a stateless rendering shell over the
// hoisted state.
export default function MtdUploadModal({
  open,
  onClose,
  uploadStep, setUploadStep,
  uploadMonth, setUploadMonth,
  uploadCols, setUploadCols,
  uploadOverwrite, setUploadOverwrite,
  uploadPreview, setUploadPreview,
  uploading,
  uploadResult,
  uploadLogs,
  months,
  allMtdCols,
  nameFromEmail,
  handleFileUpload,
  executeUpload,
  downloadTemplate,
}) {
  if (!open) return null;
  return (
    <Modal onClose={onClose} maxWidth={720} padding={0}>
      <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 24px", margin: 0, borderBottom: "1px solid var(--bd2)" }}>
          <span className="card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon d={icons.upload} size={18} />Upload data to MTD
          </span>
          <button className="btn btn-outline btn-sm" onClick={onClose} style={{ padding: "4px 8px" }}>
            <Icon d="M6 18L18 6M6 6l12 12" size={16} />
          </button>
        </div>

        {uploadStep === "config" && (
          <div style={{ padding: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div className="form-group">
                <label className="form-label">Month</label>
                <SearchableSelect options={months} value={uploadMonth} onChange={setUploadMonth} placeholder="Select month" />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  Overwrite existing values
                  <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 6, background: uploadOverwrite ? "var(--red-bg)" : "var(--bg3)", color: uploadOverwrite ? "var(--red)" : "var(--tx3)", fontWeight: 600 }}>
                    {uploadOverwrite ? "ON" : "OFF"}
                  </span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "var(--tx2)" }}>
                  <input type="checkbox" checked={uploadOverwrite} onChange={e => setUploadOverwrite(e.target.checked)} style={{ width: 16, height: 16 }} />
                  {uploadOverwrite ? "Will replace existing synced data" : "Only fills empty/null cells (safe mode)"}
                </label>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label">Columns to update (pick one or more)</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, maxHeight: 240, overflow: "auto", padding: 8, border: "1px solid var(--bd2)", borderRadius: 8, background: "var(--bg)" }}>
                {allMtdCols.map(col => (
                  <label key={col} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: uploadCols.includes(col) ? "var(--tx)" : "var(--tx3)", padding: "4px 6px", borderRadius: 6, background: uploadCols.includes(col) ? "var(--accent-light)" : "transparent" }}>
                    <input type="checkbox" checked={uploadCols.includes(col)} onChange={e => {
                      if (e.target.checked) setUploadCols([...uploadCols, col]);
                      else setUploadCols(uploadCols.filter(c => c !== col));
                    }} style={{ width: 14, height: 14 }} />
                    {COL_LABELS[col] || col}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              <button className="btn btn-primary" disabled={!uploadMonth || uploadCols.length === 0} onClick={downloadTemplate}>
                <Icon d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" size={16} />Download CSV template
              </button>
              <label className="btn btn-outline" style={{ cursor: !uploadMonth || uploadCols.length === 0 ? "not-allowed" : "pointer", opacity: !uploadMonth || uploadCols.length === 0 ? .5 : 1 }}>
                <Icon d={icons.upload} size={16} />Upload filled CSV
                <input type="file" accept=".csv" style={{ display: "none" }} disabled={!uploadMonth || uploadCols.length === 0}
                  onChange={e => { if (e.target.files[0]) handleFileUpload(e.target.files[0]); e.target.value = ""; }} />
              </label>
            </div>

            {uploadLogs.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 8 }}>Recent uploads</div>
                <div style={{ fontSize: 12, border: "1px solid var(--bd2)", borderRadius: 8, overflow: "hidden" }}>
                  {uploadLogs.map((log, i) => (
                    <div key={log.id} style={{ padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: i < uploadLogs.length - 1 ? "1px solid var(--bd)" : "none", background: i % 2 === 0 ? "var(--bg)" : "transparent" }}>
                      <div>
                        <span style={{ fontWeight: 500, color: "var(--tx)" }}>{nameFromEmail(log.uploaded_by)}</span>
                        <span style={{ color: "var(--tx3)", margin: "0 6px" }}>uploaded</span>
                        <span style={{ fontWeight: 500, color: "var(--accent-text)" }}>{(log.columns_updated || []).join(", ")}</span>
                        <span style={{ color: "var(--tx3)", margin: "0 6px" }}>for</span>
                        <span style={{ fontWeight: 500 }}>{log.month}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 11, color: "var(--tx3)" }}>{log.rows_affected} updated{log.rows_created > 0 ? `, ${log.rows_created} created` : ""}</span>
                        {log.overwrite_enabled && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: "var(--red-bg)", color: "var(--red)", fontWeight: 600 }}>OVERWRITE</span>}
                        <span style={{ fontSize: 11, color: "var(--tx3)" }}>{new Date(log.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {uploadStep === "preview" && (
          <div style={{ padding: 16 }}>
            <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--tx)" }}>Preview — {uploadPreview.length} row{uploadPreview.length !== 1 ? "s" : ""} will be {uploadOverwrite ? "updated" : "filled in"}</div>
                <div style={{ fontSize: 12, color: "var(--tx3)" }}>Month: {uploadMonth} | Columns: {uploadCols.map(c => COL_LABELS[c] || c).join(", ")}{uploadOverwrite ? " | Overwrite: ON" : ""}</div>
              </div>
              <button className="btn btn-outline btn-sm" onClick={() => setUploadStep("config")}>Back</button>
            </div>
            {uploadPreview.length === 0 ? (
              <div className="placeholder" style={{ padding: 30 }}>
                <p style={{ color: "var(--tx3)" }}>No changes to apply. {uploadOverwrite ? "All values are identical." : "All cells already have values. Enable 'Overwrite existing values' to replace them."}</p>
              </div>
            ) : (
              <div style={{ maxHeight: 400, overflow: "auto", border: "1px solid var(--bd2)", borderRadius: 8, marginBottom: 16 }}>
                <table>
                  <thead><tr><th>QA</th><th>Status</th>{uploadCols.map(c => <th key={c}>{COL_LABELS[c] || c}</th>)}<th style={{ width: 40 }}></th></tr></thead>
                  <tbody>
                    {uploadPreview.map(row => (
                      <tr key={row.qa_email}>
                        <td style={{ fontWeight: 500, fontSize: 13 }}>{row.name}</td>
                        <td>
                          <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 6, fontWeight: 600, background: row.existing ? "var(--green-bg)" : "var(--blue-bg)", color: row.existing ? "var(--green)" : "var(--blue)" }}>
                            {row.existing ? "Update" : "New"}
                          </span>
                        </td>
                        {uploadCols.map(col => {
                          const ch = row.changes[col];
                          return (
                            <td key={col} style={{ fontSize: 12 }}>
                              {ch ? (
                                <div>
                                  {ch.old != null && ch.old !== "" && <span style={{ textDecoration: "line-through", color: "var(--tx3)", marginRight: 4 }}>{ch.old}</span>}
                                  <span style={{ color: "var(--green)", fontWeight: 600 }}>{ch.new}</span>
                                </div>
                              ) : <span style={{ color: "var(--tx3)" }}>—</span>}
                            </td>
                          );
                        })}
                        <td>
                          <button className="btn btn-outline btn-sm" style={{ padding: "2px 6px", color: "var(--red)" }} onClick={() => setUploadPreview(prev => prev.filter(r => r.qa_email !== row.qa_email))} title="Remove from upload">
                            <Icon d={icons.trash} size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {uploadPreview.length > 0 && (
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-primary" disabled={uploading} onClick={executeUpload}>
                  {uploading ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2, marginRight: 6 }} />Uploading...</> : "Confirm & apply changes"}
                </button>
                <button className="btn btn-outline" onClick={() => setUploadStep("config")}>Cancel</button>
              </div>
            )}
          </div>
        )}

        {uploadStep === "done" && (
          <div style={{ padding: 24, textAlign: "center" }}>
            {uploadResult?.success ? (
              <>
                <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--green-bg)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round"><path d={icons.check} /></svg>
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Upload complete</div>
                <div style={{ fontSize: 13, color: "var(--tx2)", marginBottom: 8 }}>
                  {uploadResult.rowsAffected} row{uploadResult.rowsAffected !== 1 ? "s" : ""} updated{uploadResult.rowsCreated > 0 ? `, ${uploadResult.rowsCreated} new row${uploadResult.rowsCreated !== 1 ? "s" : ""} created` : ""}
                </div>
                {uploadResult.errors && (
                  <div style={{ textAlign: "left", maxHeight: 120, overflow: "auto", background: "var(--amber-bg)", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: "var(--amber)" }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{uploadResult.errors.length} row{uploadResult.errors.length !== 1 ? "s" : ""} had issues:</div>
                    {uploadResult.errors.map((e, i) => <div key={i} style={{ marginBottom: 2 }}>{e}</div>)}
                  </div>
                )}
              </>
            ) : (
              <>
                <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--red-bg)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2.5" strokeLinecap="round"><path d="M6 18L18 6M6 6l12 12" /></svg>
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--red)", marginBottom: 4 }}>Upload failed</div>
                <div style={{ fontSize: 13, color: "var(--tx2)", marginBottom: 16 }}>{uploadResult?.error || "Unknown error"}</div>
              </>
            )}
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          </div>
        )}
    </Modal>
  );
}
