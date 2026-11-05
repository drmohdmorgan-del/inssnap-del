"use strict";
/* =====================================================================
   INSNAPP Demo Portal — automatic provisioning core. Mirrors the
   armed InSnap trigger (insnap-job-engine src/lib/demo-provision-core)
   adapted to INSNAPP's monorepo shape (the web app is apps/web inside
   drmohdmorgan-del/inssnap-del; the demo store is
   apps/web/public/demo/provisioning.js).

   POST /api/demo-provision
     Headers: x-demo-provision-secret: <DEMO_PROVISION_SECRET>
     Body:    { name, email, source }   (source is informational)

   DORMANT-READY (2026-11-05): INSNAPP has no website CNDA-signing
   trigger wired yet — that wiring is a later step, exactly as InSnap
   stood before its trigger was armed. This endpoint exists now so
   the trigger (or an IEC Office call) provisions through the same
   gates when it lands. It is never called by a browser.

   WHAT IT DOES
   1. Reads the CURRENT apps/web/public/demo/provisioning.js from the
      inssnap-del repo (GitHub Contents API) — provisioning.js stays
      the single source of truth and the demo's client-side auth
      design is untouched.
   2. Idempotency by signer email (the stated rule):
        no entry            → create one (status "invited", fresh
                              one-time token), commit to the repo,
                              Vercel redeploys provisioning.js;
        entry "invited"     → NO duplicate: resend the SAME activation
                              link, but only because this call follows
                              a fresh completed signing;
        entry "active"      → no email (they already have access);
        entry paused/revoked → no email (administrative control wins).
      The seed account has status "active", so it follows that rule.
      Existing entries are preserved byte-for-byte: a new entry is
      INSERTED before the array's closing bracket; nothing is rewritten.
   3. Waits (bounded poll) until the new token is visible on the live
      /demo/provisioning.js, so the activation link works when the
      email lands, then sends the activation email via Resend — the
      template below, subject "Your INSNAPP demo account is ready —
      activate your access", signed with the ORG signature
      (lib/demo-signature.js — IEC logo + INSNAPP · IEC, Inc. +
      857-867-1767 + info@iecincglobal.com, no personal name).
      FROM: DEMO_PROVISION_FROM, defaulting to Resend's onboarding
      sender. The signature's info@iecincglobal.com line is the org
      contact line (as on all INSNAPP system mail today); the From
      flips to info@iecincglobal.com only after that domain is
      verified in Resend — a separate step, never faked here.

   FAIL-CLOSED, like /api/demo-notify: with DEMO_PROVISION_SECRET or
   DEMO_PROVISION_GITHUB_TOKEN unset, nothing is provisioned and
   nothing is sent — the endpoint answers 503 { error:
   "not_configured" } and logs a clearly-marked NO-OP line. With
   RESEND_API_KEY unset, a created account still commits but the
   email is a logged NO-OP (emailed:false, reason not_configured).

   Env (this Vercel project — inssnap-del web):
     DEMO_PROVISION_SECRET        shared secret the trigger sends
     DEMO_PROVISION_GITHUB_TOKEN  fine-grained GitHub token (repo
                                  drmohdmorgan-del/inssnap-del only,
                                  Contents read/write)
     RESEND_API_KEY               the sending key (shared with
                                  /api/demo-notify in this project)
     DEMO_PROVISION_FROM          optional sender override (after a
                                  sending domain is verified in Resend)
     DEMO_PROVISION_REPO          optional, default
                                  drmohdmorgan-del/inssnap-del
     DEMO_PROVISION_LIVE_URL      optional live provisioning.js URL
                                  (poll target; tests override it)
     DEMO_PROVISION_GITHUB_API    optional GitHub API base override
                                  (tests / local E2E stub)
     DEMO_PROVISION_RESEND_API    optional Resend API base override
                                  (tests / local E2E stub)

   Framework-free on purpose (like demo-notify-core): the Next route
   in app/api/demo-provision is a thin adapter, so the Node check
   suites exercise this exact code.
   ===================================================================== */

const crypto = require("crypto");
const vm = require("vm");
const { SIGNATURE_TEXT, SIGNATURE_HTML } = require("./demo-signature");

const DEFAULT_REPO = "drmohdmorgan-del/inssnap-del";
const FILE_PATH = "apps/web/public/demo/provisioning.js";
const DEFAULT_LIVE_URL = "https://www.inssnapp.com/demo/provisioning.js";
const DEFAULT_FROM = "INSNAPP Demo Portal <onboarding@resend.dev>";
const ACTIVATION_BASE = "https://www.inssnapp.com/demo/activate/?token=";
const PORTAL_URL = "https://www.inssnapp.com/demo";
const SEED_EMAIL = "demo@insnapp.example";
/* Commits land under the repo's standing author identity (every live
   INSNAPP deploy uses it; Vercel accepts it). */
const COMMITTER = { name: "drmohdmorgan-del", email: "drmohdmorgan-del@users.noreply.github.com" };

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function plausibleEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* "2026-11-05T06:06:10-05:00" — America/New_York wall time with its UTC
   offset, matching the format of the hand-provisioned entries. */
function easternIso(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  let offMin = Math.round((asUTC - date.getTime()) / 60000);
  const sign = offMin < 0 ? "-" : "+";
  offMin = Math.abs(offMin);
  const oh = String(Math.floor(offMin / 60)).padStart(2, "0");
  const om = String(offMin % 60).padStart(2, "0");
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${sign}${oh}:${om}`;
}

/* Parse the entries out of a provisioning.js source text. The file is
   our own controlled artifact, so evaluating it in an empty vm
   sandbox to read the one constant is safe and robust to
   comments/formatting inside the array. */
function parseProvisioning(source) {
  const sandbox = {};
  vm.createContext(sandbox);
  /* A top-level `const` never lands on the sandbox object — read it
     back as the script's completion value instead. */
  const list = vm.runInContext(
    String(source || "") + "\n;DEMO_PROVISIONED_ACCOUNTS;",
    sandbox,
    { timeout: 1000 }
  );
  if (!Array.isArray(list)) throw new Error("provisioning_parse_failed");
  return list;
}

/* Insert a new entry just before the array's closing bracket, leaving
   every existing byte in place (entries survive byte-for-byte). */
function insertEntry(source, entry) {
  const text = String(source);
  const close = text.lastIndexOf("\n];");
  if (close < 0) throw new Error("provisioning_shape_unexpected");
  const entryText =
    ",\n  {\n" +
    `    email: ${JSON.stringify(entry.email)},\n` +
    `    name: ${JSON.stringify(entry.name)},\n` +
    `    token: ${JSON.stringify(entry.token)},\n` +
    `    status: ${JSON.stringify(entry.status)},\n` +
    `    issuedAt: ${JSON.stringify(entry.issuedAt)}\n` +
    "  }";
  return text.slice(0, close) + entryText + text.slice(close);
}

/* ------------------------------------------------------------------ */
/* GitHub Contents API (repo is the provisioning store)                */
/* ------------------------------------------------------------------ */

function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
    "User-Agent": "insnapp-demo-provision"
  };
}

async function ghGetFile(fetchImpl, apiBase, repo, token) {
  const r = await fetchImpl(
    `${apiBase}/repos/${repo}/contents/${FILE_PATH}`,
    { headers: ghHeaders(token) }
  );
  if (!r.ok) throw new Error(`github_get_${r.status}`);
  const data = await r.json();
  const source = Buffer.from(String(data.content || ""), "base64").toString("utf8");
  return { source, sha: data.sha };
}

async function ghPutFile(fetchImpl, apiBase, repo, token, sha, source, message) {
  const r = await fetchImpl(
    `${apiBase}/repos/${repo}/contents/${FILE_PATH}`,
    {
      method: "PUT",
      headers: ghHeaders(token),
      body: JSON.stringify({
        message,
        sha,
        content: Buffer.from(source, "utf8").toString("base64"),
        committer: COMMITTER,
        author: COMMITTER
      })
    }
  );
  if (!r.ok) {
    const err = new Error(`github_put_${r.status}`);
    err.status = r.status;
    throw err;
  }
  return r.json().catch(() => ({}));
}

/* ------------------------------------------------------------------ */
/* Activation email — the approved template, full org signature        */
/* ------------------------------------------------------------------ */

function buildActivationEmail(name, email, token) {
  const first = String(name || "").trim().split(/\s+/)[0] || "there";
  const link = ACTIVATION_BASE + token;
  const subject = "Your INSNAPP demo account is ready — activate your access";
  const text = [
    `Dear ${first},`,
    "",
    "Thank you for signing the confidentiality agreement. Your INSNAPP Demo Portal account has been created. The demo is the exact INSNAPP workflow — the resident, prospect, and broker mobile apps and the Management and Control Center web views following one showing from request to live lead — on a synthetic case only. No real tenants, prospects, brokers, or properties are used.",
    "",
    "Activate your account here:",
    link,
    "",
    "Three steps:",
    "1. Open the link.",
    "2. Set your own password — we never send passwords by email.",
    `3. Sign in at ${PORTAL_URL} with this email address and your new password.`,
    "",
    "The activation link is one-time: it stops working once you have set your password. If you need it reissued, or your access changed at any time, contact us at info@iecincglobal.com.",
    "",
    SIGNATURE_TEXT
  ].join("\n");
  const html = [
    `<p>Dear ${escapeHtml(first)},</p>`,
    "<p>Thank you for signing the confidentiality agreement. Your INSNAPP Demo Portal account has been created. The demo is the exact INSNAPP workflow — the resident, prospect, and broker mobile apps and the Management and Control Center web views following one showing from request to live lead — on a synthetic case only. No real tenants, prospects, brokers, or properties are used.</p>",
    `<p>Activate your account here:<br><a href="${link}">${link}</a></p>`,
    "<p>Three steps:</p>",
    "<ol>",
    "<li>Open the link.</li>",
    "<li>Set your own password — we never send passwords by email.</li>",
    `<li>Sign in at ${PORTAL_URL} with this email address and your new password.</li>`,
    "</ol>",
    "<p>The activation link is one-time: it stops working once you have set your password. If you need it reissued, or your access changed at any time, contact us at info@iecincglobal.com.</p>",
    SIGNATURE_HTML
  ].join("\n");
  return { subject, text, html, link };
}

async function sendActivationEmail(fetchImpl, resendBase, key, from, name, email, token) {
  const mail = buildActivationEmail(name, email, token);
  const r = await fetchImpl(`${resendBase}/emails`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [email], subject: mail.subject, text: mail.text, html: mail.html })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(`resend_${r.status}`);
    err.data = data;
    throw err;
  }
  return data.id || null;
}

/* Bounded wait for the committed token to be live, so the activation
   link works when the email lands. Best-effort: the email is sent
   regardless; the result is reported in the response and the logs. */
async function waitForLiveToken(fetchImpl, liveUrl, token, attempts, delayMs) {
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetchImpl(`${liveUrl}?dp=${Date.now()}`, { headers: { "Cache-Control": "no-cache" } });
      if (r.ok) {
        const body = await r.text();
        if (body.includes(token)) return true;
      }
    } catch (e) { /* keep polling */ }
    if (i < attempts - 1) await new Promise(res => setTimeout(res, delayMs));
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Provisioning decision                                               */
/* ------------------------------------------------------------------ */

/* Returns { entry, created } — commits a new entry when needed. One
   retry on a sha conflict (a concurrent commit), re-checking
   idempotency from the fresh file before inserting again. */
async function ensureEntry(cfg, name, email, now) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { source, sha } = await ghGetFile(cfg.fetchImpl, cfg.githubApi, cfg.repo, cfg.ghToken);
    const list = parseProvisioning(source);
    const existing = list.find(a => normalizeEmail(a.email) === email) || null;
    if (existing) return { entry: existing, created: false };
    const entry = {
      email,
      name,
      token: crypto.randomBytes(24).toString("hex"),
      status: "invited",
      issuedAt: easternIso(now())
    };
    const next = insertEntry(source, entry);
    try {
      await ghPutFile(cfg.fetchImpl, cfg.githubApi, cfg.repo, cfg.ghToken, sha, next,
        `Demo: provision ${name} (${email}) — INSNAPP demo portal`);
      return { entry, created: true };
    } catch (e) {
      if ((e.status === 409 || e.status === 422) && attempt === 0) continue;
      throw e;
    }
  }
  throw new Error("github_conflict");
}

/* ------------------------------------------------------------------ */
/* Handler                                                             */
/* ------------------------------------------------------------------ */

/**
 * @param {{ method: string, headers?: object, body?: any, env?: object,
 *           fetchImpl?: Function, now?: Date | (() => Date),
 *           pollAttempts?: number, pollDelayMs?: number }} args
 * @returns {Promise<{ status: number, json: object }>}
 */
async function handleDemoProvision(args) {
  const env = args.env || {};
  const fetchImpl = args.fetchImpl || fetch;
  const now = typeof args.now === "function" ? args.now : () => args.now || new Date();
  const headers = args.headers || {};
  const headerSecret = headers["x-demo-provision-secret"] || headers["X-Demo-Provision-Secret"] || "";

  if (args.method !== "POST") return { status: 405, json: { ok: false, error: "method_not_allowed" } };

  const secret = env.DEMO_PROVISION_SECRET || "";
  if (!secret) {
    console.log("[demo-provision] NO-OP — DEMO_PROVISION_SECRET is not configured for this project; no account provisioned, no email sent.");
    return { status: 503, json: { ok: false, error: "not_configured" } };
  }
  if (!timingSafeEqual(headerSecret, secret)) {
    return { status: 401, json: { ok: false, error: "unauthorized" } };
  }

  const body = args.body || {};
  const name = String(body.name || "").trim().slice(0, 200);
  const email = normalizeEmail(body.email);
  if (!name || !plausibleEmail(email)) {
    return { status: 400, json: { ok: false, error: "invalid_signer" } };
  }

  const ghToken = env.DEMO_PROVISION_GITHUB_TOKEN || "";
  if (!ghToken) {
    console.log("[demo-provision] NO-OP — DEMO_PROVISION_GITHUB_TOKEN is not configured for this project; no account provisioned for a demo signer.");
    return { status: 503, json: { ok: false, error: "not_configured" } };
  }

  const cfg = {
    fetchImpl,
    ghToken,
    githubApi: env.DEMO_PROVISION_GITHUB_API || "https://api.github.com",
    resendApi: env.DEMO_PROVISION_RESEND_API || "https://api.resend.com",
    repo: env.DEMO_PROVISION_REPO || DEFAULT_REPO,
    liveUrl: env.DEMO_PROVISION_LIVE_URL || DEFAULT_LIVE_URL,
    from: env.DEMO_PROVISION_FROM || env.DEMO_NOTIFY_FROM || DEFAULT_FROM
  };

  let outcome;
  try {
    outcome = await ensureEntry(cfg, name, email, now);
  } catch (e) {
    console.error(`[demo-provision] provisioning FAILED for a demo signer: ${e && e.message}`);
    return { status: 502, json: { ok: false, error: "provision_failed" } };
  }

  const entry = outcome.entry;
  const status = String(entry.status || "invited").toLowerCase();

  if (!outcome.created && status !== "invited") {
    /* Idempotent no-email outcomes: already has access, or an
       administrative status (paused / revoked) controls the account. */
    const reason = status === "active" ? "already_active" : `status_${status}`;
    console.log(`[demo-provision] no email for a demo signer: existing account (${reason}).`);
    return { status: 200, json: { ok: true, created: false, emailed: false, reason } };
  }

  if (!entry.token) {
    console.error("[demo-provision] provisioned entry carries no token; cannot email an activation link.");
    return { status: 500, json: { ok: false, error: "entry_token_missing" } };
  }

  const deployConfirmed = outcome.created
    ? await waitForLiveToken(fetchImpl, cfg.liveUrl, entry.token,
        args.pollAttempts != null ? args.pollAttempts : 10,
        args.pollDelayMs != null ? args.pollDelayMs : 2500)
    : true;
  if (outcome.created && !deployConfirmed) {
    console.error("[demo-provision] token not yet visible on the live provisioning.js after the poll window; sending the activation email anyway (links do not expire).");
  }

  const key = env.RESEND_API_KEY || "";
  if (!key) {
    console.log(`[demo-provision] NO-OP SEND — RESEND_API_KEY is not configured for this project; account ${outcome.created ? "created" : "already invited"} but the activation email was NOT sent.`);
    return { status: 200, json: { ok: true, created: outcome.created, emailed: false, reason: "not_configured", deployConfirmed } };
  }

  try {
    const id = await sendActivationEmail(fetchImpl, cfg.resendApi, key, cfg.from, entry.name || name, email, entry.token);
    console.log(`[demo-provision] activation email sent for a demo signer (created=${outcome.created}, Resend id ${id || "?"}).`);
    return {
      status: 200,
      json: {
        ok: true,
        created: outcome.created,
        resent: !outcome.created,
        emailed: true,
        deployConfirmed,
        id
      }
    };
  } catch (e) {
    console.error(`[demo-provision] activation email FAILED for a demo signer: ${e && e.message}`);
    return { status: 200, json: { ok: true, created: outcome.created, emailed: false, reason: "send_failed", deployConfirmed } };
  }
}

module.exports = {
  handleDemoProvision,
  /* Exported for the node test suite; harmless in production. */
  _internals: {
    parseProvisioning,
    insertEntry,
    buildActivationEmail,
    easternIso,
    normalizeEmail,
    SEED_EMAIL,
    FILE_PATH,
    ACTIVATION_BASE
  }
};
