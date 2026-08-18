import { describe, it, expect, vi, afterEach } from "vitest";
import { sb } from "../src/lib/supabase.js";

// A write sent with `Prefer: return=minimal` returns an EMPTY body, and for a
// POST that is status 201 — not 204. Parsing it unconditionally threw
// "Unexpected end of JSON input", which is what a lead saw when dismissing an
// AP/PIP (the row saved; only the UI reported failure).
const res = (status, text) => ({ ok: status < 400, status, text: async () => text, json: async () => JSON.parse(text) });

afterEach(() => { vi.unstubAllGlobals(); });

describe("sb.query response body handling", () => {
  it("returns [] for a 201 with an empty body (Prefer: return=minimal POST)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => res(201, "")));
    await expect(sb.query("t", { method: "POST", body: { a: 1 } })).resolves.toEqual([]);
  });
  it("returns [] for 204 No Content", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => res(204, "")));
    await expect(sb.query("t", { method: "DELETE" })).resolves.toEqual([]);
  });
  it("still parses a normal JSON body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => res(200, '[{"id":1}]')));
    await expect(sb.query("t")).resolves.toEqual([{ id: 1 }]);
  });
  it("does not throw on a malformed body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => res(200, "not json")));
    await expect(sb.query("t")).resolves.toEqual([]);
  });
});
