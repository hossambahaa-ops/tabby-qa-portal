// Shared UI metadata for task priority levels — reused by the
// dashboard task list, detail modal, and any future surface that
// renders a task chip.

export const priorityConfig = {
  urgent: { label: "Urgent", color: "var(--red)",          bg: "var(--red-bg)" },
  high:   { label: "High",   color: "var(--amber)",        bg: "var(--amber-bg)" },
  medium: { label: "Medium", color: "var(--tabby-purple)", bg: "var(--primary-light)" },
  low:    { label: "Low",    color: "var(--tx3)",          bg: "var(--bg2)" },
};

export const priorityFor = (priority) => priorityConfig[priority] || priorityConfig.medium;
