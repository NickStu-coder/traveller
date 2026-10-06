import { apiError } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/user-auth';

export async function travellerUser() {
  if (process.env.TRAVELLER_AUTH_MODE !== 'individual') return { response: apiError('Traveller requires individual access', 404) };
  const user = await getCurrentUser();
  return user ? { user } : { response: apiError('Unauthorized', 401) };
}

/** Enforce the body limit on actual bytes, including chunked requests. */
export async function travellerBody(request: Request): Promise<unknown> {
  if (!request.body) throw new Error('Empty request body');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32_768) { await reader.cancel(); throw new Error('Request body is too large'); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } finally { reader.releaseLock(); }
}
