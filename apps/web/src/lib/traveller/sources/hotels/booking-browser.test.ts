import { EventEmitter } from 'node:events';
import { beforeEach, expect, it, vi } from 'vitest';
import { TravelExecution, withTravelExecution } from '../../../travel/execution';
import { withGooglePage } from '../browser';
import { SourceError } from '../types';

const fixture = vi.hoisted(() => ({ launch: vi.fn(), navigation: vi.fn() }));
vi.mock('playwright', () => ({ chromium: { launch: fixture.launch } }));
vi.mock('../../../travel/navigation', () => ({ guardTravelContext: fixture.navigation }));

beforeEach(() => vi.clearAllMocks());

async function run(url: string, subframe = false) {
  const frame = { url: () => url }, page = new EventEmitter();
  Object.assign(page, { mainFrame: () => frame, setDefaultTimeout: vi.fn() });
  const close = vi.fn(async () => undefined), browser = new EventEmitter();
  Object.assign(browser, { close, newContext: async () => ({ route: async () => undefined, newPage: async () => page }) });
  fixture.launch.mockResolvedValue(browser);
  fixture.navigation.mockResolvedValue(() => ({}));
  const execution = new TravelExecution({ jobId: 'challenge-fixture', generation: 1, resource: 'fixture' });
  const result = withTravelExecution(execution, () => withGooglePage(execution.signal, async () => {
    page.emit('framenavigated', subframe ? { url: () => url } : frame);
    if (execution.signal.aborted) expect(close).toHaveBeenCalled();
    return 'confirmed fixture';
  }, 'booking'));
  return { result, close, execution };
}

it('closes a transient Booking challenge immediately and preserves blocked classification', async () => {
  const { result, execution, close } = await run('https://www.booking.com/searchresults.en-gb.html?chal_t=1791273117808');
  await expect(result).rejects.toBeInstanceOf(SourceError);
  expect(execution.signal.reason).toMatchObject({ status: 'blocked' });
  expect(close).toHaveBeenCalled();
});

it.each([false, true])('retains ordinary results without a main-frame challenge (subframe=%s)', async subframe => {
  const { result, close } = await run('https://www.booking.com/searchresults.en-gb.html' + (subframe ? '?chal_t=fixture' : ''), subframe);
  await expect(result).resolves.toBe('confirmed fixture');
  expect(close).toHaveBeenCalled();
});
