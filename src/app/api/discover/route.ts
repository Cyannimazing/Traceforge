import { NextResponse } from "next/server";
import {createDiscoveryService,DiscoveryUnavailable} from '@/lib/discovery';
export const runtime='nodejs';
const discovery=createDiscoveryService();
export async function GET(request:Request) {
  try {
    return NextResponse.json(await discovery.get({signal:request.signal}),{headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    const retryAfterMs=error instanceof DiscoveryUnavailable?error.retryAfterMs:30000;
    return NextResponse.json(
      {
        error:
          "Recent token profiles are unavailable. You can still scan an address.",
        refreshAfterMs:retryAfterMs,
      },
      { status: error instanceof DiscoveryUnavailable&&error.rateLimited?429:502,headers:{'Cache-Control':'no-store','Retry-After':String(Math.ceil(retryAfterMs/1000))} },
    );
  }
}
