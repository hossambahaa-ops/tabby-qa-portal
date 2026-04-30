// Stable per-user avatar styling derived from email hash.
// Identical inputs always produce the same gradient + initials, so a
// person looks the same across every table, card, and tooltip in the
// app — visual identity instead of an undifferentiated grid of initials.

const PALETTE = [
  // Each entry: { from, to, fg } — gradient endpoints + a foreground
  // color tuned to keep contrast on the light variant readable.
  { from: "#7C3AED", to: "#A78BFA", fg: "#fff" },        // violet
  { from: "#2563EB", to: "#60A5FA", fg: "#fff" },        // blue
  { from: "#059669", to: "#34D399", fg: "#fff" },        // emerald
  { from: "#DC2626", to: "#F87171", fg: "#fff" },        // red
  { from: "#EA580C", to: "#FB923C", fg: "#fff" },        // orange
  { from: "#CA8A04", to: "#FACC15", fg: "#1F2937" },     // amber (dark text for contrast)
  { from: "#0891B2", to: "#22D3EE", fg: "#fff" },        // cyan
  { from: "#DB2777", to: "#F472B6", fg: "#fff" },        // pink
  { from: "#4F46E5", to: "#818CF8", fg: "#fff" },        // indigo
  { from: "#16A34A", to: "#4ADE80", fg: "#fff" },        // green
  { from: "#0D9488", to: "#2DD4BF", fg: "#fff" },        // teal
  { from: "#9333EA", to: "#C084FC", fg: "#fff" },        // purple
];

// Tiny stable hash → palette index. djb2 variant; deterministic.
const hashEmail = (email) => {
  const s = (email || "").toLowerCase().trim();
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

// Returns { background, color } CSS values for a user avatar.
export const avatarStyle = (email) => {
  if (!email) return { background: "linear-gradient(135deg, #6B7280, #9CA3AF)", color: "#fff" };
  const c = PALETTE[hashEmail(email) % PALETTE.length];
  return {
    background: `linear-gradient(135deg, ${c.from}, ${c.to})`,
    color: c.fg,
  };
};

// 2-letter initials from "first.last@domain" → "FL".
// Strips digits, lowercases, capitalises, max 2 chars.
export const initialsFromEmail = (email) => {
  if (!email) return "—";
  const local = email.split("@")[0] || "";
  const parts = local.split(".").map(p => p.replace(/\d+$/, "")).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};
