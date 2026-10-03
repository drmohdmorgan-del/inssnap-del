import { NextResponse } from "next/server";
import { isTestModeEnabled } from "../../../../lib/test-mode";

/** Public: lets the UI show (or hide) the test-mode role switcher. */
export async function GET() {
  return NextResponse.json({ enabled: isTestModeEnabled() });
}
