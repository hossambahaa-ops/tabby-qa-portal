import React from "react";
import DOMPurify from "dompurify";

// Shared renderer for fields that may contain HTML markup produced by
// the rich-text editor in CoachingCompose (or any future rich-text
// surface — tasks, escalations, plan notes, etc.). The editor emits
// `<p>…</p>`, `<ul><li>…</li></ul>`, `<b>…</b>`, `<a href=…>…</a>`,
// plus `&nbsp;` and inline styles. Older drafts stored as plain text
// must keep their line breaks, so we sniff for any tag and route
// accordingly:
//
//   • markup present → run through DOMPurify with the same allow-list
//     CoachingHistory + AnnouncementForm use, render via
//     `dangerouslySetInnerHTML`.
//   • plain text → render in a `<div>` with `whiteSpace: pre-wrap` so
//     newlines and tabs survive, no risk of HTML injection.
//
// CRITICAL: never pass user-authored strings to a bare `<div>{val}</div>`.
// That escapes them as text, which produces the "symbol soup" the user
// hit on Mariam Gad's profile (every `<p>`, `<li>`, `<b>` rendered
// literally instead of being formatted).
const ALLOWED_TAGS = [
  "p", "br", "b", "strong", "i", "em", "u",
  "ul", "ol", "li",
  "a", "div", "span",
  "table", "thead", "tbody", "tr", "th", "td",
];
const ALLOWED_ATTR = ["href", "target", "rel", "style"];

const hasMarkup = (text) => /<[a-z][^>]*>/i.test(String(text || ""));

export default function RichText({ text, style }) {
  if (text == null || text === "") return null;
  const str = String(text);
  if (hasMarkup(str)) {
    return (
      <div
        style={style}
        dangerouslySetInnerHTML={{
          __html: DOMPurify.sanitize(str, { ALLOWED_TAGS, ALLOWED_ATTR }),
        }}
      />
    );
  }
  return <div style={{ whiteSpace: "pre-wrap", ...(style || {}) }}>{str}</div>;
}

// Named export for callers that want just the detector (e.g. to decide
// whether to render an "edit raw HTML" affordance).
export { hasMarkup };
