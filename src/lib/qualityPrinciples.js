// Quality Vision, Mission, Values, and Tone of Voice — the single source
// of truth for Tabby Quality's "DNA". Sourced from the Quality Vision,
// Mission & Values + TOV deck (2026). Shown in full on the Quality DNA
// page and surfaced one-at-a-time, rotating daily, as "Always remember…"
// principles across the app (login, dashboard, slow page transitions).
//
// Editing: this is intentionally shipped in code so it's available
// instantly to every user (even pre-login) with no network round-trip.
// To reword or add a principle, edit the arrays below and redeploy.

export const QUALITY_VISION = {
  title: "Quality Vision",
  tagline: "The future we aim to build, together",
  text: "To be a trusted, data-driven partner that shapes exceptional customer experiences through accountability, collaboration, and continuous improvement, driving to excellence across every interaction.",
};

export const QUALITY_MISSION = {
  title: "Quality Mission",
  tagline: "How we bring our vision to life",
  paragraphs: [
    "Our mission is to ensure that every customer interaction is consistent, fair, and meaningful, built on data, collaboration, and ownership.",
    "We do this by applying clear standards, driving continuous improvement through real insights, and working side by side with our stakeholders.",
    "We take accountability for the impact we create, adapt to change with intention, and solve problems with creativity and care.",
    "Quality is not just about spotting mistakes — it's about building trust, elevating performance, and creating better experiences at scale.",
  ],
};

export const QUALITY_VALUES = [
  { name: "Standards & Consistency", text: "Clear expectations — we have standards for everything we do, with consistency in every deliverable." },
  { name: "Continuous Improvement", text: "We're always evolving — in performance, processes, and experience." },
  { name: "Data-Driven", text: "Our decisions are based on insights, not assumptions." },
  { name: "Teamwork", text: "We collaborate within Quality and with our stakeholders to drive shared results." },
  { name: "Ownership", text: "We're accountable for our impact, individually and as a team." },
  { name: "Customer-Centricity", text: "We represent the voice of the customer in everything we do." },
  { name: "Excellence-Driven", text: "“Good enough” isn't our goal — we aim higher." },
  { name: "Adaptive", text: "We stay flexible and ready to change, upgrade, and improve." },
  { name: "Transparency & Trust", text: "Honest feedback and a safe space to grow." },
  { name: "Innovative", text: "We solve problems creatively and build smarter ways of working." },
];

export const QUALITY_TOV = [
  { name: "Kind & Polite", text: "We treat each other with kindness and respect — “please”, “thank you”, and “I'm sorry” are part of our daily vocabulary." },
  { name: "Conscientious & Empathetic", text: "Our team is made up of people — we're mindful of how our words and actions impact others." },
  { name: "Feedback & Openness", text: "We believe in 360° feedback, given with maturity and openness — we help each other get there." },
  { name: "Privacy & Trust", text: "What's shared in confidence stays in confidence. Integrity is at the heart of how we work." },
  { name: "Equality & Respect", text: "We're all equally valuable and stand on the same level, embracing our differences." },
  { name: "Urgencies & Working Hours", text: "Working outside regular hours is the exception, not the expectation — we respect personal time and balance." },
];

// Flat list of bite-size principles for the rotating "Always remember…"
// surfacer (Values + Tone of Voice). Vision and Mission are the anchor
// statements and live on the Quality DNA page, not in the rotation.
export const QUALITY_PRINCIPLES = [
  ...QUALITY_VALUES.map((v) => ({ kind: "Value", tag: v.name, text: v.text })),
  ...QUALITY_TOV.map((v) => ({ kind: "Tone of Voice", tag: v.name, text: v.text })),
];

// Deterministic "principle of the day": everyone sees the same one on a
// given calendar day, cycling through the whole list (~16 → ~3 weeks).
// Uses the UTC day-number of the local calendar date, so it advances
// once per day and stays in sync across @tabby.ai / @tabby.sa users.
export function principleOfTheDay(date = new Date()) {
  const dayNumber = Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000
  );
  const list = QUALITY_PRINCIPLES;
  return list[dayNumber % list.length];
}
