import type { Page } from 'playwright';
import { EventEmitter } from 'node:events';
import { beforeEach, expect, it, vi } from 'vitest';
import { googlePageState, withGooglePage } from '../browser';
import { ProfileSearchError, SourceError } from '../types';
import { TravelExecution, withTravelExecution } from '../../../travel/execution';

const fixture = vi.hoisted(() => ({ launch: vi.fn(), navigation: vi.fn() }));
vi.mock('playwright', () => ({ chromium: { launch: fixture.launch } }));
vi.mock('../../../travel/navigation', () => ({ guardTravelContext: fixture.navigation }));
beforeEach(() => vi.clearAllMocks());

const page = (text: string, path = '/travel/explore') => ({
  locator: () => ({ innerText: async () => text }),
  url: () => 'https://www.google.com' + path,
}) as unknown as Page;

it('classifies the observed booking-horizon message as a search limitation', async () => {
  await expect(googlePageState(page('Oops, something went wrong.\nRequested flight date is too far in the future.')))
    .rejects.toBeInstanceOf(ProfileSearchError);
});

it.each(['Unusual traffic', 'Too many requests'])('retains source protection before date-limit classification: %s', async challenge => {
  await expect(googlePageState(page(challenge + '\nRequested flight date is too far in the future')))
    .rejects.toMatchObject({ status: challenge === 'Unusual traffic' ? 'blocked' : 'rate_limited' });
});

it('preserves access-challenge classification from the navigation path', async () => {
  await expect(googlePageState(page('Requested flight date is too far in the future', '/sorry/index')))
    .rejects.toMatchObject({ status: 'blocked' });
});

it('allows ordinary results to continue through the existing context checks', async () => {
  await expect(googlePageState(page('Ljubljana to anywhere · Business · Paris €961'))).resolves.toBeUndefined();
});

async function failedLookup(text: string, error: Error) {
  const browser = new EventEmitter(), close = vi.fn(async () => undefined);
  const document = Object.assign(new EventEmitter(), page(text), { setDefaultTimeout: vi.fn() });
  Object.assign(browser, { close, newContext: async () => ({ route: async () => undefined, newPage: async () => document }) });
  fixture.launch.mockResolvedValue(browser);
  fixture.navigation.mockResolvedValue(() => ({}));
  const execution = new TravelExecution({ jobId: 'google-state-fixture', generation: 1, resource: 'fixture' });
  const result = withTravelExecution(execution, () => withGooglePage(execution.signal, async () => { throw error; }));
  return { result, close };
}

it('classifies a late booking-horizon response after a result wait fails and closes the browser', async () => {
  const { result, close } = await failedLookup('Requested flight date is too far in the future', new Error('Result wait timed out'));
  await expect(result).rejects.toBeInstanceOf(ProfileSearchError);
  expect(close).toHaveBeenCalled();
});

it('preserves an explicit access restriction over a late date-limit message', async () => {
  const error = new SourceError('blocked', 'Access challenge');
  const { result } = await failedLookup('Requested flight date is too far in the future', error);
  await expect(result).rejects.toBe(error);
});

it('retains an unknown provider failure when no recognized response explains it', async () => {
  const error = new Error('Result wait timed out');
  const { result, close } = await failedLookup('Oops, something went wrong', error);
  await expect(result).rejects.toBe(error);
  expect(close).toHaveBeenCalled();
});
