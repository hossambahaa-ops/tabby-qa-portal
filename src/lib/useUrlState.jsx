import { useState, useEffect, useCallback } from "react";

/**
 * Sync a piece of state with a URL hash query parameter.
 * Works with HashRouter: URL looks like "#/page?key=value&other=x".
 *
 * @param {string} key - query param name
 * @param {string} defaultValue - default when param absent
 * @returns {[string, (v:string)=>void]}
 */
export function useUrlState(key, defaultValue = "") {
  const readFromHash = () => {
    try {
      const hash = window.location.hash || "";
      const qIdx = hash.indexOf("?");
      if (qIdx < 0) return defaultValue;
      const params = new URLSearchParams(hash.substring(qIdx + 1));
      return params.get(key) ?? defaultValue;
    } catch { return defaultValue; }
  };

  const [value, setValue] = useState(readFromHash);

  // Write to URL whenever value changes
  useEffect(() => {
    try {
      const hash = window.location.hash || "#/";
      const [base, query = ""] = hash.split("?");
      const params = new URLSearchParams(query);
      if (value === "" || value === null || value === undefined || value === defaultValue) {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
      const qs = params.toString();
      const newHash = qs ? `${base}?${qs}` : base;
      if (window.location.hash !== newHash) {
        window.history.replaceState(null, "", newHash);
      }
    } catch {}
  }, [key, value, defaultValue]);

  // Re-read if URL changes externally (e.g., back/forward button)
  useEffect(() => {
    const onHashChange = () => {
      const fromUrl = readFromHash();
      setValue(prev => prev === fromUrl ? prev : fromUrl);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [key]);

  const updateValue = useCallback((v) => {
    setValue(typeof v === "function" ? v : v);
  }, []);

  return [value, updateValue];
}

/**
 * Array-flavoured useUrlState. Stores the selected values as a
 * comma-separated string in the URL, exposes an array to React. Empty
 * array → param dropped from URL (same convention as useUrlState).
 *
 * @param {string} key
 * @returns {[string[], (next: string[]) => void]}
 */
export function useUrlStateMulti(key) {
  const [raw, setRaw] = useUrlState(key, "");
  const arr = raw ? String(raw).split(",").filter(Boolean) : [];
  const setArr = useCallback((next) => {
    if (Array.isArray(next)) setRaw(next.filter(Boolean).join(","));
    else setRaw(next || "");
  }, [setRaw]);
  return [arr, setArr];
}
