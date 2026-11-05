"use strict";
/* =====================================================================
   INSNAPP — ORG email signature for SYSTEM / automated email
   (DrMorgan's rules, 2026-11-04: system/automated mail carries the
   org variant of the full signature INCLUDING the logo — WITHOUT his
   personal name. His personal mailbox keeps the named variant.)

   Single source for this project's serverless email senders
   (app/api/demo-notify, app/api/demo-provision). Plain JS so the Node
   check suites can require it directly; demo-signature.d.ts carries
   the types.

   LOGO + IDENTITY: INSNAPP's system mail carries the IEC logo (the
   platform operator's) from the IEC site's email assets — the same
   pattern InSnap and MEDEXEC use — with the INSNAPP org line:
   "INSNAPP · IEC, Inc." + 857-867-1767 + info@iecincglobal.com.

   SENDER NOTE: senders' From stays Resend's onboarding address until
   a sending domain is verified in Resend. After verification the From
   flips to info@iecincglobal.com via the DEMO_NOTIFY_FROM /
   DEMO_PROVISION_FROM env vars — no code change.
   ===================================================================== */

const SIGNATURE_TEXT = [
  "INSNAPP · IEC, Inc.",
  "857-867-1767",
  "info@iecincglobal.com"
].join("\n");

const SIGNATURE_HTML = [
  '<table cellpadding="0" cellspacing="0" border="0" style="margin-top:24px">',
  '<tr><td><img src="https://iecincglobal.com/assets/iec-logo-email.png" width="140" alt="IEC, Inc." style="display:block;border:0"></td></tr>',
  '<tr><td style="padding-top:10px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.45;color:#1A1A1A">',
  "<strong>INSNAPP · IEC, Inc.</strong><br>",
  '<a href="tel:+18578671767" style="color:#1A1A1A;text-decoration:none">857-867-1767</a><br>',
  '<a href="mailto:info@iecincglobal.com" style="color:#1A1A1A;text-decoration:none">info@iecincglobal.com</a>',
  "</td></tr>",
  "</table>"
].join("");

module.exports = { SIGNATURE_TEXT, SIGNATURE_HTML };
