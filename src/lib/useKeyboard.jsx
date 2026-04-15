import { useEffect } from "react";

export default function useKeyboard(shortcuts) {
  useEffect(() => {
    const handler = (e) => {
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target.isContentEditable) return;

      for (const [combo, fn] of Object.entries(shortcuts)) {
        const parts = combo.split("+");
        const key = parts.pop();
        const needCtrl = parts.includes("Ctrl");
        const needMeta = parts.includes("Meta");
        const needMod = needCtrl || needMeta;

        if (needMod && !(e.ctrlKey || e.metaKey)) continue;
        if (!needMod && (e.ctrlKey || e.metaKey)) continue;
        if (e.key === key) {
          e.preventDefault();
          fn();
          return;
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [shortcuts]);
}
