import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

it('never intercepts private pages, API responses, user image transforms or cross-origin resources', () => {
  let handler: (event: { request: { method: string; url: string }; respondWith: ReturnType<typeof vi.fn> }) => void = () => { throw new Error('Worker did not register'); };
  const fetch = vi.fn(), match = vi.fn(), respondWith = vi.fn();
  runInNewContext(readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8'), {
    self: { location: { origin: 'https://traveller.test' }, addEventListener: (event: string, listener: typeof handler) => { if (event === 'fetch') handler = listener; } },
    fetch, caches: { match }, URL,
  });
  for (const url of ['https://traveller.test/dashboard', 'https://traveller.test/api/traveller/profiles', 'https://traveller.test/_next/image?url=private-upload', 'https://elsewhere.test/_next/static/chunk.js'])
    handler({ request: { method: 'GET', url }, respondWith });
  expect(respondWith).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(match).not.toHaveBeenCalled();
});
