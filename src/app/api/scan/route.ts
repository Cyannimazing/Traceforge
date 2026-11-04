import { NextRequest, NextResponse } from "next/server";
import { investigationService } from '@/lib/investigation-server';
import { parseScanRequest } from '@/lib/scan-request';
export const runtime = 'nodejs';
export const maxDuration = 120;
export async function GET(request: NextRequest) {
  const {chain,token,error,options}=parseScanRequest(request.nextUrl);
  if (error) return NextResponse.json({ error }, { status: 400 });
  try {
    return NextResponse.json(
      await investigationService.scan(chain,token,{...options,signal:AbortSignal.any([request.signal,AbortSignal.timeout(110_000)])}),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to complete this scan. Please retry." },
      { status: 502 },
    );
  }
}
