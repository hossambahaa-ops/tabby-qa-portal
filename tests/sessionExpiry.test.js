import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// Regression tests for the "signed in but every field shows —" state.
//
// A QA sat on the SAME expired JWT for 19 hours and 69 consecutive 401s.
// The session was stored with `expires_at: 0` (the OAuth callback hash had no
// `expires_at`, and Number(null) is 0), and getSession()'s refresh guard read
// `if (p.expires_at && ...)`. Zero is falsy, so the token was never eligible
// for refresh — it just got replayed forever while the app rendered a shell
// with no data in it.

const SUPABASE_URL = "https://test.supabase.co";
vi.stubEnv("VITE_SUPABASE_URL", SUPABASE_URL);
vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");

// Minimal unsigned JWT — only the `exp` claim matters here.
const makeJwt = (exp) => {
  const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_");
  return `${b64({ alg: "HS256" })}.${b64({ sub: "u1", email: "q@tabby.sa", exp })}.sig`;
};

const NOW = () => Math.floor(Date.now() / 1000);

let sb;
beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  ({ sb } = await import("../src/lib/supabase.js"));
});
afterEach(() => { vi.restoreAllMocks(); });

describe("getSession recovers a session stored without an expiry", () => {
  it("refreshes an expired token even when expires_at is 0", async () => {
    const dead = makeJwt(NOW() - 3600);
    localStorage.setItem("sb_session", JSON.stringify({
      access_token: dead, refresh_token: "rt-1", expires_at: 0, user: { id: "u1" },
    }));

    const fresh = makeJwt(NOW() + 3600);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: fresh, refresh_token: "rt-2", expires_at: NOW() + 3600, user: { id: "u1" } }),
    });

    const s = await sb.auth.getSession();

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy.mock.calls[0][0]).toContain("grant_type=refresh_token");
    // The whole bug was handing the dead token back to the caller.
    expect(s.access_token).toBe(fresh);
    expect(s.access_token).not.toBe(dead);
  });

  it("clears the session when the refresh token is also dead", async () => {
    localStorage.setItem("sb_session", JSON.stringify({
      access_token: makeJwt(NOW() - 3600), refresh_token: "rt-dead", expires_at: 0,
    }));
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, json: async () => ({}) });

    expect(await sb.auth.getSession()).toBeNull();
    expect(localStorage.getItem("sb_session")).toBeNull();
  });

  it("leaves a still-valid session alone and makes no network call", async () => {
    const live = makeJwt(NOW() + 3600);
    localStorage.setItem("sb_session", JSON.stringify({
      access_token: live, refresh_token: "rt-1", expires_at: NOW() + 3600,
    }));
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const s = await sb.auth.getSession();

    expect(s.access_token).toBe(live);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("still refreshes a valid-looking session whose stored expiry has passed", async () => {
    localStorage.setItem("sb_session", JSON.stringify({
      access_token: makeJwt(NOW() + 3600), refresh_token: "rt-1", expires_at: NOW() - 10,
    }));
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: makeJwt(NOW() + 3600), refresh_token: "rt-2", expires_at: NOW() + 3600 }),
    });

    await sb.auth.getSession();
    expect(fetchSpy).toHaveBeenCalledOnce();
  });
});

describe("an unrecoverable 401 ends the session", () => {
  it("clears storage and fires session-expired instead of looping", async () => {
    const dead = makeJwt(NOW() + 3600); // parses as live, but the server says no
    localStorage.setItem("sb_session", JSON.stringify({
      access_token: dead, refresh_token: "rt-1", expires_at: NOW() + 3600,
    }));

    // Server rejects; getSession() hands back the same token, so there is
    // nothing new to retry with.
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false, status: 401, json: async () => ({ message: "JWT expired" }),
    });

    const onExpired = vi.fn();
    window.addEventListener("session-expired", onExpired);

    await expect(sb.query("profiles", { select: "id", token: dead })).rejects.toThrow(/sign in again/i);

    expect(onExpired).toHaveBeenCalledOnce();
    expect(localStorage.getItem("sb_session")).toBeNull();
    window.removeEventListener("session-expired", onExpired);
  });
});
