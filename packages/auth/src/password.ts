/**
 * Password hashing — TASK-002.
 *
 * Primary scheme is **argon2id** with OWASP parameters (m=19 MiB, t=2, p=1).
 * If the native argon2 module cannot load (e.g. no prebuilt binary for the
 * platform), hashing falls back to Node's `crypto.scrypt` with OWASP-grade
 * parameters (N=2^17, r=8, p=1, 64-byte output) — NOT a silent downgrade to
 * a fast hash: the stored prefix identifies the scheme, `passwordScheme()`
 * reports which path is active, and verification handles both prefixes.
 *
 * The legacy demo `s1:` scheme (SHA-256 with salt) is NOT accepted anymore.
 */

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

// OWASP scrypt parameters for the fallback path.
const SCRYPT_N = 131072; // 2^17
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

interface ScryptOpts {
  N: number;
  r: number;
  p: number;
}

/** Promise wrapper — @types/node's promisified scrypt lacks the options arg. */
function scryptP(password: string, salt: Buffer, keylen: number, opts: ScryptOpts): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, opts, (err, key) => {
      if (err) reject(err);
      else resolve(key as Buffer);
    });
  });
}

type Argon2Module = typeof import("argon2");

let argon2Module: Argon2Module | null | undefined;

async function loadArgon2(): Promise<Argon2Module | null> {
  if (argon2Module !== undefined) return argon2Module;
  try {
    argon2Module = (await import("argon2")) as Argon2Module;
  } catch {
    argon2Module = null;
  }
  return argon2Module;
}

/** Reports which hashing scheme is active in this runtime. */
export async function passwordScheme(): Promise<"argon2id" | "scrypt"> {
  return (await loadArgon2()) ? "argon2id" : "scrypt";
}

async function hashScrypt(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = (await scryptP(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  })) as Buffer;
  const params = `N=${SCRYPT_N},r=${SCRYPT_R},p=${SCRYPT_P}`;
  return `$scrypt$${params}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

async function verifyScrypt(password: string, stored: string): Promise<boolean> {
  // Format: $scrypt$N=131072,r=8,p=1$<salt-b64url>$<key-b64url>
  const parts = stored.split("$");
  if (parts.length !== 5 || parts[1] !== "scrypt") return false;
  const params: Record<string, number> = {};
  for (const kv of parts[2].split(",")) {
    const [k, v] = kv.split("=");
    const n = Number(v);
    if (!k || !Number.isSafeInteger(n) || n <= 0) return false;
    params[k] = n;
  }
  if (!params.N || !params.r || !params.p) return false;
  const salt = Buffer.from(parts[3], "base64url");
  const key = Buffer.from(parts[4], "base64url");
  if (salt.length === 0 || key.length === 0) return false;
  const candidate = (await scryptP(password, salt, key.length, {
    N: params.N,
    r: params.r,
    p: params.p,
  })) as Buffer;
  return key.length === candidate.length && timingSafeEqual(key, candidate);
}

/** Hashes a password with argon2id (or scrypt fallback). Never throws on bad input. */
export async function hashPassword(password: string): Promise<string> {
  const argon2 = await loadArgon2();
  if (argon2) {
    return argon2.hash(password, {
      type: argon2.argon2id,
      timeCost: 2,
      memoryCost: 19456,
      parallelism: 1,
    });
  }
  return hashScrypt(password);
}

/**
 * Verifies a password against a stored hash. Accepts `$argon2id$` and
 * `$scrypt$` hashes. Returns false for unknown/legacy schemes.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (typeof stored !== "string" || !stored) return false;
  try {
    if (stored.startsWith("$argon2id$")) {
      const argon2 = await loadArgon2();
      if (!argon2) return false;
      return await argon2.verify(stored, password);
    }
    if (stored.startsWith("$scrypt$")) {
      return await verifyScrypt(password, stored);
    }
    return false;
  } catch {
    return false;
  }
}
