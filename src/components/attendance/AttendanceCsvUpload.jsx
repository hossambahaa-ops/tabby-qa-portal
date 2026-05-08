import React from "react";
import { ATTENDANCE_TYPES, ATT_MAP } from "../../lib/attendance.js";
import Modal from "../Modal.jsx";

// CSV upload modal — accepts a filled-in attendance template, previews
// the parsed rows, and on confirm calls executeCsvUpload (which the
// parent owns so it can chunk + upsert + reload state).
export default function AttendanceCsvUpload({
  open,
  onClose,
  csvFile, setCsvFile,
  csvPreview, setCsvPreview,
  csvUploading,
  selMonth,
  parseCsvUpload,
  executeCsvUpload,
  downloadCsvTemplate,
}) {
  if (!open) return null;
  const closeAndReset = () => { onClose(); setCsvFile(null); setCsvPreview([]); };
  return (
    <Modal onClose={closeAndReset} maxWidth={600} padding={20} title="Upload attendance CSV">
        {csvPreview.length === 0 ? (
          <>
            <div style={{ fontSize: 12, color: "var(--tx2)", marginBottom: 12, lineHeight: 1.6 }}>
              Download the CSV template, fill in the attendance codes, then upload here. Existing data will be overwritten.
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {ATTENDANCE_TYPES.map(t => <span key={t.code} style={{ fontSize: 9, padding: "2px 5px", borderRadius: 3, background: t.bg, color: t.color, fontWeight: 700 }}>{t.code}</span>)}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <button className="btn btn-outline btn-sm" onClick={downloadCsvTemplate}>Download template for {selMonth}</button>
            </div>
            <div className="form-group">
              <label className="form-label">Upload filled CSV</label>
              <input type="file" accept=".csv" className="form-input" onChange={e => { const f = e.target.files[0]; if (f) { setCsvFile(f); parseCsvUpload(f); } }} />
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Preview — {csvPreview.length} QAs, {csvPreview.reduce((a, p) => a + p.entries.length, 0)} records</div>
            <div style={{ fontSize: 12, color: "var(--tx3)", marginBottom: 4 }}>Month: {selMonth}</div>
            <div style={{ fontSize: 11, color: "var(--amber)", marginBottom: 12 }}>Existing records will be overwritten.</div>
            <div style={{ maxHeight: 280, overflow: "auto", border: "1px solid var(--bd2)", borderRadius: 8, marginBottom: 16 }}>
              <table>
                <thead><tr><th>QA</th><th>Records</th><th>Sample</th></tr></thead>
                <tbody>
                  {csvPreview.map(p => (
                    <tr key={p.email}>
                      <td style={{ fontSize: 12, fontWeight: 500 }}>{p.email}</td>
                      <td style={{ fontSize: 12 }}>{p.entries.length} days</td>
                      <td style={{ fontSize: 11 }}>
                        {p.entries.slice(0, 5).map(e => {
                          const at = ATT_MAP[e.status];
                          return <span key={e.day} style={{ padding: "1px 4px", borderRadius: 3, background: at?.bg, color: at?.color, fontWeight: 700, fontSize: 9, marginRight: 2 }}>{e.day}:{e.status}</span>;
                        })}
                        {p.entries.length > 5 && <span style={{ color: "var(--tx3)" }}>+{p.entries.length - 5}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary btn-sm" disabled={csvUploading} onClick={executeCsvUpload}>
                {csvUploading ? "Uploading..." : "Confirm & upload"}
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => { setCsvPreview([]); setCsvFile(null); }}>Back</button>
              <button className="btn btn-outline btn-sm" onClick={closeAndReset}>Cancel</button>
            </div>
          </>
        )}
    </Modal>
  );
}
