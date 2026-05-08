import React, { useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";

// Light rich-text editor for the coaching compose form. Backed by
// contentEditable + document.execCommand for bold / italic / bullet /
// link — no heavy editor dependency. The component owns its own HTML
// output and emits sanitized HTML back to the parent on every input.
//
// Why contentEditable over Tiptap/Lexical: Amanda's ask is a small set
// of inline formats. A full editor would cost ~50 KB gzipped and pull
// in a dependency tree we'd then have to maintain. execCommand still
// works in every browser the portal supports today, even though it's
// formally deprecated — when that breaks we can swap in a real editor
// without changing the consuming form.
//
// REPLACEMENT PLAN — when to migrate off execCommand
//
//   Trigger: any of the following.
//     1. Safari drops insertHTML (the most fragile execCommand path).
//        Track via the `inputType="insertReplacementText"` warning in
//        the browser console — Safari has been logging deprecations
//        intermittently since 18.x.
//     2. Amanda asks for a feature execCommand can't do cleanly:
//        tables, code blocks, mentions, image embed, structured
//        templates, real undo/redo across formatting.
//     3. We need collaborative editing (multi-user MPRs).
//
//   Recommended target: Tiptap (built on ProseMirror).
//     - Plugin-based, ship only the marks we use (bold/italic/list/link)
//       to keep the bundle near 30 KB gzipped.
//     - First-class React integration via @tiptap/react.
//     - Stable schema model we can extend later (mentions, tables).
//     - Active maintenance, no Facebook-style policy risk.
//
//   Migration shape:
//     - Keep this component's external API: { value, onChange,
//       placeholder, maxChars }. Consumers (CoachingCompose) won't
//       need to change.
//     - Replace the contentEditable + execCommand internals with
//       useEditor({ extensions: [StarterKit, Link.configure({...})] }).
//     - Output stays sanitised HTML so coachingEmail.js's renderRich
//       branch keeps working unchanged.
//     - Drop DOMPurify ALLOWED_TAGS for `span`/`u` if we don't surface
//       those marks in the toolbar.
//     - Keep the placeholder pseudo-element CSS — Tiptap has its own
//       placeholder extension (Placeholder.configure({ placeholder })).
//
//   Cost estimate: ~half-day for the swap, ~half-day for paste
//   handling and toolbar styling polish.
//
// Props:
//   value         current HTML string
//   onChange(html)  emits sanitized HTML on every keystroke / format
//   placeholder   shown while the editor is empty
//   maxChars      optional plain-text length cap; renders the same
//                 nn / max counter the textareas used to render

// One-time DOMPurify config: allow the small inline-formatting tag set
// only. Anything else (scripts, custom attributes) is stripped on input.
const SANITIZE_OPTS = {
  ALLOWED_TAGS: ["p", "br", "b", "strong", "i", "em", "u", "ul", "ol", "li", "a", "div", "span"],
  ALLOWED_ATTR: ["href", "target", "rel"],
  ADD_ATTR: ["target"],
};

export default function RichTextField({ value, onChange, placeholder = "", maxChars = 2000 }) {
  const ref = useRef(null);
  const [isFocused, setIsFocused] = useState(false);
  // Sync external value -> DOM, but never while the user is actively typing.
  // Why: every keystroke runs onChange -> parent re-renders with sanitized
  // HTML -> this effect would compare value to el.innerHTML, find them
  // different (DOMPurify normalised something the browser inserted, e.g.
  // pasting from Word drops style attrs), and overwrite innerHTML — which
  // wipes the caret. The fix is to skip the sync while focused; we still
  // re-sync on external changes (form reset, draft restore) since those
  // happen when the editor isn't focused.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement === el) return;
    const incoming = value || "";
    if (el.innerHTML !== incoming) el.innerHTML = incoming;
  }, [value]);

  const emit = () => {
    const raw = ref.current?.innerHTML || "";
    const clean = DOMPurify.sanitize(raw, SANITIZE_OPTS);
    onChange(clean);
  };

  // Wrap document.execCommand so the keyboard focus stays in the editor
  // (otherwise the toolbar steals focus and the format applies to nothing).
  const exec = (cmd, arg) => {
    ref.current?.focus();
    try { document.execCommand(cmd, false, arg); } catch {}
    emit();
  };

  const insertLink = () => {
    const sel = window.getSelection?.();
    if (!sel || sel.isCollapsed) {
      // Without a selection there's nothing to wrap. Insert a placeholder
      // link with the URL as anchor text instead.
      const url = window.prompt("Link URL");
      if (!url) return;
      exec("insertHTML", `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a>`);
      return;
    }
    const url = window.prompt("Link URL", "https://");
    if (!url) return;
    exec("createLink", url);
    // execCommand createLink doesn't add target/rel; patch the element
    // we just created so the link opens in a new tab from the email too.
    const links = ref.current?.querySelectorAll("a");
    if (links) for (const a of links) {
      if (!a.target) { a.target = "_blank"; a.rel = "noreferrer"; }
    }
    emit();
  };

  const plainTextLength = (() => {
    if (!ref.current) return 0;
    return (ref.current.innerText || "").length;
  })();

  const Btn = ({ cmd, label, icon, onMouseDown }) => (
    <button
      type="button"
      // onMouseDown so the editor never loses focus on click — focus stays
      // and the format applies to the current selection.
      onMouseDown={e => {
        e.preventDefault();
        if (onMouseDown) onMouseDown();
        else exec(cmd);
      }}
      title={label}
      style={{
        background: "transparent", border: "1px solid transparent", borderRadius: 4,
        padding: "3px 8px", fontSize: 12, fontFamily: "var(--font)", cursor: "pointer",
        color: "var(--tx2)", fontWeight: 600, lineHeight: 1,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = "var(--bg)"; e.currentTarget.style.borderColor = "var(--bd2)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; }}
    >
      {icon}
    </button>
  );

  return (
    <div style={{
      border: `1px solid ${isFocused ? "var(--tabby-purple)" : "var(--bd)"}`,
      borderRadius: "var(--radius)",
      background: "var(--bg3)",
      transition: "border-color .15s",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 2,
        padding: "4px 6px", borderBottom: "1px solid var(--bd2)",
        background: "var(--bg)",
        borderRadius: "var(--radius) var(--radius) 0 0",
      }}>
        <Btn cmd="bold" label="Bold (Cmd+B)" icon={<b>B</b>} />
        <Btn cmd="italic" label="Italic (Cmd+I)" icon={<i>I</i>} />
        <span style={{ width: 1, height: 14, background: "var(--bd2)", margin: "0 4px" }} />
        <Btn cmd="insertUnorderedList" label="Bulleted list" icon={<span>• List</span>} />
        <Btn label="Insert link" icon={<span>🔗</span>} onMouseDown={insertLink} />
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={() => { setIsFocused(false); emit(); }}
        onFocus={() => setIsFocused(true)}
        // Empty-state placeholder rendered via :empty::before (CSS class
        // injected once at module load).
        data-placeholder={placeholder}
        className="rich-text-editor"
        style={{
          minHeight: 72, maxHeight: 320, overflowY: "auto",
          padding: "10px 12px", fontSize: 13, lineHeight: 1.6, color: "var(--tx)",
          fontFamily: "var(--font)", outline: "none",
        }}
      />
      {maxChars && (
        <div style={{
          fontSize: 10,
          color: plainTextLength > (maxChars * 0.9) ? "var(--red)" : "var(--tx3)",
          textAlign: "right", padding: "2px 8px 4px",
        }}>{plainTextLength} / {maxChars}</div>
      )}
    </div>
  );
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Inject the placeholder pseudo-element once. Done here so consumers don't
// have to remember to import a separate stylesheet.
if (typeof document !== "undefined" && !document.getElementById("rich-text-editor-css")) {
  const style = document.createElement("style");
  style.id = "rich-text-editor-css";
  style.textContent = `
    .rich-text-editor:empty::before {
      content: attr(data-placeholder);
      color: var(--tx3);
      pointer-events: none;
    }
    .rich-text-editor ul, .rich-text-editor ol { margin: 4px 0 4px 22px; padding: 0; }
    .rich-text-editor li { margin: 2px 0; }
    .rich-text-editor a { color: var(--tabby-purple); text-decoration: underline; }
    .rich-text-editor p { margin: 0 0 6px; }
  `;
  document.head.appendChild(style);
}
