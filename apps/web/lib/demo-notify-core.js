"use strict";
/* =====================================================================
   INSNAPP Demo Portal — access notification + ACTIVITY core.

   POST /api/demo-notify  { event, email, name, detail }

   Called by the demo portal (public/demo/index.html), the activation
   page (public/demo/activate/), and the demo walkthrough
   (public/demo/app/) to report demo user activity. As of 2026-11-05
   this is the demo's full-monitoring emitter (DrMorgan's order):

   Events: "activated" · "login" · "login_failed" (detail = reason) ·
   "paused_attempt" · "revoked_attempt" · "step_view" (detail = step
   id) · "action" (detail = the key action taken).

   TWO jobs, in order:
   (a) FORWARD every valid event server-side to the central IEC
       Office activity ingest (DEMO_ACTIVITY_URL, default
       https://iecincglobal.com/api/demo-activity) as
       { asset: "insnapp", email, name, event, detail, ts, seed },
       gated by DEMO_ACTIVITY_SECRET. Best-effort by design: if the
       secret is unset or the ingest is unreachable, the forward is a
       logged NO-OP — activity reporting NEVER breaks the demo.
   (b) EMAIL DrMorgan on successful "activated" / "login" ONLY — the
       original notification behavior: plain factual email naming who
       accessed the demo, what they did, and when, with identity and
       account status derived HERE from public/demo/provisioning.js
       (client-supplied name/status are ignored for the email).

   Server-side discipline:
   - The seed account (demo@insnapp.example) NEVER emails — but its
     events ARE forwarded, flagged seed:true, so the central log sees
     internal review traffic without mailing DrMorgan.
   - Unprovisioned emails never email; their events are still
     forwarded (status "unprovisioned") so failed attempts against
     unknown addresses are visible centrally.
   - No token or password is ever included (none is ever received);
     `detail` is a short string (reason / step id / action), capped.
   - Email sending is via Resend and FAIL-CLOSED: with no
     RESEND_API_KEY in this project's environment, nothing is sent —
     the endpoint logs a clearly-marked NO-OP line and answers 200,
     so a missing key never breaks or blocks the demo sign-in flow.

   Env (this Vercel project — inssnap-del web):
     RESEND_API_KEY      the sending key (a key created for THIS
                         project — keys are not shared across projects)
     DEMO_NOTIFY_FROM    optional sender override; default is Resend's
                         onboarding sender until a sending domain is
                         verified in Resend
     DEMO_NOTIFY_TO      optional recipient override (default below)
     DEMO_ACTIVITY_SECRET shared secret for the IEC Office ingest
     DEMO_ACTIVITY_URL   optional ingest URL override (tests)

   Framework-free on purpose (the Next route in app/api/demo-notify
   is a thin adapter) so the Node check suites exercise this exact
   code.
   ===================================================================== */

let PROVISIONED = [];
try {
  PROVISIONED = require("../public/demo/provisioning.js").DEMO_PROVISIONED_ACCOUNTS || [];
} catch (e) {
  PROVISIONED = [];
}

/* ORG email signature incl. the logo (DrMorgan's rules, 2026-11-04:
   system mail carries the org variant — no personal name). */
const { SIGNATURE_TEXT, SIGNATURE_HTML } = require("./demo-signature");

const DEFAULT_NOTIFY_TO = "drmohdmorgan@gmail.com";
const DEFAULT_NOTIFY_FROM = "INSNAPP Demo Portal <onboarding@resend.dev>";
const SEED_EMAIL = "demo@insnapp.example";
const ASSET = "insnapp";
const DEFAULT_ACTIVITY_URL = "https://iecincglobal.com/api/demo-activity";
const ACTIVITY_TIMEOUT_MS = 4000;

const EVENTS = ["activated", "login", "login_failed", "paused_attempt", "revoked_attempt", "step_view", "action"];
const EMAIL_EVENTS = ["activated", "login"];

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function plausibleEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function findProvisioned(email) {
  const e = normalizeEmail(email);
  return PROVISIONED.find(a => normalizeEmail(a.email) === e) || null;
}

function cleanDetail(detail) {
  return String(detail || "").replace(/\s+/g, " ").trim().slice(0, 300);
}

function cleanName(name) {
  return String(name || "").replace(/\s+/g, " ").trim().slice(0, 120);
}

/* e.g. "November 5, 2026 at 6:21:05 AM EST" — the notification's WHEN
   is stamped here, in DrMorgan's timezone, never trusted to the client. */
function formatEastern(date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short"
  }).format(date);
}

/* ------------------------------------------------------------------ */
/* (a) Central activity forward — best-effort, never throws            */
/* ------------------------------------------------------------------ */

async function forwardActivity(cfg, payload) {
  if (!cfg.activitySecret) {
    console.log("[demo-notify] activity forward NO-OP — DEMO_ACTIVITY_SECRET is not configured for this project.");
    return false;
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ACTIVITY_TIMEOUT_MS);
    try {
      const r = await cfg.fetchImpl(cfg.activityUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-demo-activity-secret": cfg.activitySecret
        },
        body: JSON.stringify(payload),
        signal: ctrl.signal
      });
      if (!r.ok) {
        console.error(`[demo-notify] activity forward answered HTTP ${r.status} for ${payload.event} by ${payload.email}; continuing silently.`);
        return false;
      }
      return true;
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    console.error(`[demo-notify] activity forward FAILED for ${payload.event} by ${payload.email}: ${e && e.message}; continuing silently.`);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* (b) Success email — the original notification, provisioned only     */
/* ------------------------------------------------------------------ */

async function sendAccessEmail(cfg, prov, event, now) {
  const name = prov.name || prov.email;
  const email = normalizeEmail(prov.email);
  const status = String(prov.status || "invited").toLowerCase();
  const when = formatEastern(now);
  const what =
    event === "activated"
      ? "Activated their INSNAPP demo account (set their password from the activation link)"
      : "Signed in to the INSNAPP demo portal";

  const key = cfg.env.RESEND_API_KEY || "";
  if (!key) {
    console.log(
      `[demo-notify] NO-OP — RESEND_API_KEY is not configured for this project; ` +
      `would have emailed ${cfg.notifyTo}: ${event} by ${name} (${email}) at ${when}.`
    );
    return { emailed: false, reason: "not_configured", status: 200 };
  }

  const subject = `INSNAPP demo ${event} — ${name} (${email})`;
  const text = [
    "INSNAPP Demo Portal — access notification",
    "",
    `Who: ${name} (${email})`,
    `What: ${what}`,
    `When: ${when} (America/New_York)`,
    `Account status (provisioning): ${status}`,
    "",
    "Access is controlled in demo/provisioning.js (invited / active / paused / revoked).",
    "",
    SIGNATURE_TEXT
  ].join("\n");
  const esc = s =>
    String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const html = [
    "<p><strong>INSNAPP Demo Portal — access notification</strong></p>",
    `<p>Who: ${esc(name)} (${esc(email)})<br>`,
    `What: ${esc(what)}<br>`,
    `When: ${esc(when)} (America/New_York)<br>`,
    `Account status (provisioning): ${esc(status)}</p>`,
    "<p>Access is controlled in demo/provisioning.js (invited / active / paused / revoked).</p>",
    SIGNATURE_HTML
  ].join("\n");

  try {
    const r = await cfg.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ from: cfg.notifyFrom, to: [cfg.notifyTo], subject, text, html })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error(`[demo-notify] Resend send FAILED for ${event} by ${email}: HTTP ${r.status} ${JSON.stringify(data).slice(0, 300)}`);
      return { emailed: false, reason: "send_failed", status: 502 };
    }
    console.log(`[demo-notify] sent ${event} notification for ${email} (Resend id ${data.id || "?"}).`);
    return { emailed: true, id: data.id || null, status: 200 };
  } catch (e) {
    console.error(`[demo-notify] Resend send ERRORED for ${event} by ${email}: ${e && e.message}`);
    return { emailed: false, reason: "send_failed", status: 502 };
  }
}

/* ------------------------------------------------------------------ */
/* Handler                                                             */
/* ------------------------------------------------------------------ */

/**
 * @param {{ method: string, body: any, env?: object, fetchImpl?: Function, now?: Date }} args
 * @returns {Promise<{ status: number, json: object }>}
 */
async function handleDemoNotify(args) {
  const env = args.env || {};
  const fetchImpl = args.fetchImpl || fetch;
  const now = args.now || new Date();

  if (args.method !== "POST") return { status: 405, json: { ok: false, error: "method_not_allowed" } };

  const body = args.body || {};
  const event = String(body.event || "");
  const email = normalizeEmail(body.email);
  const detail = cleanDetail(body.detail);

  if (!EVENTS.includes(event)) {
    return { status: 400, json: { ok: false, error: "unknown_event" } };
  }
  if (!plausibleEmail(email)) {
    return { status: 400, json: { ok: false, error: "invalid_email" } };
  }

  const prov = findProvisioned(email);
  const seed = email === SEED_EMAIL;
  /* Identity for the central log: server-derived when provisioned;
     the client's name is used only for unprovisioned telemetry. */
  const name = prov ? (prov.name || email) : (cleanName(body.name) || email);

  const cfg = {
    env,
    fetchImpl,
    notifyTo: env.DEMO_NOTIFY_TO || DEFAULT_NOTIFY_TO,
    notifyFrom: env.DEMO_NOTIFY_FROM || DEFAULT_NOTIFY_FROM,
    activityUrl: env.DEMO_ACTIVITY_URL || DEFAULT_ACTIVITY_URL,
    activitySecret: env.DEMO_ACTIVITY_SECRET || ""
  };

  /* (a) Forward EVERY valid event first — best-effort, silent. */
  const forwarded = await forwardActivity(cfg, {
    asset: ASSET,
    email,
    name,
    event,
    detail,
    ts: now.toISOString(),
    seed
  });

  /* (b) Email only on success, only for provisioned, never for seed. */
  if (seed) {
    console.log(`[demo-notify] seed account ${event} — email suppressed by design (forwarded=${forwarded}).`);
    return { status: 200, json: { ok: true, emailed: false, forwarded, reason: "seed_silent" } };
  }
  if (!prov) {
    return { status: 200, json: { ok: true, emailed: false, forwarded, reason: "not_provisioned" } };
  }
  if (!EMAIL_EVENTS.includes(event)) {
    return { status: 200, json: { ok: true, emailed: false, forwarded, reason: "event_not_notified" } };
  }
  const sent = await sendAccessEmail(cfg, prov, event, now);
  return {
    status: sent.status,
    json: sent.emailed
      ? { ok: true, emailed: true, forwarded, id: sent.id }
      : { ok: sent.status === 200, emailed: false, forwarded, reason: sent.reason }
  };
}

module.exports = { handleDemoNotify, formatEastern, findProvisioned, SEED_EMAIL, EVENTS };
