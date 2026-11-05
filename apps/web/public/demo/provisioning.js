"use strict";
/* =====================================================================
   INSNAPP Demo Portal — provisioned accounts (single source of truth).

   Loaded by demo/index.html (the portal gate) and demo/activate/
   (the activation page); read server-side by /api/demo-notify for the
   access notifications. There is NO public self-signup for the DEMO
   portal and passwords are never sent by email: IEC provisions each
   account here, the signer receives a one-time activation link
   carrying the token, and sets their own password on the activation
   page. The token is single-use — it dies the moment the password is
   set. Links do NOT expire; control is administrative, through the
   status field:

     invited  — account created, activation link live, not yet used
     active   — account live (set by us once activation is confirmed,
                or for accounts whose password we manage directly)
     paused   — login blocked, account preserved (flip + redeploy)
     revoked  — activation link dead AND login dead (flip + redeploy)

   To provision a signer: add one entry with a fresh random token and
   status "invited", redeploy, and email them the link
   https://www.inssnapp.com/demo/activate/?token=<token>.

   Boundary: INSNAPP's real product has its own signup for residents,
   prospects, and brokers — that is the PRODUCT. This DEMO portal is a
   separate, invitation-only walkthrough on synthetic data; product
   accounts and demo accounts are different things and never mix.

   Static-stack note: this is the client-side simulation's data layer.
   Statuses are enforced by the portal/activation logic in the browser;
   real per-user auth remains the named next step before scale-out.

   Access notifications (2026-11-05): a successful activation or login
   calls /api/demo-notify (app/api/demo-notify), which emails DrMorgan
   who accessed the demo and when — never on a failed attempt, and
   never for the seed account. Sending needs RESEND_API_KEY in THIS
   project's Vercel env; without it the endpoint logs a NO-OP and the
   demo flow is unaffected.
   ===================================================================== */
const DEMO_PROVISIONED_ACCOUNTS = [
  {
    email: "drmohdmorgan@gmail.com",
    name: "Mohammed M. Morgan, M.D.",
    token: "e8b021ff67aba7b029fffcb91e363c5b613dbf6e58c7274a",
    status: "invited",
    issuedAt: "2026-11-05T06:06:10-05:00"
  },
  {
    /* Internal seed for end-to-end review; password lives in the
       DEMO_SEED_ACCOUNTS list on the portal page. No token: it is
       already active and cannot be (re)activated. */
    email: "demo@insnapp.example",
    name: "Demo Reviewer",
    status: "active"
  },
  {
    email: "mohdology@gmail.com",
    name: "Mohamed Ismael",
    token: "0637f9322709214ed0ee6949386df39057f0685dc118fdec",
    status: "invited",
    issuedAt: "2026-11-05T07:45:16-05:00"
  }
];

if (typeof module !== "undefined" && module.exports) {
  module.exports = { DEMO_PROVISIONED_ACCOUNTS };
}
