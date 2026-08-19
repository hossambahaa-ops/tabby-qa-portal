import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// Static guards for the motion system.
//
// Pulse had 54 CSS transitions and 88 more declared inline in JSX across ~14
// different duration/easing combinations, most with no easing at all. These
// tests keep index.css on the token scale so the same gesture feels the same
// everywhere, and so "smooth" is something CI can check rather than a matter
// of taste. They are deliberately scoped to index.css; the JSX inline
// transitions are held at a baseline below and are meant to shrink.

const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

// Strip cubic-bezier(...) before scanning: its commas and decimals otherwise
// look like extra properties and bare durations.
const cssNoBezier = css.replace(/cubic-bezier\([^)]*\)/g, "EASE");

const transitionDecls = [
  ...cssNoBezier.matchAll(/transition:\s*([^;]*);/g),
].map((m) => m[1]);
const propertyDecls = [
  ...cssNoBezier.matchAll(/transition-property:\s*([^;]*);/g),
].map((m) => m[1]);

describe("motion tokens are defined", () => {
  it("exposes the duration scale and both easing curves on :root", () => {
    for (const t of ["--d1:", "--d2:", "--d3:", "--d4:", "--ease:", "--ease-out:", "--ease-spring:"]) {
      expect(css, `${t} missing`).toContain(t);
    }
  });
});

describe("no blanket transitions", () => {
  // `all` animates every property that happens to change -- including padding
  // and font-size, which meant switching density mode or crossing a breakpoint
  // animated layout. Name the properties instead.
  it("never uses `transition: all`", () => {
    const bad = transitionDecls.filter((d) => /^\s*all\b/.test(d));
    expect(bad).toEqual([]);
  });
});

describe("durations come from the scale", () => {
  it("declares no raw duration literals in transitions", () => {
    const offenders = [...transitionDecls, ...propertyDecls].filter((d) =>
      /(^|\s)\.?\d+(\.\d+)?m?s\b/.test(d),
    );
    expect(offenders).toEqual([]);
  });
});

describe("no accidental layout animation", () => {
  // Animating width/height/top/left forces layout on every frame. These four
  // are the deliberate exceptions -- the sidebar genuinely reflows the page,
  // and grid-template-rows/height is the standard auto-height accordion. The
  // guard exists to stop NEW ones appearing, not to relitigate these.
  const ALLOWED_LAYOUT_ANIMATIONS = 4;
  const LAYOUT = /\b(width|height|top|left|right|bottom|margin|padding|font-size|inset|grid-template-rows)\b/;

  it("keeps layout-animating transitions to the documented exceptions", () => {
    const found = transitionDecls.filter((d) => LAYOUT.test(d));
    expect(found.length).toBeLessThanOrEqual(ALLOWED_LAYOUT_ANIMATIONS);
  });

  it("never animates a layout property via transition-property", () => {
    expect(propertyDecls.filter((d) => LAYOUT.test(d))).toEqual([]);
  });
});

describe("reduced motion is still honoured", () => {
  it("keeps the global prefers-reduced-motion reset", () => {
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    expect(css).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
  });
});

describe("inline transitions in JSX are shrinking", () => {
  // Inline styles can't be deduplicated or respond to media queries, and are
  // how the values drifted apart in the first place. Held at the count found
  // when the token scale landed -- lower this number as they move into CSS;
  // it must never go up.
  const BASELINE = 87;

  const walk = (dir) =>
    readdirSync(dir).flatMap((e) => {
      const p = join(dir, e);
      return statSync(p).isDirectory() ? walk(p) : p.endsWith(".jsx") ? [p] : [];
    });

  it(`declares no more than ${BASELINE} inline transitions`, () => {
    const count = walk(resolve(process.cwd(), "src"))
      .reduce((n, f) => n + (readFileSync(f, "utf8").match(/transition:\s*"/g) || []).length, 0);
    expect(count).toBeLessThanOrEqual(BASELINE);
  });
});
