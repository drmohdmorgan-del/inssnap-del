export interface DemoProvisionArgs {
  method: string;
  headers?: Record<string, string | undefined>;
  body?: unknown;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  now?: Date | (() => Date);
  pollAttempts?: number;
  pollDelayMs?: number;
}

export interface DemoProvisionResult {
  status: number;
  json: Record<string, unknown>;
}

export function handleDemoProvision(args: DemoProvisionArgs): Promise<DemoProvisionResult>;
