import React from "react";
import { useReigningBelts } from "../lib/useReigningBelts.js";
import TitleBelt from "./TitleBelt.jsx";

/**
 * <MyBeltIndicator onClick={() => navigate("leaderboard")} />
 *
 * Top-nav indicator: shows the championship belt(s) the logged-in user
 * currently holds. Renders nothing for users without belts so the nav
 * doesn't get cluttered for everyone else.
 *
 * Click navigates to wherever the parent says (typically the leaderboard
 * so the user can see the full belts panel).
 */
export default function MyBeltIndicator({ onClick }) {
  const { myBelts, loading } = useReigningBelts();

  if (loading) return null;
  if (!myBelts || myBelts.length === 0) return null;

  const label = myBelts.length === 1
    ? "You hold a championship belt — click to view"
    : `You hold ${myBelts.length} championship belts — click to view`;

  return (
    <button
      onClick={onClick}
      className="notif-btn topbar-belt-btn"
      aria-label={label}
      title={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "0 8px",
        background: "linear-gradient(135deg, rgba(245,158,11,.15) 0%, rgba(245,158,11,.05) 100%)",
        border: "1px solid rgba(245,158,11,.4)",
        borderRadius: 8,
        cursor: "pointer",
        position: "relative",
        animation: "beltPulse 2.4s ease-in-out infinite",
      }}
    >
      {/* Compact belt chips — show up to 2 inline, badge-style overflow for more */}
      <TitleBelt holders={myBelts} compact max={2} />
      {/* Subtle keyframes scoped via a <style> sibling so we don't touch the
          global stylesheet for this small accent. */}
      <style>{`
        @keyframes beltPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(245,158,11,.0); }
          50%      { box-shadow: 0 0 0 4px rgba(245,158,11,.15); }
        }
      `}</style>
    </button>
  );
}
