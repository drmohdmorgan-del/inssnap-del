"use strict";
/* INSNAPP Demo Portal — Node check suites (mirrors the InSnap suites).
   Sections: portal gate · activation · notify core (email + activity
   forward) · demo provision core · demo-app renders · source locks ·
   NDA signing (page locks + submit core, RETIRED 410 — signing moved
   to IEC's central signing page 2026-11-08).
   Run: node scripts/demo-portal-checks.mjs   (from apps/web) */
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEMO = WEB + "/public/demo";

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.log("FAIL: " + name); }
}
function eq(a, b, name) { ok(a === b, name + " (got " + JSON.stringify(a) + ")"); }

function inlineScripts(file) {
  const html = fs.readFileSync(file, "utf8");
  const blocks = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) blocks.push(m[1]);
  return blocks;
}
function makeLS() {
  const o = {};
  return {
    getItem: k => (k in o ? o[k] : null),
    setItem: (k, v) => { o[k] = String(v); },
    removeItem: k => { delete o[k]; },
    _o: o
  };
}
function makeFetchStub() {
  const calls = [];
  const fn = (url, opts) => { calls.push({ url, opts }); return Promise.resolve({ ok: true, json: async () => ({}) }); };
  fn.calls = calls;
  return fn;
}
function pageContext(ls, fetchStub) {
  const sandbox = {
    console, URLSearchParams,
    localStorage: ls,
    fetch: fetchStub,
    module: { exports: {} },
    setTimeout, clearTimeout
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(DEMO + "/provisioning.js", "utf8"), ctx);
  return ctx;
}
function lastPayload(fetchStub) {
  return JSON.parse(fetchStub.calls[fetchStub.calls.length - 1].opts.body);
}

const TOKEN = "e8b021ff67aba7b029fffcb91e363c5b613dbf6e58c7274a";

/* ================= PORTAL GATE ================= */
{
  const ls = makeLS();
  const fetchStub = makeFetchStub();
  const ctx = pageContext(ls, fetchStub);
  for (const b of inlineScripts(DEMO + "/index.html")) vm.runInContext(b, ctx);
  const M = ctx.module.exports;

  let r = M.demoLogin("demo@insnapp.example", "InsnappDemo#2026");
  ok(r.ok, "portal: seed login ok");
  eq(M.demoSession().email, "demo@insnapp.example", "portal: seed session set");
  eq(fetchStub.calls.length, 1, "portal: seed login IS activity-reported (server flags seed, email silent)");
  eq(lastPayload(fetchStub).event, "login", "portal: seed report event is login");
  M.demoSignOut();
  ok(!M.demoSession(), "portal: sign out clears session");

  r = M.demoLogin("DEMO@INSNAPP.EXAMPLE", "InsnappDemo#2026");
  ok(r.ok, "portal: email case-insensitive");
  M.demoSignOut();

  const before = fetchStub.calls.length;
  r = M.demoLogin("demo@insnapp.example", "wrong-password");
  ok(!r.ok && /Incorrect password/.test(r.error), "portal: wrong password refused");
  eq(r.reason, "bad_password", "portal: wrong password reason code");
  eq(fetchStub.calls.length, before + 1, "portal: failed login reported once");
  eq(lastPayload(fetchStub).event, "login_failed", "portal: failure event is login_failed");
  eq(lastPayload(fetchStub).detail, "bad_password", "portal: failure detail carries the reason");

  r = M.demoLogin("nobody@nowhere.example", "whatever123");
  ok(!r.ok && /No demo account exists/.test(r.error) && /no public signup/.test(r.error), "portal: unknown email refused with no-signup message");
  eq(lastPayload(fetchStub).detail, "no_account", "portal: unknown email detail no_account");

  r = M.demoLogin("drmohdmorgan@gmail.com", "whatever123");
  ok(!r.ok && /not activated yet/.test(r.error), "portal: invited account refused pre-activation");
  eq(lastPayload(fetchStub).detail, "not_activated", "portal: invited detail not_activated");

  /* ============ ACTIVATION (same localStorage) ============ */
  const actx = pageContext(ls, fetchStub);
  vm.runInContext(`DEMO_PROVISIONED_ACCOUNTS.push(
    { email: "paused@x.example", name: "Paused Test", token: "tok-paused", status: "paused", issuedAt: "2026-11-05T00:00:00-05:00" },
    { email: "revoked@x.example", name: "Revoked Test", token: "tok-revoked", status: "revoked", issuedAt: "2026-11-05T00:00:00-05:00" }
  );`, actx);
  for (const b of inlineScripts(DEMO + "/activate/index.html")) vm.runInContext(b, actx);
  const A = actx.module.exports;

  eq(A.activationState("bogus-token").state, "unknown", "activate: unknown token");
  eq(A.activationState("tok-paused").state, "paused", "activate: paused token gated");
  eq(A.activationState("tok-revoked").state, "revoked", "activate: revoked token gated");
  eq(A.activationState(TOKEN).state, "ready", "activate: DrMorgan token ready");

  const aBefore = fetchStub.calls.length;
  let ar = A.demoActivate("tok-paused", "LongEnough#1", "LongEnough#1");
  ok(!ar.ok, "activate: paused refused");
  eq(lastPayload(fetchStub).event, "paused_attempt", "activate: paused attempt reported as paused_attempt");
  ar = A.demoActivate("tok-revoked", "LongEnough#1", "LongEnough#1");
  ok(!ar.ok, "activate: revoked refused");
  eq(lastPayload(fetchStub).event, "revoked_attempt", "activate: revoked attempt reported as revoked_attempt");

  ar = A.demoActivate(TOKEN, "short", "short");
  ok(!ar.ok && /at least 8/.test(ar.error), "activate: short password refused");
  eq(lastPayload(fetchStub).event, "action", "activate: password failure reported as action");
  eq(lastPayload(fetchStub).detail, "activation_failed_password", "activate: password failure detail");
  ar = A.demoActivate(TOKEN, "LongEnough#1", "Different#1");
  ok(!ar.ok && /do not match/.test(ar.error), "activate: mismatch refused");
  ok(fetchStub.calls.slice(aBefore).every(c => JSON.parse(c.opts.body).event !== "activated"), "activate: failed attempts never emit activated");

  ar = A.demoActivate(TOKEN, "LongEnough#1", "LongEnough#1");
  ok(ar.ok && ar.account.email === "drmohdmorgan@gmail.com", "activate: DrMorgan activation succeeds");
  const actCalls = fetchStub.calls.filter(c => JSON.parse(c.opts.body).event === "activated");
  eq(actCalls.length, 1, "activate: exactly one activated report on success");
  const payload = JSON.parse(actCalls[0].opts.body);
  eq(Object.keys(payload).sort().join(","), "detail,email,event,name", "activate: payload carries only event/name/email/detail");
  ok(!JSON.stringify(payload).includes(TOKEN) && !JSON.stringify(payload).includes("LongEnough"), "activate: payload has no token/password");
  eq(A.activationState(TOKEN).state, "used", "activate: token single-use (now used)");
  ar = A.demoActivate(TOKEN, "Another#123", "Another#123");
  ok(!ar.ok && /already been used/.test(ar.error), "activate: second use refused");
  eq(lastPayload(fetchStub).detail, "activation_failed_used", "activate: second use reported");

  /* ======== LOGIN AFTER ACTIVATION (fresh portal ctx, same LS) ======== */
  const fetch2 = makeFetchStub();
  const pctx = pageContext(ls, fetch2);
  for (const b of inlineScripts(DEMO + "/index.html")) vm.runInContext(b, pctx);
  const P = pctx.module.exports;
  r = P.demoLogin("drmohdmorgan@gmail.com", "LongEnough#1");
  ok(r.ok, "portal: login works after activation");
  eq(fetch2.calls.length, 1, "portal: exactly one report on real login");
  eq(JSON.parse(fetch2.calls[0].opts.body).event, "login", "portal: report event is login");
  r = P.demoLogin("drmohdmorgan@gmail.com", "wrong-password");
  ok(!r.ok, "portal: wrong password still refused after activation");
  eq(fetch2.calls.length, 2, "portal: failed login reported too");
  eq(JSON.parse(fetch2.calls[1].opts.body).event, "login_failed", "portal: post-activation failure is login_failed");

  /* ======== PAUSED / REVOKED LOGIN (fixtures, fresh LS) ======== */
  const ls2 = makeLS();
  const fetch3 = makeFetchStub();
  const gctx = pageContext(ls2, fetch3);
  vm.runInContext(`DEMO_PROVISIONED_ACCOUNTS.push(
    { email: "paused@x.example", name: "Paused Test", token: "tok-paused", status: "paused", issuedAt: "2026-11-05T00:00:00-05:00" },
    { email: "revoked@x.example", name: "Revoked Test", token: "tok-revoked", status: "revoked", issuedAt: "2026-11-05T00:00:00-05:00" }
  );`, gctx);
  for (const b of inlineScripts(DEMO + "/index.html")) vm.runInContext(b, gctx);
  const G = gctx.module.exports;
  r = G.demoLogin("paused@x.example", "whatever123");
  ok(!r.ok && /paused/.test(r.error), "portal: paused login refused");
  eq(JSON.parse(fetch3.calls[fetch3.calls.length - 1].opts.body).event, "paused_attempt", "portal: paused login reported as paused_attempt");
  r = G.demoLogin("revoked@x.example", "whatever123");
  ok(!r.ok && /revoked/.test(r.error), "portal: revoked login refused");
  eq(JSON.parse(fetch3.calls[fetch3.calls.length - 1].opts.body).event, "revoked_attempt", "portal: revoked login reported as revoked_attempt");
}

/* ================= NOTIFY CORE (email + activity forward) ================= */
{
  const core = require(WEB + "/lib/demo-notify-core.js");
  const ACT = "https://iecincglobal.com/api/demo-activity";
  const RESEND = "https://api.resend.com/emails";

  function router({ resendStatus = 200, activityStatus = 200, activityThrows = false } = {}) {
    const calls = [];
    const fn = async (url, opts) => {
      calls.push({ url, opts });
      if (String(url).startsWith(ACT)) {
        if (activityThrows) throw new Error("ingest_down");
        return { ok: activityStatus < 300, status: activityStatus, json: async () => ({}) };
      }
      if (String(url).startsWith(RESEND)) {
        return { ok: resendStatus < 300, status: resendStatus, json: async () => (resendStatus < 300 ? { id: "re_123" } : { message: "bad key" }) };
      }
      throw new Error("unexpected url " + url);
    };
    fn.calls = calls;
    return fn;
  }
  const envFull = { RESEND_API_KEY: "rk_test", DEMO_ACTIVITY_SECRET: "act-secret" };

  const run = async () => {
    let res = await core.handleDemoNotify({ method: "GET", body: {}, env: {} });
    eq(res.status, 405, "core: GET 405");
    res = await core.handleDemoNotify({ method: "POST", body: { event: "peek", email: "drmohdmorgan@gmail.com" }, env: envFull, fetchImpl: router() });
    eq(res.status, 400, "core: unknown event 400");
    res = await core.handleDemoNotify({ method: "POST", body: { event: "login", email: "not-an-email" }, env: envFull, fetchImpl: router() });
    eq(res.status, 400, "core: invalid email 400");

    /* Seed: emailed never, forwarded flagged seed:true */
    let f = router();
    res = await core.handleDemoNotify({ method: "POST", body: { event: "login", email: "demo@insnapp.example" }, env: envFull, fetchImpl: f, now: new Date("2026-11-05T11:00:00Z") });
    eq(res.status, 200, "core: seed 200");
    eq(res.json.emailed, false, "core: seed never emailed"); eq(res.json.reason, "seed_silent", "core: seed reason");
    eq(res.json.forwarded, true, "core: seed forwarded");
    eq(f.calls.length, 1, "core: seed makes exactly one call (the forward, no Resend)");
    let fwd = JSON.parse(f.calls[0].opts.body);
    eq(f.calls[0].url, ACT, "core: forward goes to the IEC Office ingest");
    eq(f.calls[0].opts.headers["x-demo-activity-secret"], "act-secret", "core: forward carries the activity secret header");
    eq(fwd.asset, "insnapp", "core: forward asset is insnapp");
    eq(fwd.seed, true, "core: forward flags seed:true");
    eq(fwd.event, "login", "core: forward event");
    ok(typeof fwd.ts === "string" && fwd.ts.endsWith("Z"), "core: forward ts is ISO");

    /* Provisioned login: email + forward; identity server-derived */
    f = router();
    res = await core.handleDemoNotify({
      method: "POST",
      body: { event: "login", email: "DRMOHDMORGAN@gmail.com", name: "Spoofed Name" },
      env: envFull, fetchImpl: f, now: new Date("2026-11-05T11:21:05Z")
    });
    eq(res.status, 200, "core: provisioned login 200");
    eq(res.json.emailed, true, "core: provisioned login emailed");
    eq(res.json.forwarded, true, "core: provisioned login forwarded");
    eq(f.calls.length, 2, "core: login makes forward + email calls");
    fwd = JSON.parse(f.calls[0].opts.body);
    eq(fwd.name, "Mohammed M. Morgan, M.D.", "core: forward name is server-derived (spoof ignored)");
    eq(fwd.seed, false, "core: forward seed:false for provisioned");
    const mail = JSON.parse(f.calls[1].opts.body);
    eq(f.calls[1].url, RESEND, "core: email via Resend");
    eq(mail.to[0], "drmohdmorgan@gmail.com", "core: email recipient is DrMorgan");
    ok(mail.subject.includes("Mohammed M. Morgan, M.D."), "core: subject carries provisioned name");
    ok(mail.text.includes("INSNAPP · IEC, Inc.") && mail.html.includes("iec-logo-email.png"), "core: org signature present");
    ok(!JSON.stringify(mail).includes(TOKEN), "core: email carries no token");

    /* Non-success events: forwarded, never emailed */
    f = router();
    res = await core.handleDemoNotify({ method: "POST", body: { event: "step_view", email: "drmohdmorgan@gmail.com", detail: "leads" }, env: envFull, fetchImpl: f });
    eq(res.json.emailed, false, "core: step_view not emailed"); eq(res.json.reason, "event_not_notified", "core: step_view reason");
    eq(res.json.forwarded, true, "core: step_view forwarded");
    eq(JSON.parse(f.calls[0].opts.body).detail, "leads", "core: step_view detail forwarded");
    eq(f.calls.length, 1, "core: step_view makes no Resend call");

    f = router();
    res = await core.handleDemoNotify({ method: "POST", body: { event: "login_failed", email: "drmohdmorgan@gmail.com", detail: "bad_password" }, env: envFull, fetchImpl: f });
    eq(res.json.forwarded, true, "core: login_failed forwarded");
    eq(JSON.parse(f.calls[0].opts.body).detail, "bad_password", "core: login_failed reason forwarded");

    /* Unprovisioned: no email, still forwarded */
    f = router();
    res = await core.handleDemoNotify({ method: "POST", body: { event: "login_failed", email: "ghost@nowhere.example", name: "Ghost", detail: "no_account" }, env: envFull, fetchImpl: f });
    eq(res.status, 200, "core: unprovisioned 200");
    eq(res.json.emailed, false, "core: unprovisioned not emailed"); eq(res.json.reason, "not_provisioned", "core: unprovisioned reason");
    eq(res.json.forwarded, true, "core: unprovisioned forwarded");

    /* No activity secret: forward is a silent NO-OP, email still works */
    f = router();
    res = await core.handleDemoNotify({ method: "POST", body: { event: "login", email: "drmohdmorgan@gmail.com" }, env: { RESEND_API_KEY: "rk_test" }, fetchImpl: f });
    eq(res.json.forwarded, false, "core: no activity secret → forwarded false");
    eq(res.json.emailed, true, "core: email still sent without activity secret");
    eq(f.calls.length, 1, "core: only the Resend call happens");

    /* Ingest down: forward fails silently, email unaffected */
    f = router({ activityThrows: true });
    res = await core.handleDemoNotify({ method: "POST", body: { event: "login", email: "drmohdmorgan@gmail.com" }, env: envFull, fetchImpl: f });
    eq(res.status, 200, "core: ingest down still 200");
    eq(res.json.forwarded, false, "core: ingest down → forwarded false");
    eq(res.json.emailed, true, "core: ingest down → email still sent");

    /* No Resend key: success event fails closed on email only */
    f = router();
    res = await core.handleDemoNotify({ method: "POST", body: { event: "activated", email: "drmohdmorgan@gmail.com" }, env: { DEMO_ACTIVITY_SECRET: "act-secret" }, fetchImpl: f });
    eq(res.status, 200, "core: no Resend key 200");
    eq(res.json.emailed, false, "core: no Resend key → not emailed"); eq(res.json.reason, "not_configured", "core: no Resend key reason");
    eq(res.json.forwarded, true, "core: no Resend key → still forwarded");

    /* Resend failure is loud (502), forward already landed */
    f = router({ resendStatus: 401 });
    res = await core.handleDemoNotify({ method: "POST", body: { event: "login", email: "drmohdmorgan@gmail.com" }, env: envFull, fetchImpl: f });
    eq(res.status, 502, "core: Resend 401 → 502");
    eq(res.json.forwarded, true, "core: Resend failure does not lose the forward");
  };
  await run();
}

/* ================= DEMO PROVISION CORE ================= */
{
  const core = require(WEB + "/lib/demo-provision-core.js");
  const GH = "https://api.github.com";
  const LIVE = "https://www.inssnapp.com/demo/provisioning.js";
  const RESEND = "https://api.resend.com";
  const baseSource = fs.readFileSync(DEMO + "/provisioning.js", "utf8");

  function stubbed() {
    const state = { source: baseSource, sha: "sha-1", puts: [], mails: [], liveHas: false, ghGetStatus: 200 };
    const fn = async (url, opts = {}) => {
      const u = String(url);
      if (u.startsWith(GH) && (!opts.method || opts.method === "GET")) {
        if (state.ghGetStatus !== 200) return { ok: false, status: state.ghGetStatus, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => ({ content: Buffer.from(state.source, "utf8").toString("base64"), sha: state.sha }) };
      }
      if (u.startsWith(GH) && opts.method === "PUT") {
        const body = JSON.parse(opts.body);
        state.puts.push(body);
        state.source = Buffer.from(body.content, "base64").toString("utf8");
        state.sha = "sha-2";
        state.liveHas = true;
        return { ok: true, status: 200, json: async () => ({}) };
      }
      if (u.startsWith(LIVE)) {
        return { ok: true, status: 200, text: async () => (state.liveHas ? state.source : baseSource) };
      }
      if (u.startsWith(RESEND)) {
        state.mails.push(JSON.parse(opts.body));
        return { ok: true, status: 200, json: async () => ({ id: "re_999" }) };
      }
      throw new Error("unexpected url " + u);
    };
    return { fn, state };
  }
  const envFull = { DEMO_PROVISION_SECRET: "s3cret", DEMO_PROVISION_GITHUB_TOKEN: "gh_test", RESEND_API_KEY: "rk_test" };
  const hdr = { "x-demo-provision-secret": "s3cret" };
  const signer = { name: "Test Signer", email: "signer@x.example" };

  const run = async () => {
    let res = await core.handleDemoProvision({ method: "GET", headers: hdr, body: signer, env: envFull, fetchImpl: stubbed().fn });
    eq(res.status, 405, "provision: GET 405");
    res = await core.handleDemoProvision({ method: "POST", headers: hdr, body: signer, env: {}, fetchImpl: stubbed().fn });
    eq(res.status, 503, "provision: no secret env → 503 not_configured");
    res = await core.handleDemoProvision({ method: "POST", headers: { "x-demo-provision-secret": "wrong" }, body: signer, env: envFull, fetchImpl: stubbed().fn });
    eq(res.status, 401, "provision: wrong secret → 401");
    res = await core.handleDemoProvision({ method: "POST", headers: hdr, body: { name: "", email: "bad" }, env: envFull, fetchImpl: stubbed().fn });
    eq(res.status, 400, "provision: invalid signer → 400");
    res = await core.handleDemoProvision({ method: "POST", headers: hdr, body: signer, env: { DEMO_PROVISION_SECRET: "s3cret" }, fetchImpl: stubbed().fn });
    eq(res.status, 503, "provision: no GitHub token → 503");

    /* Create path */
    let s = stubbed();
    res = await core.handleDemoProvision({ method: "POST", headers: hdr, body: signer, env: envFull, fetchImpl: s.fn, now: new Date("2026-11-05T11:30:00Z"), pollAttempts: 3, pollDelayMs: 1 });
    eq(res.status, 200, "provision: create 200");
    eq(res.json.created, true, "provision: created true");
    eq(res.json.emailed, true, "provision: emailed true");
    eq(s.state.puts.length, 1, "provision: exactly one commit");
    const commit = JSON.parse(JSON.stringify(s.state.puts[0]));
    eq(commit.committer.name, "drmohdmorgan-del", "provision: commit under the repo standing identity");
    ok(s.state.source.includes('email: "drmohdmorgan@gmail.com"') && s.state.source.indexOf('email: "drmohdmorgan@gmail.com"') < s.state.source.indexOf("signer@x.example"), "provision: existing entries preserved byte-for-byte (order + content)");
    const list = core._internals.parseProvisioning(s.state.source);
    const baseCount = core._internals.parseProvisioning(baseSource).length;
    eq(list.length, baseCount + 1, "provision: exactly one entry added by create");
    const entry = list.find(a => a.email === "signer@x.example");
    ok(/^[0-9a-f]{48}$/.test(entry.token), "provision: token is 48 hex chars");
    eq(entry.status, "invited", "provision: new entry invited");
    ok(/-0[45]:00$/.test(entry.issuedAt), "provision: issuedAt carries an Eastern offset");
    eq(s.state.mails.length, 1, "provision: one activation email");
    const mail = s.state.mails[0];
    eq(mail.to[0], "signer@x.example", "provision: email to the signer");
    ok(mail.text.includes(core._internals.ACTIVATION_BASE + entry.token), "provision: email link carries the SAME token as the commit");
    ok(mail.text.includes("INSNAPP · IEC, Inc.") && mail.html.includes("iec-logo-email.png"), "provision: org signature on the email");
    ok(!/password is|password:/i.test(mail.text), "provision: no password anywhere in the email");

    /* Idempotent resend: invited signer again → same link, no new commit */
    res = await core.handleDemoProvision({ method: "POST", headers: hdr, body: signer, env: envFull, fetchImpl: s.fn, pollAttempts: 1, pollDelayMs: 1 });
    eq(res.json.created, false, "provision: re-sign is not a duplicate create");
    eq(res.json.resent, true, "provision: invited re-sign resends");
    eq(s.state.puts.length, 1, "provision: still exactly one commit");

    /* Active (seed) → no email; paused / revoked → no email */
    res = await core.handleDemoProvision({ method: "POST", headers: hdr, body: { name: "Demo Reviewer", email: "demo@insnapp.example" }, env: envFull, fetchImpl: s.fn });
    eq(res.json.emailed, false, "provision: seed (active) gets no email");
    eq(res.json.reason, "already_active", "provision: active reason");

    /* No Resend key: account still created, email a NO-OP */
    s = stubbed();
    res = await core.handleDemoProvision({ method: "POST", headers: hdr, body: { name: "No Key", email: "nokey@x.example" }, env: { DEMO_PROVISION_SECRET: "s3cret", DEMO_PROVISION_GITHUB_TOKEN: "gh_test" }, fetchImpl: s.fn, pollAttempts: 1, pollDelayMs: 1 });
    eq(res.json.created, true, "provision: created without Resend key");
    eq(res.json.emailed, false, "provision: email NO-OP without Resend key");
    eq(res.json.reason, "not_configured", "provision: NO-OP reason");

    /* GitHub failure → loud 502 */
    s = stubbed(); s.state.ghGetStatus = 502;
    res = await core.handleDemoProvision({ method: "POST", headers: hdr, body: signer, env: envFull, fetchImpl: s.fn });
    eq(res.status, 502, "provision: GitHub failure → 502");
  };
  await run();
}

/* ================= DEMO APP RENDERS + ACTIVITY ================= */
{
  const ls = makeLS();
  const fetchStub = makeFetchStub();
  const ctx = pageContext(ls, fetchStub);
  for (const b of inlineScripts(DEMO + "/app/index.html")) vm.runInContext(b, ctx);
  const M = ctx.module.exports;

  eq(M.STEPS.length, 10, "app: ten walkthrough steps");
  const markers = [
    ["All screens", "Web — Management"],
    ["Live Monitor", "Showings monitor"],
    ["Incoming requests", "Available NOW"],
    ["Ready packet", "Request a showing"],
    ["Broker license", "Assignment queue"],
    ["Hard gate", "blocked"],
    ["Showing", "In progress"],
    ["live leads, not cold leads", "Accept"],
    ["Screening", "vetted by management"],
    ["Control Center", "Audit log"]
  ];
  M.STEPS.forEach((s, i) => {
    const html = M.renderStep(i);
    ok(html.length > 400, "app: step " + (i + 1) + " renders substantial HTML (" + html.length + " chars)");
    ok(html.includes(markers[i][0]), "app: step " + (i + 1) + " carries marker '" + markers[i][0] + "'");
    ok(html.includes(markers[i][1]), "app: step " + (i + 1) + " carries marker '" + markers[i][1] + "'");
    ok(!/Home For All/i.test(html), "app: step " + (i + 1) + " has no Home For All");
  });
  const audit = M.activityHTML();
  M.CASE.events.forEach(e => ok(audit.includes(e.text), "app: audit log carries event '" + e.at + "'"));
  ok(M.mgmtHTML("screening", "done").includes("pre-assembled, never pre-approved"), "app: screening carries never-pre-approved");
  ok(M.mgmtHTML("vetting", "confirmed").includes("hard-gated"), "app: vetting carries hard-gate copy");
  ok(M.brokerHTML("assigned").includes("Submit for verification") === false, "app: verified broker is not asked to submit a license");

  /* Flow view */
  eq(M.FLOW_BEATS.length, 8, "flow: eight beats");
  M.FLOW_BEATS.forEach((b, i) => {
    const html = M.flowHTML(i, M.flowDefaultView());
    for (const pane of ["m", "r", "p"]) ok(html.includes(M.FLOW_PANE_LABELS[pane]), "flow: beat " + (i + 1) + " renders pane " + pane);
    ok(html.includes(b.title), "flow: beat " + (i + 1) + " title present");
  });
  const v = M.flowDefaultView();
  eq(M.flowZoomStep(v, "m", 1), 1.15, "flow: zoom step up");
  v.zoom.m = 2; eq(M.flowZoomStep(v, "m", 1), 2, "flow: zoom clamps at 200%");
  v.zoom.m = 0.6; eq(M.flowZoomStep(v, "m", -1), 0.6, "flow: zoom clamps at 60%");
  v.zoom = { m: 1, r: 1, p: 1 }; v.focus = "r";
  eq(M.flowEffectiveZoom(v, "r"), 1.3, "flow: focused pane ×1.3");
  eq(M.flowEffectiveZoom(v, "p"), 0.55, "flow: mini pane ×0.55");

  /* Session gate + activity reporting */
  ok(!M.sessionAllowed(null), "app: no session refused");
  M.DemoStore.set("insnapp_demo_session", { name: "Demo Reviewer", email: "demo@insnapp.example" });
  ok(M.sessionAllowed(M.demoSession()), "app: seed session allowed");
  eq(fetchStub.calls.length, 0, "app: no reports before activity");
  M.reportActivity("step_view", "leads");
  eq(fetchStub.calls.length, 1, "app: step_view reported");
  eq(JSON.parse(fetchStub.calls[0].opts.body).event, "step_view", "app: report event step_view");
  eq(JSON.parse(fetchStub.calls[0].opts.body).detail, "leads", "app: report detail is the step id");
  M.reportActivity("action", "flow_play");
  eq(JSON.parse(fetchStub.calls[1].opts.body).event, "action", "app: action reported");

  const ls3 = makeLS();
  const ctx3 = pageContext(ls3, makeFetchStub());
  vm.runInContext(`DEMO_PROVISIONED_ACCOUNTS.push({ email: "paused@x.example", name: "Paused Test", token: "tok-p", status: "paused", issuedAt: "2026-11-05T00:00:00-05:00" });`, ctx3);
  for (const b of inlineScripts(DEMO + "/app/index.html")) vm.runInContext(b, ctx3);
  const M3 = ctx3.module.exports;
  M3.DemoStore.set("insnapp_demo_session", { name: "Paused Test", email: "paused@x.example" });
  eq(M3.sessionBlockReason(M3.demoSession()), "paused", "app: paused session block reason");
  ok(!M3.sessionAllowed(M3.demoSession()), "app: paused session refused");
}

/* ================= SOURCE LOCKS ================= */
{
  for (const f of ["index.html", "activate/index.html", "app/index.html"]) {
    const html = fs.readFileSync(DEMO + "/" + f, "utf8");
    ok(html.includes('<script src="/demo/provisioning.js"></script>'), "locks: " + f + " loads the allowlist by absolute path");
    ok(html.includes('content="noindex, nofollow"'), "locks: " + f + " is noindex");
    ok(html.includes("Developed by IEC, Inc."), "locks: " + f + " carries Developed by IEC, Inc.");
    ok(!/Home For All/i.test(html), "locks: " + f + " has no Home For All");
  }
  const gate = fs.readFileSync(DEMO + "/index.html", "utf8");
  ok(gate.includes('const DEMO_APP_URL = "/demo/app/"'), "locks: gate hands off to the absolute /demo/app/ path");
  ok(gate.includes("product signup") && gate.includes("never mix"), "locks: gate states the product/demo account boundary");
  const allDemo = ["index.html", "activate/index.html", "app/index.html", "provisioning.js"]
    .map(f => fs.readFileSync(DEMO + "/" + f, "utf8")).join("\n");
  ok(allDemo.includes("SYNTHETIC DEMO DATA") || allDemo.includes("Synthetic"), "locks: synthetic labeling present");

  /* Zero /demo references on the public surface (pages + components,
     excluding the demo API routes and the next.config rewrites). */
  const hits = [];
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = dir + "/" + e.name;
      if (e.isDirectory()) { if (e.name !== "demo-provision" && e.name !== "demo-notify") walk(p); }
      else if (/\.(tsx|ts)$/.test(e.name)) {
        const src = fs.readFileSync(p, "utf8");
        if (/["']\/demo(\/|["'])/.test(src)) hits.push(p);
      }
    }
  };
  walk(WEB + "/app");
  walk(WEB + "/components");
  eq(hits.length, 0, "locks: zero /demo references in public pages/components" + (hits.length ? " — " + hits.join(", ") : ""));
}

/* ================= NDA SIGNING (page locks + submit core) ================= */
{
  const core = require(WEB + "/lib/nda-submit-core.js");
  const page = fs.readFileSync(WEB + "/app/legal/cnda/page.tsx", "utf8");
  const panel = fs.readFileSync(WEB + "/app/legal/cnda/SigningPanel.tsx", "utf8");
  const route = fs.readFileSync(WEB + "/app/api/nda/submit/route.ts", "utf8");
  const signings = fs.readFileSync(WEB + "/lib/nda-signings.ts", "utf8");
  const schema = fs.readFileSync(WEB + "/../../packages/db/src/schema.sql", "utf8");

  /* Page locks — the full IEC mutual CNDA, verbatim headings */
  ok(page.includes("MUTUAL NON-DISCLOSURE AGREEMENT"), "nda page: agreement heading present");
  for (const h of [
    "1. Confidential Information", "2. Obligations", "3. Permitted disclosures",
    "4. Legally compelled disclosure", "5. No license; no obligation",
    "6. Return or destruction", "7. Term and survival", "8. Remedies",
    "9. Protected health information", "10. General"
  ]) ok(page.includes(h), "nda page: CNDA section heading '" + h + "' present");
  ok(page.includes("SCHEDULE A - IEC ASSETS COVERED BY THIS AGREEMENT"), "nda page: Schedule A heading present");
  ok(page.includes("MEDEXEC (getmedexec.com)") && page.includes("All other IEC assets"), "nda page: Schedule A assets present");
  ok(page.includes("IN WITNESS WHEREOF"), "nda page: execution block present");
  ok(page.includes("International Empire Consultants, Inc."), "nda page: IEC party block present");
  ok(page.includes("/legal/iec-mutual-nda-all-assets.pdf"), "nda page: PDF download linked");
  ok(fs.existsSync(WEB + "/public/legal/iec-mutual-nda-all-assets.pdf"), "nda page: PDF file exists in public/legal");
  ok(page.includes("Developed by IEC, Inc."), "nda page: carries Developed by IEC, Inc.");

  /* Forbidden string — nowhere in the NDA surface */
  for (const [label, src] of [["page", page], ["panel", panel], ["route", route], ["signings", signings], ["schema", schema]]) {
    ok(!/Home For All/i.test(src), "nda: no forbidden string in " + label);
  }

  /* Signing panel locks */
  ok(panel.includes('"/api/nda/submit"'), "nda panel: posts /api/nda/submit");
  ok(panel.includes(core.ATTESTATION_TEXT), "nda panel: attestation string identical to the submit core");
  eq(core.ATTESTATION_TEXT,
    "I agree to the terms of this Mutual Non-Disclosure Agreement, I am authorized to sign on behalf of the company named above, and I sign electronically by typing my name.",
    "nda core: ATTESTATION_TEXT is the locked statement");
  ok(panel.includes("INSNAPP Demo Portal"), "nda panel: names the INSNAPP Demo Portal");
  ok(panel.includes("activation email"), "nda panel: states the activation email follows");
  ok(panel.includes("set your own password"), "nda panel: signer sets their own password");
  ok(panel.includes("synthetic data only"), "nda panel: synthetic data only");
  ok(panel.includes("live leads, not cold leads"), "nda panel: live leads, not cold leads positioning");
  ok(!panel.includes('"/demo') && !page.includes('"/demo'), "nda: page + panel never link the portal");

  /* Route + record-store locks */
  ok(route.includes("recordNdaSigning") && route.includes("handleNdaSubmit"), "nda route: wires the record store + submit core");
  ok(route.includes("after("), "nda route: provisioning runs after the response");
  ok(route.includes("405"), "nda route: GET answers 405");
  ok(signings.includes('"iec-cnda-insnapp"') || signings.includes("iec-cnda-insnapp"), "nda signings: document id iec-cnda-insnapp");
  ok(signings.includes("2026-11-05"), "nda signings: document version 2026-11-05");
  ok(signings.includes("createHash") && signings.includes("sha256"), "nda signings: SHA-256 payload hash");
  ok(schema.includes("CREATE TABLE IF NOT EXISTS nda_signing_records"), "nda schema: nda_signing_records table present");
  for (const col of ["typed_signature", "attestation", "document_id", "document_version", "payload_hash", "ip_address", "user_agent", "signed_at"]) {
    ok(schema.includes(col), "nda schema: column " + col + " present");
  }

  /* Submit core behavior — RETIRED 2026-11-08: signing moved to IEC's
     ONE central signing page. Every call is refused 410 before
     validation, recording, or provisioning; existing records stay
     readable via lib/nda-signings.ts. */
  const validBody = {
    name: "Test Signer", email: "Signer@X.Example", company: "Acme Co",
    title: "VP", signature: "Test Signer", attestation: true
  };
  const run = async () => {
    /* Any method → 410 retired, nothing recorded */
    let recordCalls = 0;
    let res = await core.handleNdaSubmit({
      method: "GET", body: validBody, env: {},
      recordImpl: async () => { recordCalls++; }
    });
    eq(res.status, 410, "nda core: GET 410 (retired)");
    eq(res.json.error, "retired", "nda core: GET error code retired");
    eq(recordCalls, 0, "nda core: GET records nothing");

    /* The full 410 contract on a valid POST */
    recordCalls = 0;
    let afterCalls = 0, provisionCalls = 0;
    res = await core.handleNdaSubmit({
      method: "POST", body: validBody, env: { DEMO_PROVISION_SECRET: "s3cret" },
      recordImpl: async () => { recordCalls++; return { id: "x", signedAt: "t" }; },
      provisionImpl: async () => { provisionCalls++; return { status: 200, json: {} }; },
      afterImpl: () => { afterCalls++; }
    });
    eq(res.status, 410, "nda core: valid POST → 410 retired");
    eq(res.json.ok, false, "nda core: retired ok false");
    eq(res.json.error, "retired", "nda core: retired error code");
    eq(res.json.message, "NDA signing has moved to IEC's central signing page.", "nda core: retired message");
    eq(res.json.signAt, "https://iecincglobal.com/nda.html?origin=inssnapp", "nda core: retired signAt points at the central page");
    eq(recordCalls, 0, "nda core: retired records nothing");
    eq(afterCalls, 0, "nda core: retired schedules no provisioning");
    eq(provisionCalls, 0, "nda core: retired never provisions");

    /* Broken submissions are retired too — 410 before validation */
    const broken = [
      ["missing name", { ...validBody, name: "" }],
      ["bad email", { ...validBody, email: "not-an-email" }],
      ["missing company", { ...validBody, company: "" }],
      ["one-char signature", { ...validBody, signature: "T" }],
      ["attestation false", { ...validBody, attestation: false }],
      ["attestation missing", { ...validBody, attestation: undefined }]
    ];
    for (const [label, body] of broken) {
      recordCalls = 0;
      res = await core.handleNdaSubmit({
        method: "POST", body, env: {},
        recordImpl: async () => { recordCalls++; return { id: "x", signedAt: "t" }; }
      });
      eq(res.status, 410, "nda core: " + label + " → 410 retired");
      eq(res.json.error, "retired", "nda core: " + label + " error code");
      eq(recordCalls, 0, "nda core: " + label + " records nothing");
    }

    /* A failing record store is never even reached */
    afterCalls = 0; provisionCalls = 0;
    res = await core.handleNdaSubmit({
      method: "POST", body: validBody, env: { DEMO_PROVISION_SECRET: "s3cret" },
      recordImpl: async () => { throw new Error("db_down"); },
      provisionImpl: async () => { provisionCalls++; return { status: 200, json: {} }; },
      afterImpl: () => { afterCalls++; }
    });
    eq(res.status, 410, "nda core: retired beats record failure → 410");
    eq(res.json.error, "retired", "nda core: retired-beats-record-failure error code");
    eq(afterCalls, 0, "nda core: retired schedules no provisioning (record-failure stub)");
    eq(provisionCalls, 0, "nda core: retired never provisions (record-failure stub)");

    /* No afterImpl — still 410, nothing recorded or provisioned */
    recordCalls = 0; provisionCalls = 0;
    res = await core.handleNdaSubmit({
      method: "POST", body: validBody, env: {},
      recordImpl: async () => { recordCalls++; return { id: "rec-4", signedAt: "2026-11-05T12:00:00.000Z" }; },
      provisionImpl: async () => { provisionCalls++; return { status: 200, json: {} }; }
    });
    eq(res.status, 410, "nda core: no-afterImpl POST still 410");
    eq(recordCalls, 0, "nda core: no-afterImpl records nothing");
    eq(provisionCalls, 0, "nda core: no-afterImpl never provisions");
  };
  await run();
}

console.log(`\nINSNAPP demo portal checks: ${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
