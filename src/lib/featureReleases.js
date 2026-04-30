// Feature-release notifications: admin-curated "what's new" entries that
// fan out to users whose role is ≥ release.min_role. Source of truth is
// the public.feature_releases table; per-user dismissal lives in
// public.feature_release_acks.

import { sb } from "./supabase.js";
import { hasRole } from "./constants.js";

const RELEASE_MAX_AGE_DAYS = 30;

// Returns the active, role-eligible, unacked, < 30 days old releases for
// the current user. Sorted newest-first.
export const fetchUnreadReleases = async ({ token, userEmail, role }) => {
  if (!token || !userEmail) return [];
  const cutoff = new Date(Date.now() - RELEASE_MAX_AGE_DAYS * 24 * 3600 * 1000).toISOString();
  const [releases, acks] = await Promise.all([
    sb.query("feature_releases", {
      select: "key,title,description,target_path,min_role,released_at",
      filters: `is_active=eq.true&released_at=gte.${encodeURIComponent(cutoff)}&order=released_at.desc`,
      token,
    }).catch(() => []),
    sb.query("feature_release_acks", {
      select: "feature_key",
      filters: `user_email=eq.${encodeURIComponent(userEmail.toLowerCase())}`,
      token,
    }).catch(() => []),
  ]);
  const ackedKeys = new Set((acks || []).map(a => a.feature_key));
  return (releases || [])
    .filter(r => !ackedKeys.has(r.key))
    .filter(r => hasRole(role, r.min_role));
};

// Mark a release as acknowledged for the current user. Idempotent —
// ON CONFLICT in the table handles repeat calls.
export const ackRelease = async ({ token, userEmail, featureKey, via = "click" }) => {
  if (!token || !userEmail || !featureKey) return;
  await sb.query("feature_release_acks", {
    method: "POST",
    body: { user_email: userEmail.toLowerCase(), feature_key: featureKey, acked_via: via, acked_at: new Date().toISOString() },
    token,
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  }).catch(() => {});
};

// Admin helper — used by the Admin panel "release a feature" form (or
// directly via SQL during a deploy script). Returns the inserted row.
export const createFeatureRelease = async ({ token, key, title, description, targetPath, minRole, createdBy }) => {
  return await sb.query("feature_releases", {
    method: "POST",
    body: {
      key, title, description: description || null,
      target_path: targetPath || null,
      min_role: minRole || "qa",
      created_by: createdBy || null,
      is_active: true,
    },
    token,
  });
};
