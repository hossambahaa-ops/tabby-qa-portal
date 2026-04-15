import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON } from "./supabase.js";

let client = null;
let channels = [];

function getClient() {
  if (!client && SUPABASE_URL && SUPABASE_ANON) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON);
  }
  return client;
}

function requestNotifPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function showBrowserNotif(title, body) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body, icon: "/icon.svg" });
  }
}

export function subscribeRealtime({ profile, userRole, teamEmails, onEvent }) {
  const sb = getClient();
  if (!sb || !profile?.email) return () => {};

  const myEmail = profile.email.toLowerCase();

  requestNotifPermission();

  // Clean up any existing subscriptions
  unsubscribeAll();

  // 1. Tasks assigned to me
  const taskCh = sb.channel("tasks-mine")
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "tasks",
      filter: `assigned_to=eq.${myEmail}`,
    }, (payload) => {
      const t = payload.new;
      if (t.created_by?.toLowerCase() === myEmail) return; // skip self-assigned
      onEvent("task", `New task: ${t.title}`, t);
      showBrowserNotif("New Task Assigned", t.title);
    })
    .subscribe();
  channels.push(taskCh);

  // 2. Announcements
  const annCh = sb.channel("announcements-new")
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "announcements",
    }, (payload) => {
      const a = payload.new;
      if (a.sent_by?.toLowerCase() === myEmail) return;
      onEvent("announcement", `New announcement: ${a.title}`, a);
      showBrowserNotif("Announcement", a.title);
    })
    .subscribe();
  channels.push(annCh);

  // 3. DAM flags — for leads and above, filter to team
  if (userRole && userRole !== "qa" && userRole !== "senior_qa") {
    const damCh = sb.channel("dam-flags-team")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "dam_flags",
      }, (payload) => {
        const f = payload.new;
        const flagEmail = f.qa_email?.toLowerCase();
        if (teamEmails && teamEmails.length > 0 && !teamEmails.includes(flagEmail)) return;
        onEvent("dam", `New DAM flag for ${flagEmail}`, f);
        showBrowserNotif("DAM Flag Created", `New flag for ${flagEmail}`);
      })
      .subscribe();
    channels.push(damCh);

    // 4. Coaching violations
    const violCh = sb.channel("violations-new")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "coaching_violations",
      }, (payload) => {
        const v = payload.new;
        onEvent("violation", `New coaching violation: ${v.violation_type}`, v);
        showBrowserNotif("Coaching Violation", `${v.violation_type} detected`);
      })
      .subscribe();
    channels.push(violCh);
  }

  // 5. Escalations routed to me
  const escCh = sb.channel("escalations-mine")
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "escalations",
      filter: `routed_to=eq.${myEmail}`,
    }, (payload) => {
      const e = payload.new;
      onEvent("escalation", `New escalation: ${e.category}`, e);
      showBrowserNotif("New Escalation", `${e.category} — routed to you`);
    })
    .subscribe();
  channels.push(escCh);

  return unsubscribeAll;
}

export function unsubscribeAll() {
  const sb = getClient();
  channels.forEach(ch => {
    try { sb?.removeChannel(ch); } catch {}
  });
  channels = [];
}
