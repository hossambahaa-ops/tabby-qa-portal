import React from "react";
import { logClientError } from "../lib/errorLog.js";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, stack: "" };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("App crash:", error, info);
    this.setState({ stack: info?.componentStack || "" });
    logClientError({
      source: "react_boundary",
      message: error?.message || String(error),
      stack: error?.stack,
      context: { componentStack: (info?.componentStack || "").slice(0, 2000) },
    });
  }
  render() {
    if (this.state.hasError) {
      return React.createElement("div", {
        style: { height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0D1117", color: "#fff", fontFamily: "'Inter', system-ui, sans-serif", padding: 24, textAlign: "center" }
      },
        React.createElement("svg", { width: 120, height: 40, viewBox: "0 0 200 60", fill: "none" },
          React.createElement("path", { d: "M0 30 L40 30 L55 8 L75 52 L95 20 L110 30 L200 30", stroke: "#EF4444", strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" })
        ),
        React.createElement("div", { style: { marginTop: 20, fontSize: 24, fontWeight: 700 } }, "Something went wrong"),
        React.createElement("p", { style: { marginTop: 8, color: "rgba(255,255,255,.5)", fontSize: 13, maxWidth: 400 } },
          "The app encountered an unexpected error. Click below to reload."
        ),
        React.createElement("p", { style: { marginTop: 8, color: "#EF4444", fontSize: 12, maxWidth: 600, wordBreak: "break-all", background: "rgba(239,68,68,.1)", padding: "8px 12px", borderRadius: 8 } },
          String(this.state.error?.message || "").slice(0, 300)
        ),
        this.state.stack && React.createElement("pre", { style: { marginTop: 8, color: "rgba(255,255,255,.5)", fontSize: 10, maxWidth: 600, textAlign: "left", whiteSpace: "pre-wrap", wordBreak: "break-all", background: "rgba(255,255,255,.05)", padding: "8px 12px", borderRadius: 8, maxHeight: 200, overflow: "auto" } },
          this.state.stack.slice(0, 500)
        ),
        React.createElement("button", {
          onClick: () => window.location.reload(),
          style: { marginTop: 24, padding: "10px 28px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #6A2C79, #8B5CF6)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter', system-ui, sans-serif" }
        }, "Reload app")
      );
    }
    return this.props.children;
  }
}
export default ErrorBoundary;
