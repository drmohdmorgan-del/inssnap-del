"use strict";
/* =====================================================================
   INSNAPP website NDA submission core — POST /api/nda/submit.
   Mirrors the armed InSnap core (insnap-job-engine
   src/lib/nda-submit-core.js) adapted to this app's paths.

   The public CNDA page (/legal/cnda) posts an executed signing here.
   Pipeline:

   1. VALIDATE the signing (name, email, company, typed signature,
      attestation). Anything missing → 400, nothing recorded.
   2. RECORD FIRST: the signing record is inserted into
      nda_signing_records (lib/nda-signings.ts) BEFORE anything
      else happens. That record is the verification for the demo
      provisioning path. If the insert fails, the submission fails
      loudly — 500 { ok: false, error: "recording" } — and no
      provisioning is scheduled. No fake success, ever.
   3. PROVISION (after the response, via the route's afterImpl —
      Next's after()): the recorded signing triggers Demo Portal
      provisioning + the activation email through
      lib/demo-provision-core.js (handleDemoProvision, in-process).
      Dormant by design: with DEMO_PROVISION_SECRET unset this logs
      a clearly-marked NO-OP and does nothing. It NEVER throws: a
      provisioning failure must not fail or delay a completed
      signing.

   No signer PII is logged. Framework-free on purpose (like the other
   demo cores) so the Node check suites exercise this exact code; the
   Next route in app/api/nda/submit is a thin adapter that wires
   the real record store, the real provision core, and after().

   The attestation text below is the exact statement the signer
   affirms on the CNDA page — the record stores it verbatim.
   ===================================================================== */

const { handleDemoProvision } = require("./demo-provision-core");

const ATTESTATION_TEXT =
  "I agree to the terms of this Mutual Non-Disclosure Agreement, I am authorized to sign on behalf of the company named above, and I sign electronically by typing my name.";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function plausibleEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function cleanField(v, max) {
  return String(v == null ? "" : v).trim().slice(0, max);
}

/* The provisioning trigger — the in-process notifyDemoProvision. */
async function triggerDemoProvision(env, signer, provisionImpl) {
  const secret = env.DEMO_PROVISION_SECRET || "";
  if (!secret) {
    console.log(
      "[demo-provision] NO-OP — DEMO_PROVISION_SECRET is not configured; " +
      "demo access was not provisioned for a website NDA signer."
    );
    return;
  }
  try {
    const res = await provisionImpl({
      method: "POST",
      headers: { "x-demo-provision-secret": secret },
      body: { name: signer.name, email: signer.email, source: "website-nda" },
      env
    });
    if (!res || res.status < 200 || res.status >= 300) {
      console.error(`[demo-provision] endpoint answered HTTP ${res && res.status} for a website NDA signer`);
    }
  } catch (e) {
    console.error("[demo-provision] call to the demo provisioning endpoint failed for a website NDA signer");
  }
}

/**
 * @param {{ method: string, body?: any, env?: object, ip?: string,
 *           userAgent?: string,
 *           recordImpl: (record: object) => Promise<any>,
 *           provisionImpl?: Function,
 *           afterImpl?: (fn: () => Promise<void>) => void }} args
 * @returns {Promise<{ status: number, json: object }>}
 */
async function handleNdaSubmit(args) {
  const env = args.env || {};
  if (args.method !== "POST") return { status: 405, json: { ok: false, error: "method_not_allowed" } };

  const body = args.body || {};
  const name = cleanField(body.name, 200);
  const email = normalizeEmail(body.email);
  const company = cleanField(body.company, 200);
  const title = cleanField(body.title, 200);
  const typedSignature = cleanField(body.signature, 200);
  const attested = body.attestation === true;

  if (!name || !plausibleEmail(email) || !company || typedSignature.length < 2 || !attested) {
    return { status: 400, json: { ok: false, error: "invalid_signing" } };
  }

  /* RECORD FIRST — a failed insert fails the whole submission. */
  let record;
  try {
    record = await args.recordImpl({
      name,
      email,
      company,
      title,
      typedSignature,
      attestation: ATTESTATION_TEXT,
      ipAddress: args.ip || "",
      userAgent: args.userAgent || "",
      source: "website-nda"
    });
  } catch (e) {
    console.error("[nda/submit] signing record failed");
    return { status: 500, json: { ok: false, error: "recording" } };
  }

  /* The signing is recorded; provisioning is scheduled after the
     response and can neither throw nor fail the completed signing. */
  const provisionImpl = args.provisionImpl || handleDemoProvision;
  const job = () => triggerDemoProvision(env, { name, email }, provisionImpl);
  if (typeof args.afterImpl === "function") args.afterImpl(job);
  else await job();

  return {
    status: 200,
    json: {
      ok: true,
      recordId: record && record.id ? record.id : null,
      signedAt: record && record.signedAt ? record.signedAt : null
    }
  };
}

module.exports = { handleNdaSubmit, ATTESTATION_TEXT, triggerDemoProvision };
