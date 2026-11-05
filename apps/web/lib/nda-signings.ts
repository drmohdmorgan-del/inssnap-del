/**
 * Website NDA signing records — the persistence layer for the INSNAPP
 * website NDA -> Demo Portal flow (2026-11-05: once a client signs the
 * NDA on the website, an email with the demo access link is created
 * and sent to the signer automatically). Mirrors the InSnap flow
 * (insnap-job-engine src/lib/nda-signings.ts) on this app's own data
 * layer (lib/db.ts: PostgreSQL when DATABASE_URL is set, the
 * in-memory store otherwise).
 *
 * Record discipline:
 *  - The record is written FIRST, before any demo provisioning or
 *    email. The record IS the verification for the provisioning path.
 *  - A failed insert throws — the submission fails loudly with it.
 *    There is no path where a signing "succeeds" without a record.
 *
 * Storage: the dedicated nda_signing_records table (see
 * packages/db/src/schema.sql), outside the showing-engine tables.
 */

import { createHash, randomUUID } from "node:crypto";
import { db } from "./db";

export const NDA_DOCUMENT_ID = "iec-cnda-insnapp";
export const NDA_DOCUMENT_VERSION = "2026-11-05";

export interface NdaSigningInput {
  name: string;
  email: string;
  company: string;
  title?: string;
  typedSignature: string;
  attestation: string;
  ipAddress?: string;
  userAgent?: string;
  source?: string;
}

export interface NdaSigningRecord extends Required<NdaSigningInput> {
  id: string;
  documentId: string;
  documentVersion: string;
  payloadHash: string;
  signedAt: string;
}

/** SHA-256 over the canonical signing payload — the integrity evidence
 *  stored with the record (the same role the executed-PDF hash plays
 *  in MEDEXEC's audit record). */
export function ndaPayloadHash(parts: {
  name: string;
  email: string;
  company: string;
  title: string;
  typedSignature: string;
  attestation: string;
  documentId: string;
  documentVersion: string;
  signedAt: string;
}): string {
  const canonical = [
    parts.documentId,
    parts.documentVersion,
    parts.name,
    parts.email,
    parts.company,
    parts.title,
    parts.typedSignature,
    parts.attestation,
    parts.signedAt,
  ].join("\n");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/** Insert the signing record. Throws on any failure — callers must let
 *  that fail the submission (no record, no signing). */
export async function recordNdaSigning(input: NdaSigningInput): Promise<NdaSigningRecord> {
  const signedAt = new Date().toISOString();
  const record: NdaSigningRecord = {
    id: randomUUID(),
    name: input.name,
    email: input.email,
    company: input.company,
    title: input.title ?? "",
    typedSignature: input.typedSignature,
    attestation: input.attestation,
    ipAddress: input.ipAddress ?? "",
    userAgent: input.userAgent ?? "",
    source: input.source ?? "website-nda",
    documentId: NDA_DOCUMENT_ID,
    documentVersion: NDA_DOCUMENT_VERSION,
    payloadHash: "",
    signedAt,
  };
  record.payloadHash = ndaPayloadHash(record);
  await db.ndaSignings.insert(record);
  return record;
}

/** Read back signing records, newest first (admin/audit use). */
export async function listNdaSignings(limit = 100): Promise<NdaSigningRecord[]> {
  return db.ndaSignings.list(limit);
}
