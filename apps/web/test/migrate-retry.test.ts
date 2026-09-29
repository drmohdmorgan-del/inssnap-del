/**
 * migrate() retry tests.
 *
 * The boot migration must survive transient database-connection failures on
 * cold start (Neon waking, brief network blips): it retries with backoff
 * instead of failing fast and taking down every /api/* route. A persistently
 * failing database still throws after the retries are exhausted.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const connectMock = vi.fn();
const queryMock = vi.fn(async () => ({}));
const endMock = vi.fn(async () => ({}));

vi.mock("pg", () => ({
  default: {
    Client: vi.fn(function (this: unknown) {
      return { connect: connectMock, query: queryMock, end: endMock };
    }),
  },
}));

import { migrate } from "../lib/db";

describe("migrate() retry", () => {
  const OLD_URL = process.env.DATABASE_URL;
  beforeEach(() => {
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
    connectMock.mockReset().mockResolvedValue(undefined);
    queryMock.mockClear();
    endMock.mockClear();
  });
  afterEach(() => {
    if (OLD_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = OLD_URL;
  });

  it("succeeds when the database becomes reachable on a later attempt", async () => {
    connectMock
      .mockRejectedValueOnce(new Error("ENOTFOUND"))
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce(undefined);
    await migrate();
    expect(connectMock).toHaveBeenCalledTimes(3);
    // The successful attempt ran the schema inside a transaction.
    expect(queryMock.mock.calls.map((c) => String((c as unknown[])[0]).split("\n")[0])).toContain("BEGIN");
  }, 15000);

  it("throws after exhausting retries when the database stays down", async () => {
    connectMock.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(migrate()).rejects.toThrow("ENOTFOUND");
    expect(connectMock).toHaveBeenCalledTimes(3);
  }, 15000);

  it("succeeds on the first attempt when the database is reachable", async () => {
    await migrate();
    expect(connectMock).toHaveBeenCalledTimes(1);
  });
});
