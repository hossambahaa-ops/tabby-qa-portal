import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";

function SearchableSelect({ options, value, onChange, placeholder, multi = false, labelKey = "label", valueKey = "value", className = "" }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [rect, setRect] = useState(null);
  const ref = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) { const portal = document.getElementById("ss-portal"); if (portal && portal.contains(e.target)) return; setOpen(false); }};
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    if (open && ref.current) {
      const r = ref.current.getBoundingClientRect();
      setRect(r);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  // Close on scroll
  useEffect(() => {
    if (!open) return;
    const onScroll = () => { if (ref.current) { const r = ref.current.getBoundingClientRect(); setRect(r); }};
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [open]);

  const filtered = options.filter(o => {
    const label = typeof o === "string" ? o : o[labelKey] || "";
    return label.toLowerCase().includes(search.toLowerCase());
  });
  const getLabel = (o) => typeof o === "string" ? o : o[labelKey] || "";
  const getValue = (o) => typeof o === "string" ? o : o[valueKey] || "";
  const isSelected = (o) => { const v = getValue(o); return multi ? (value || []).includes(v) : value === v; };
  const toggle = (o) => {
    const v = getValue(o);
    if (multi) { const arr = value || []; onChange(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]); }
    else { onChange(v === value ? "" : v); setOpen(false); setSearch(""); }
  };
  const displayValue = () => {
    if (multi && value?.length > 0) { return value.length === 1 ? (options.find(o => getValue(o) === value[0]) ? getLabel(options.find(o => getValue(o) === value[0])) : value[0]) : `${value.length} selected`; }
    if (!multi && value) { const opt = options.find(o => getValue(o) === value); return opt ? getLabel(opt) : value; }
    return "";
  };

  // Portal container
  let portalEl = document.getElementById("ss-portal");
  if (!portalEl) { portalEl = document.createElement("div"); portalEl.id = "ss-portal"; document.body.appendChild(portalEl); }

  const dropdownTop = rect ? rect.bottom + 4 : 0;
  const dropdownLeft = rect ? rect.left : 0;
  const dropdownWidth = rect ? rect.width : 200;
  const flipUp = rect && (dropdownTop + 260 > window.innerHeight);

  return (
    <div ref={ref} style={{ position: "relative", minWidth: 130 }} className={className}>
      <button onClick={() => { setOpen(!open); setSearch(""); }} style={{
        display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", border: "1px solid var(--bd)",
        borderRadius: "var(--radius)", background: "var(--bg3)", fontFamily: "var(--font)", fontSize: 12,
        color: value && (multi ? value.length > 0 : true) ? "var(--tx)" : "var(--tx3)", cursor: "pointer",
        width: "100%", textAlign: "left", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{displayValue() || placeholder || "Select..."}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" style={{ flexShrink: 0, opacity: 0.5 }}><path d="M2 4l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>
      </button>
      {open && rect && ReactDOM.createPortal(
        <div style={{
          position: "fixed",
          top: flipUp ? "auto" : dropdownTop,
          bottom: flipUp ? (window.innerHeight - rect.top + 4) : "auto",
          left: dropdownLeft, width: dropdownWidth, minWidth: 180,
          maxHeight: 260, background: "var(--bg3)", border: "1px solid var(--bd)", borderRadius: "var(--radius,12px)",
          boxShadow: "0 8px 30px rgba(0,0,0,.18)", zIndex: 99999, overflow: "hidden", display: "flex", flexDirection: "column",
        }}>
          <input ref={inputRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="Type to search..."
            style={{ padding: "8px 10px", border: "none", borderBottom: "1px solid var(--bd2)", fontFamily: "var(--font)", fontSize: 12, background: "transparent", color: "var(--tx)", outline: "none" }}/>
          <div style={{ overflow: "auto", maxHeight: 200 }}>
            {multi && value?.length > 0 && <button onClick={() => onChange([])} style={{ width: "100%", padding: "6px 10px", border: "none", borderBottom: "1px solid var(--bd2)", background: "transparent", fontFamily: "var(--font)", fontSize: 11, color: "var(--red)", cursor: "pointer", textAlign: "left" }}>Clear all</button>}
            {filtered.length === 0 && <div style={{ padding: 10, fontSize: 12, color: "var(--tx3)", textAlign: "center" }}>No results</div>}
            {filtered.map((o, i) => {
              const selected = isSelected(o);
              return <button key={i} onClick={() => toggle(o)} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", border: "none",
                background: selected ? "var(--accent-light)" : "transparent", fontFamily: "var(--font)", fontSize: 12,
                color: selected ? "var(--accent-text)" : "var(--tx)", cursor: "pointer", textAlign: "left",
              }}
                onMouseEnter={e => { if (!selected) e.currentTarget.style.background = "var(--bg)"; }}
                onMouseLeave={e => { if (!selected) e.currentTarget.style.background = "transparent"; }}
              >
                {multi && <span style={{ width: 14, height: 14, borderRadius: 3, border: selected ? "none" : "1.5px solid var(--bd)", background: selected ? "var(--accent-text)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {selected && <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5l2 2 4-4" fill="none" stroke="#fff" strokeWidth="1.5"/></svg>}
                </span>}
                <span>{getLabel(o)}</span>
              </button>;
            })}
          </div>
        </div>,
        portalEl
      )}
    </div>
  );
}
export default SearchableSelect;
