/**
 * TASK-011 — shared marketing content.
 *
 * Static copy only. Nothing here may read from the database, the store,
 * or any session state — public pages are marketing surfaces with no
 * access to organization data. Copy stays in building/pilot-stage
 * language: no launched-product claims, no revenue or results figures,
 * no customer names or numbers.
 *
 * Sources: INSSNAPP_Latest_Scope_2026.pdf (§1 Product Vision & Operating
 * Model, §3 Abstracted MVP Scope), docs/MASTER_SPEC.md.
 */

export const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/services", label: "Services" },
  { href: "/roles", label: "Roles" },
  { href: "/contact", label: "Contact" },
] as const;

export type WorkflowStep = { title: string; detail: string };

/** End-to-end workflow: from management sign-up to lease. */
export const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    title: "Management sync",
    detail:
      "Management synchronizes eligible property and unit information through a PMS adapter. The management company remains the system of record for eligibility.",
  },
  {
    title: "Resident Available NOW",
    detail:
      "A participating resident controls a simple Available NOW status — the resident decides when their occupied unit can be shown.",
  },
  {
    title: "Prospect request",
    detail:
      "A prospective tenant requests access to an eligible unit. Private resident contact information is never shared with the prospect.",
  },
  {
    title: "Resident accept",
    detail:
      "The resident accepts or declines the request. A showing only moves forward when the resident says yes.",
  },
  {
    title: "Broker gate (optional)",
    detail:
      "When broker participation is required, the optional broker gate assigns or confirms broker involvement before the showing is locked in.",
  },
  {
    title: "Confirmed",
    detail:
      "The Showing Engine confirms the workflow and locks the unit, preventing conflicting active showings for the same unit.",
  },
  {
    title: "Showing",
    detail:
      "Check-in opens the showing. The engine tracks it in progress until the tour is complete.",
  },
  {
    title: "Completed",
    detail:
      "Completion releases the unit lock and enables the prospect's outcome step.",
  },
  {
    title: "Apply / Watch / Decline",
    detail:
      "After the tour, the prospect selects Apply, Watch, or Decline — closing the loop back to leasing.",
  },
];

export type RoleCard = {
  role: string;
  platform: string;
  headline: string;
  bullets: string[];
};

export const ROLE_CARDS: RoleCard[] = [
  {
    role: "Management",
    platform: "Web",
    headline: "Portfolio and unit oversight",
    bullets: [
      "Dashboard with live showing activity",
      "Properties, buildings, and unit management",
      "Resident enrollment and participation",
      "PMS synchronization and connection status",
      "Reporting: funnel, response times, participation",
    ],
  },
  {
    role: "Control Center / Super Admin",
    platform: "Web",
    headline: "Platform-wide operations",
    bullets: [
      "Organization overview",
      "Showing Engine workflow monitor",
      "Integration health and status",
      "Audit log and security events",
      "System administration and feature flags",
    ],
  },
  {
    role: "Resident",
    platform: "Mobile",
    headline: "Current tenant, in control",
    bullets: [
      "Available NOW availability toggle",
      "Verified resident and unit status",
      "Incoming showing requests",
      "Accept or decline, live showing status",
      "Complete and rate after the tour",
    ],
  },
  {
    role: "Prospect",
    platform: "Mobile",
    headline: "Prospective tenant experience",
    bullets: [
      "Discover eligible units and unit details",
      "Request a showing in one step",
      "Live request and showing status",
      "Apply, Watch, or Decline after the tour",
    ],
  },
  {
    role: "Broker",
    platform: "Mobile",
    headline: "Optional broker participation",
    bullets: [
      "Assignment queue for required showings",
      "Accept or decline assignments",
      "Check-in and live showing status",
      "Complete and rate after the tour",
    ],
  },
];

export type ServiceCard = {
  title: string;
  detail: string;
  bullets: string[];
};

export const SERVICE_CARDS: ServiceCard[] = [
  {
    title: "Showing Engine coordination",
    detail:
      "The authoritative state machine behind every showing: AVAILABLE → REQUESTED → RESIDENT_ACCEPTED → BROKER_GATE → CONFIRMED → IN_PROGRESS → COMPLETED → OUTCOME.",
    bullets: [
      "Unit-level locking prevents double-booking",
      "Idempotent transitions — safe retries",
      "Role policy enforced on every transition",
      "Immutable audit event for every material step",
    ],
  },
  {
    title: "Management web portal",
    detail:
      "The desktop operations surface for property management teams.",
    bullets: [
      "Dashboard and live showings monitor",
      "Properties, units, and eligibility",
      "Resident enrollment and participation",
      "Basic reports and PMS connection status",
    ],
  },
  {
    title: "Resident mobile experience",
    detail:
      "One-screen workflow for the current tenant.",
    bullets: [
      "Available NOW toggle",
      "Incoming request inbox",
      "Accept / decline with one tap",
      "Live status, completion, and rating",
    ],
  },
  {
    title: "Prospect mobile experience",
    detail:
      "One-screen workflow for the prospective tenant.",
    bullets: [
      "Eligible unit discovery and details",
      "Request showing without resident contact details",
      "Live request and tour status",
      "Apply / Watch / Decline outcomes",
    ],
  },
  {
    title: "Broker mobile experience",
    detail:
      "One-screen workflow for broker participation.",
    bullets: [
      "Assignment queue",
      "Accept / decline assignments",
      "Check-in support for the showing",
      "Completion and rating",
    ],
  },
  {
    title: "Control Center",
    detail:
      "The INSSNAPP super-admin surface for platform operations.",
    bullets: [
      "Organization overview",
      "Workflow monitor and engine health",
      "Integration status",
      "Audit log and security events",
    ],
  },
];

export const MOBILE_NOTE =
  "One Expo codebase powers the resident, prospect, and broker experiences — role-based views on iOS and Android, designed as one-screen workflows.";
