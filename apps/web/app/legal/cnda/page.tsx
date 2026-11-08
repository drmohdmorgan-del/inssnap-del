/**
 * CNDA signing moved to IEC's ONE central signing page (2026-11-08,
 * DrMorgan): there is a single universal IEC mutual NDA for all assets,
 * signed at iecincglobal.com/nda.html. This route redirects there with
 * the INSNAPP origin recorded; the recorded universal signing satisfies
 * the NDA-first gate for INSNAPP Demo Portal access exactly as the old
 * on-page signing did. (The previous on-page instrument + SigningPanel
 * remain in git history; SigningPanel.tsx is intentionally unused now.)
 */

import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mutual Non-Disclosure Agreement — INSSNAPP",
  description:
    "IEC's single universal mutual non-disclosure agreement is signed on IEC's central signing page. One signing covers INSSNAPP and every IEC asset.",
};

export default function CndaPage() {
  redirect("https://iecincglobal.com/nda.html?origin=inssnapp");
}
