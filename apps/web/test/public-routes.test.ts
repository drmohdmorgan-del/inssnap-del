/**
 * TASK-011 — public website route tests.
 *
 * Verifies:
 *  1. The four public pages render without auth and contain their key
 *     marketing copy (200-equivalent via renderToStaticMarkup).
 *  2. Public pages leak no organization/demo data and never touch the
 *     server-side store or session helpers.
 *  3. Protected surfaces remain gated: anonymous API calls still get 401,
 *     and /admin + /control pages still redirect anonymous users to /login.
 *
 * Skipped when DATABASE_URL is set — the API assertions pin the in-memory
 * fallback path. Run with no DATABASE_URL in the environment.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentType } from "react";
import { NextRequest, NextResponse } from "next/server";

import HomePage from "../app/page";
import ServicesPage from "../app/services/page";
import HowItWorksPage from "../app/how-it-works/page";
import RolesPage from "../app/roles/page";
import { GET as unitsGET } from "../app/api/units/route";
import { POST as showingRequestPOST } from "../app/api/showings/request/route";

const describeMem = describe.skipIf(!!process.env.DATABASE_URL);

function htmlOf(Component: ComponentType): string {
  return renderToStaticMarkup(Component({}));
}

const PAGES: Record<string, ComponentType> = {
  "/": HomePage,
  "/services": ServicesPage,
  "/how-it-works": HowItWorksPage,
  "/roles": RolesPage,
};

describeMem("TASK-011 public pages render without auth", () => {
  it("each public page renders static HTML", () => {
    for (const [path, Page] of Object.entries(PAGES)) {
      const html = htmlOf(Page);
      expect(html.length, `${path} rendered empty`).toBeGreaterThan(500);
    }
  });

  it("/ contains the hero positioning and CTAs", () => {
    const html = htmlOf(HomePage);
    expect(html).toContain("Resident-Powered Leasing Infrastructure");
    expect(html).toContain("The Missing Tile");
    expect(html).toContain("Available NOW");
    expect(html).toContain("Sign in");
    expect(html).toContain('href="/login"');
    expect(html).toContain("info@inssnapp.com");
  });

  it("/services lists all services", () => {
    const html = htmlOf(ServicesPage);
    expect(html).toContain("All services");
    expect(html).toContain("Showing Engine coordination");
    expect(html).toContain("Management web portal");
    expect(html).toContain("Control Center");
  });

  it("/how-it-works covers the full workflow", () => {
    const html = htmlOf(HowItWorksPage);
    expect(html).toContain("Management sync");
    expect(html).toContain("Resident Available NOW");
    expect(html).toContain("Broker gate (optional)");
    expect(html).toContain("Apply / Watch / Decline");
    expect(html).toContain("CONFIRMED");
  });

  it("/roles covers all five roles", () => {
    const html = htmlOf(RolesPage);
    for (const role of ["Management", "Control Center / Super Admin", "Resident", "Prospect", "Broker"]) {
      expect(html, `missing role: ${role}`).toContain(role);
    }
  });

  it("public pages carry building/pilot-stage language, not launch claims", () => {
    const html = Object.values(PAGES).map(htmlOf).join(" ");
    expect(html).toMatch(/pilot|in development|being built/i);
    expect(html).not.toMatch(/\$[\d,]+/); // no revenue/results figures
  });
});

describeMem("TASK-011 public pages leak no org data", () => {
  const BANNED = ["inssnapp.demo", "manager@", "organizationId", "session", "bearer"];

  it("rendered HTML contains no demo or session artifacts", () => {
    for (const [path, Page] of Object.entries(PAGES)) {
      const html = htmlOf(Page);
      for (const needle of BANNED) {
        expect(html, `${path} leaked: ${needle}`).not.toContain(needle);
      }
    }
  });

  it("marketing components never import the store, db, or auth helpers", () => {
    const dir = join(__dirname, "..", "components", "marketing");
    const files = ["SiteHeader.tsx", "SiteFooter.tsx", "marketing-content.ts", "marketing-ui.tsx"];
    const bannedImports = [
      "lib/store",
      "lib/db",
      "lib/auth-helpers",
      "lib/auth-store",
      "@inssnapp/auth",
    ];
    for (const file of files) {
      const src = readFileSync(join(dir, file), "utf8");
      for (const imp of bannedImports) {
        expect(src, `${file} imports ${imp}`).not.toContain(imp);
      }
      expect(src, `${file} is not a server module boundary violation`).not.toContain('"use client"');
    }
  });
});

describeMem("TASK-011 protected surfaces remain gated", () => {
  async function anonCall(
    handler: (req: NextRequest) => Promise<NextResponse>,
    path: string,
    method: string,
  ): Promise<number> {
    const req = new NextRequest(`http://localhost${path}`, { method });
    const res = await handler(req);
    return res.status;
  }

  it("anonymous GET /api/units still returns 401", async () => {
    expect(await anonCall(unitsGET, "/api/units", "GET")).toBe(401);
  });

  it("anonymous POST /api/showings/request still returns 401", async () => {
    const req = new NextRequest("http://localhost/api/showings/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unitId: "nope" }),
    });
    const res = await showingRequestPOST(req);
    expect(res.status).toBe(401);
  });

  it("/admin and /control pages still redirect anonymous users to /login", () => {
    for (const page of ["admin", "control"]) {
      const src = readFileSync(join(__dirname, "..", "app", page, "page.tsx"), "utf8");
      expect(src, `${page} must fetch the session`).toContain("fetchSession");
      expect(src, `${page} must redirect anonymous users`).toContain('router.replace("/login")');
    }
  });

  it("/login page gates demo hint to dev only", () => {
    const src = readFileSync(join(__dirname, "..", "app", "login", "page.tsx"), "utf8");
    expect(src).toContain("DATABASE_URL");
    expect(src).not.toContain("DEMO_TOTP_SECRET");
    const formSrc = readFileSync(join(__dirname, "..", "app", "login", "LoginForm.tsx"), "utf8");
    expect(formSrc).toContain("showDemo");
  });
});
