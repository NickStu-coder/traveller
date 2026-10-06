import { createAccessHandler } from "thesidedoor-core/access/http";
import { DeviceService } from "thesidedoor-core/access";
import { prisma } from "@/lib/prisma";
import { sharedAccess, sharedProfiles, SHARED_SESSION_COOKIE } from "./service";
import { accessOrigins } from './network/configuration';

const devices = new DeviceService({
  access: sharedAccess,
  scopesFor: () => ["api"],
  tokenPrefix: "ff_",
});

export async function accessHandler() {
  const config = await prisma.extractionConfig.findUnique({
    where: { id: "singleton" },
    select: { publicBaseUrl: true },
  });
  const { origin, passwordOrigins } = accessOrigins(config?.publicBaseUrl);
  const handler = createAccessHandler({
    access: sharedAccess,
    devices,
    profiles: sharedProfiles,
    name: "Traveller",
    origin,
    passwordOrigins,
    trustedProxy: new URL(origin).protocol === "https:",
    useHostHeader: true,
    cookieName: SHARED_SESSION_COOKIE,
  });
  return async (request: Request, action: string) => {
    if (process.env.TRAVELLER_AUTH_MODE === 'individual') {
      const state = await sharedAccess.store.read();
      if (state.mode !== 'individual')
        return Response.json({ error: 'Individual account migration is required' }, { status: 503 });
      if (['household', 'open-profile', 'select-profile', 'configure-household', 'set-mode'].includes(action))
        return Response.json({ error: 'Household access is disabled in Traveller' }, { status: 403 });
    }
    const response = await handler(request, action);
    if (response.status !== 403 || action !== 'household' || request.method !== 'POST') return response;
    const headers = new Headers(request.headers);
    headers.set('content-type', 'application/json');
    headers.delete('content-length');
    const check = await handler(new Request(request.url, { method: 'POST', headers, body: '{}' }), 'check-origin');
    if (check.status !== 403) return response;
    console.warn('Access origin rejected', {
      origin: request.headers.get('origin')?.slice(0, 200),
      host: request.headers.get('host')?.slice(0, 200),
      configuredOrigin: origin,
    });
    return Response.json({ error: 'origin_not_allowed' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  };
}
