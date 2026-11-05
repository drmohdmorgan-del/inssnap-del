export interface DemoNotifyArgs {
  method: string;
  body: unknown;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  now?: Date;
}

export interface DemoNotifyResult {
  status: number;
  json: Record<string, unknown>;
}

export function handleDemoNotify(args: DemoNotifyArgs): Promise<DemoNotifyResult>;
export function formatEastern(date: Date): string;
export const SEED_EMAIL: string;
export const EVENTS: string[];
