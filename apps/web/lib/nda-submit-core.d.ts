import type { NdaSigningInput, NdaSigningRecord } from "./nda-signings";

export interface NdaSubmitArgs {
  method: string;
  body?: unknown;
  env?: Record<string, string | undefined>;
  ip?: string;
  userAgent?: string;
  recordImpl: (record: NdaSigningInput) => Promise<NdaSigningRecord>;
  provisionImpl?: (args: {
    method: string;
    headers: Record<string, string>;
    body: unknown;
    env?: Record<string, string | undefined>;
  }) => Promise<{ status: number; json: Record<string, unknown> }>;
  afterImpl?: (fn: () => Promise<void>) => void;
}

export interface NdaSubmitResult {
  status: number;
  json: Record<string, unknown>;
}

export function handleNdaSubmit(args: NdaSubmitArgs): Promise<NdaSubmitResult>;
export const ATTESTATION_TEXT: string;
