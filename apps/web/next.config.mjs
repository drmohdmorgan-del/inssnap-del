/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@inssnapp/engine", "@inssnapp/auth", "@inssnapp/db"],
  // argon2 loads a native binding at runtime — never bundle it.
  serverExternalPackages: ["argon2"],
  /**
   * Secure HTTP headers — TASK-010.
   *
   * HSTS is production-only (Vercel terminates TLS there; enabling it on
   * http://localhost would pin the browser to https for the dev host).
   * X-Frame-Options SAMEORIGIN + frame-ancestors 'self' block clickjacking;
   * nosniff blocks MIME confusion; the referrer policy keeps org-internal
   * URLs out of third-party referrers; the minimal CSP allows framing and
   * form submission only from the same origin. No inline-script CSP — Next.js
   * ships inline bootstraps that a strict script-src would break.
   */
  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Content-Security-Policy",
        value: "frame-ancestors 'self'; form-action 'self'",
      },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];
    if (process.env.NODE_ENV === "production") {
      securityHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains",
      });
    }
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
