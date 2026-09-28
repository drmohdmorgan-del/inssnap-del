/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@inssnapp/engine", "@inssnapp/auth", "@inssnapp/db"],
  // argon2 loads a native binding at runtime — never bundle it.
  serverExternalPackages: ["argon2"],
};

export default nextConfig;
