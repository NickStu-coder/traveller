import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
import { chromium } from 'playwright';

// Real individual access, private APIs, forms, locales and responsive pages.
// Refuse every database except the explicitly disposable browser-test database.
const database = new URL(process.env.DATABASE_URL ?? 'http://invalid');
assert.ok(['localhost', '127.0.0.1', 'database'].includes(database.hostname));
assert.equal(database.pathname, '/traveller_surfaces');
assert.equal(process.env.TRAVELLER_AUTH_MODE, 'individual');
const db = new pg.Client({ connectionString: database.href });
await db.connect();
assert.equal(Number((await db.query('SELECT count(*) FROM "User"')).rows[0].count), 0);
const output = resolve(process.env.TRAVELLER_BROWSER_OUTPUT ?? '/tmp/traveller-browser');
await mkdir(output, { recursive: true });
const origin = 'http://127.0.0.1:3019';
const environment = { ...process.env, APP_URL: origin, SELF_HOSTED: 'true', CRON_ENABLED: 'false', REDIS_URL: '', NEXT_TELEMETRY_DISABLED: '1' };
const accessCopy = JSON.parse(await readFile('apps/web/messages/en/pages.json', 'utf8')).SharedAccess;
const english = JSON.parse(await readFile('apps/web/messages/en/traveller.json', 'utf8')).Traveller;
const slovenian = JSON.parse(await readFile('apps/web/messages/sl/traveller.json', 'utf8')).Traveller;
const hotelCopy = JSON.parse(await readFile('apps/web/messages/sl/hotels.json', 'utf8')).Hotels;
const carCopy = JSON.parse(await readFile('apps/web/messages/sl/cars.json', 'utf8')).Cars;
const recoveryCopy = JSON.parse(await readFile('apps/web/messages/sl/admin.json', 'utf8')).AdminTravel;
const ownerName = 'traveller-browser-owner', memberName = 'traveller-browser-member';
const password = 'Traveller browser test only password';
const passed = [], errors = [], contexts = [];
const log = createWriteStream(resolve(output, 'server.log'));
const server = spawn(process.execPath, [resolve('node_modules/next/dist/bin/next'), 'start', '-p', '3019', '-H', '127.0.0.1'], {
  cwd: resolve('apps/web'), env: environment, stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.pipe(log); server.stderr.pipe(log);
let browser;
const pass = name => { passed.push(name); console.log(`PASS ${name}`); };
async function json(response, status = 200) {
  console.log(`RESPONSE ${new URL(response.url()).pathname} ${response.status()}`);
  let timer;
  const body = await Promise.race([response.text(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('API response body did not finish within 20 seconds')), 20_000); })]).finally(() => clearTimeout(timer));
  assert.equal(response.status(), status, body);
  return JSON.parse(body).data;
}
async function capture(page, name) {
  for (const width of [1280, 390]) {
    console.log(`CAPTURE ${name} ${width}`);
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: overflow at ${width}px`);
    await page.screenshot({ path: resolve(output, `${name}-${width}.png`), fullPage: true, animations: 'disabled', timeout: 20_000 });
  }
}
async function newContext(locale = 'en') {
  const context = await browser.newContext({ baseURL: origin, viewport: { width: 1280, height: 1000 }, timezoneId: 'Europe/Ljubljana' });
  await context.addCookies([{ name: 'ft-locale', value: locale, url: origin }]);
  context.on('page', page => {
    page.setDefaultTimeout(20_000); page.setDefaultNavigationTimeout(30_000); page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.text().includes('MISSING_MESSAGE')) errors.push(message.text()); });
  });
  contexts.push(context); return context;
}
async function claimCode() {
  const child = spawn('npm', ['run', 'cli', '--', 'access', 'setup'], { env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
  let text = '';
  child.stdout.on('data', chunk => { text += chunk; });
  child.stderr.on('data', () => {});
  const code = await new Promise((accept, reject) => { child.on('error', reject); child.on('close', accept); });
  assert.equal(code, 0, 'Local individual setup must succeed');
  const payload = text.split('\n').map(line => { try { return JSON.parse(line); } catch { return null; } }).find(value => value?.operation === 'claim');
  assert.ok(payload?.code, 'Local setup must issue a single-use claim code');
  return payload.code;
}
try {
  for (let attempt = 0; attempt < 90; attempt++) {
    assert.equal(server.exitCode, null, 'Browser-test server exited; inspect server.log');
    if ((await fetch(`${origin}/api/health`).catch(() => null))?.ok) break;
    if (attempt === 89) throw new Error('Browser-test server did not become healthy');
    await new Promise(accept => setTimeout(accept, 500));
  }
  browser = await chromium.launch({ headless: true });
  const owner = await newContext(), ownerPage = await owner.newPage();
  const code = await claimCode();
  await ownerPage.goto('/access');
  await ownerPage.getByLabel(accessCopy.name, { exact: true }).fill(ownerName);
  await ownerPage.getByLabel(accessCopy.code, { exact: true }).fill(code);
  await ownerPage.getByLabel(accessCopy.password, { exact: true }).fill(password);
  await capture(ownerPage, 'claim');
  await ownerPage.getByRole('button', { name: accessCopy.claim, exact: true }).click();
  // Passkey enrollment is optional; the test exercises the password fallback.
  const enrollment = ownerPage.getByRole('button', { name: accessCopy.continueWithoutPasskey, exact: true });
  const outcome = await Promise.race([
    ownerPage.waitForURL('**/discover').then(() => 'signed-in'),
    enrollment.waitFor({ state: 'visible' }).then(() => 'enrollment'),
  ]);
  if (outcome === 'enrollment') await enrollment.click();
  await ownerPage.waitForURL('**/discover');
  assert.equal((await owner.request.post('/api/access/claim', { headers: { Origin: origin }, data: { token: code, name: 'second-owner', password, mode: 'individual' } })).status(), 401);
  assert.equal((await owner.request.post('/api/access/household', { headers: { Origin: origin }, data: { password } })).status(), 403);
  pass('Individual first-owner claim, single-use code and household exclusion');

  await ownerPage.goto('/watch-profiles');
  await ownerPage.getByRole('button', { name: english.createProfile, exact: true }).click();
  await ownerPage.locator('input[name="name"]').fill('Browser Anywhere');
  await ownerPage.locator('input[name="origins"]').fill('LJU, VIE, VCE, ZAG');
  await ownerPage.locator('input[name="adults"]').fill('2');
  await capture(ownerPage, 'profile-form');
  await ownerPage.getByRole('button', { name: english.save, exact: true }).click();
  await ownerPage.getByRole('heading', { name: 'Browser Anywhere', exact: true }).waitFor();
  console.log('CHECK saved profile API');
  const profile = (await json(await owner.request.get('/api/traveller/profiles'))).profiles[0];
  assert.deepEqual(profile.constraints.origins, ['LJU', 'VIE', 'VCE', 'ZAG']);
  assert.equal(profile.constraints.destination.kind, 'anywhere');
  assert.equal(profile.constraints.dates.days, 365);
  assert.equal(profile.constraints.cabin, 'business');
  pass('Watch Profile form saves broad 12-month Business search and whole party');

  console.log('CHECK preferences navigation');
  await ownerPage.goto('/preferences');
  console.log('CHECK Gmail form');
  assert.equal(await ownerPage.locator('input[name="host"]').inputValue(), 'smtp.gmail.com');
  assert.equal(await ownerPage.locator('input[name="port"]').inputValue(), '587');
  assert.equal(await ownerPage.locator('input[name="secure"]').isChecked(), false);
  await ownerPage.locator('input[name="label"]').fill('Private test email');
  await ownerPage.locator('input[name="user"]').fill('traveller-browser@example.com');
  await ownerPage.locator('input[name="pass"]').fill('test-only-app-password');
  console.log('CHECK Gmail save');
  const added = ownerPage.waitForResponse(response => response.url().endsWith('/api/traveller/channels') && response.request().method() === 'POST');
  await ownerPage.getByRole('button', { name: english.addChannel, exact: true }).click({ noWaitAfter: true });
  console.log('CHECK Gmail submitted');
  assert.equal((await added).status(), 201);
  await ownerPage.getByRole('heading', { name: 'Private test email', exact: true }).waitFor();
  const channel = (await json(await owner.request.get('/api/traveller/channels'))).channels.find(value => value.label === 'Private test email');
  assert.ok(channel, 'The saved private channel must appear in the UI and private API');
  console.log('CHECK Gmail saved');
  assert.equal(channel.config.from, 'traveller-browser@example.com');
  assert.equal(channel.config.to, channel.config.from);
  assert.equal(channel.config.pass, undefined);
  assert.equal(channel.config.passSet, true);
  const stored = (await db.query('SELECT config FROM "NotificationChannel" WHERE id=$1', [channel.id])).rows[0].config;
  assert.notEqual(stored.pass, 'test-only-app-password');
  const testSend = ownerPage.waitForResponse(response => response.url().endsWith(`/channels/${channel.id}/test`) && response.request().method() === 'POST');
  await ownerPage.getByRole('button', { name: english.channelTest, exact: true }).click();
  assert.equal((await testSend).status(), 503, 'The Redis-disabled fixture must fail closed without sending email');
  await ownerPage.getByRole('alert').filter({ hasText: english.channelTestUnavailable }).waitFor();
  pass('Private Gmail defaults, self-addressing, encrypted storage and API secret redaction; no email sent');

  const invitation = await json(await owner.request.post('/api/admin/access-invitation', { headers: { Origin: origin }, data: {} }));
  const invite = new URL(invitation.url);
  const member = await newContext();
  await json(await member.request.post('/api/access/redeem-invitation', { headers: { Origin: origin }, data: { code: new URLSearchParams(invite.hash.slice(1)).get('invite'), enrollment: { name: memberName, password } } }));
  assert.equal((await member.request.get(`/api/traveller/profiles/${profile.id}`)).status(), 404);
  assert.equal((await member.request.get('/api/traveller/admin')).status(), 403);
  assert.equal((await member.request.post(`/api/traveller/channels/${channel.id}/test`, { headers: { Origin: origin } })).status(), 404);
  assert.deepEqual((await json(await member.request.get('/api/traveller/profiles'))).profiles, []);
  assert.deepEqual((await json(await member.request.get('/api/traveller/channels'))).channels, []);
  const memberProfile = (await json(await member.request.post('/api/traveller/profiles', { headers: { Origin: origin }, data: { ...profile.constraints, name: 'Member private profile' } }), 201)).profile;
  assert.equal((await owner.request.get(`/api/traveller/profiles/${memberProfile.id}`)).status(), 404);
  assert.equal((await owner.request.post('/api/traveller/profiles', { headers: { Origin: 'https://attacker.example' }, data: profile.constraints })).status(), 403);
  pass('Member and administrator cannot read each other’s profiles/channels; admin and CSRF boundaries hold');

  await ownerPage.getByLabel('Language / Jezik').selectOption('sl');
  await ownerPage.getByRole('heading', { name: slovenian.settings, exact: true }).waitFor();
  assert.equal((await json(await owner.request.get('/api/account/settings'))).locale, 'sl');
  pass('Slovenian language selection persists to the individual account');
  const routes = [['dashboard', 'welcome'], ['discover', 'discover'], ['trips', 'trips'], ['surprise', 'surprise'], ['watch-profiles', 'profiles'], ['preferences', 'settings'], ['alerts', 'alerts'], ['history', 'history'], ['operations', 'operations']].map(([route, key]) => [route, slovenian[key]]);
  routes.push(['flights', 'Traveller'], ['hotels', hotelCopy.headline], ['cars', carCopy.carsTitle]);
  for (const [route, title] of routes) {
    const response = await ownerPage.goto('/' + route);
    assert.equal(response.status(), 200);
    await ownerPage.getByRole('heading', { name: title, exact: true }).waitFor();
    if (route === 'flights') assert.ok(await ownerPage.evaluate(() => scrollY <= 1), 'Flight search must retain the initial header and navigation');
    if (route === 'operations') {
      await ownerPage.getByRole('heading', { name: 'Google Flights Explore', exact: true }).waitFor();
      const source = ownerPage.locator('form').filter({ has: ownerPage.getByRole('heading', { name: 'Google Flights Explore', exact: true }) });
      assert.equal(await source.locator('input[name="budget"]').isVisible(), false);
      await source.getByText(slovenian.sourceSettings, { exact: true }).click();
      assert.equal(await source.locator('input[name="budget"]').isEnabled(), true);
      assert.equal(await source.locator('input[name="budget"]').isVisible(), true);
      const activity = await json(await owner.request.get('/api/traveller/admin'));
      assert.equal(activity.settings.discoveryMinutes, 180);
      assert.equal(activity.automaticChecksEnabled, false);
      assert.ok(activity.profiles.some(value => value.id === profile.id));
      await ownerPage.getByText(slovenian.activityRefreshNotice.replace('{timeZone}', 'Europe/Ljubljana'), { exact: true }).waitFor();
      await source.getByText(slovenian.sourceSettings, { exact: true }).click();
      await db.query(`UPDATE "TravellerSourceState" SET enabled=false, status='blocked', "lastError"='Fixture access challenge' WHERE source='google_explore'`);
      const blockedRefresh = ownerPage.waitForResponse(response => response.url().endsWith('/api/traveller/admin'));
      await ownerPage.getByRole('button', { name: slovenian.refreshActivity, exact: true }).click();
      await blockedRefresh;
      await source.getByText('Fixture access challenge', { exact: true }).waitFor();
      assert.equal(await source.locator('input[name="enabled"]').isChecked(), false);
      const priorSource = activity.sources.find(value => value.source === 'google_explore');
      await db.query('UPDATE "TravellerSourceState" SET enabled=$1, status=$2, "lastError"=$3 WHERE source=$4', [priorSource.enabled, priorSource.status, priorSource.lastError, 'google_explore']);
      const restoredRefresh = ownerPage.waitForResponse(response => response.url().endsWith('/api/traveller/admin'));
      await ownerPage.getByRole('button', { name: slovenian.refreshActivity, exact: true }).click();
      await restoredRefresh;
      await source.getByText('Fixture access challenge', { exact: true }).waitFor({ state: 'hidden' });
      const recovery = ownerPage.getByRole('region', { name: recoveryCopy.title, exact: true });
      await recovery.getByRole('heading', { name: recoveryCopy.ready, exact: true }).waitFor();
      assert.equal(await recovery.getByRole('button', { name: recoveryCopy.reload, exact: true }).isEnabled(), true);
    }
    await capture(ownerPage, route);
  }
  pass('Twelve private Slovenian surfaces render without overflow at 390px and 1280px');
  await json(await member.request.post('/api/access/logout', { headers: { Origin: origin }, data: {} }));
  const memberPage = await member.newPage();
  await memberPage.goto('/access?next=%2Fdiscover');
  await memberPage.getByLabel(accessCopy.name, { exact: true }).fill(memberName);
  await memberPage.getByLabel(accessCopy.password, { exact: true }).fill(password);
  await memberPage.getByRole('button', { name: accessCopy.login, exact: true }).last().click();
  await memberPage.waitForURL('**/discover');
  await memberPage.goto('/watch-profiles');
  assert.equal(await memberPage.getByRole('heading', { name: 'Browser Anywhere', exact: true }).count(), 0);
  await memberPage.getByRole('heading', { name: 'Member private profile', exact: true }).waitFor();
  await capture(memberPage, 'member-private');
  assert.equal((await member.request.get('/api/traveller/profiles')).headers()['cache-control']?.includes('no-store'), true);
  await json(await member.request.post('/api/access/logout', { headers: { Origin: origin }, data: {} }));
  await memberPage.goto('/discover');
  await memberPage.waitForURL('**/access?**');
  assert.equal((await member.request.get('/api/traveller/profiles')).status(), 401);
  pass('Real individual password login, account isolation and logout revoke private access');
  assert.deepEqual(errors, [], 'No browser runtime exceptions');
  console.log(`TRAVELLER_BROWSER_PASS=${passed.length}`);
} catch (error) {
  console.error(error);
  for (const [index, context] of contexts.entries()) {
    for (const [number, page] of context.pages().entries()) {
      await writeFile(resolve(output, `failure-${index}-${number}.txt`), `${new URL(page.url()).pathname}\n${await page.locator('body').innerText({ timeout: 3000 }).catch(() => '')}`);
      await page.screenshot({ path: resolve(output, `failure-${index}-${number}.png`), timeout: 5000 }).catch(() => {});
    }
  }
  throw error;
} finally {
  await Promise.allSettled(contexts.map(context => context.close()));
  await browser?.close();
  server.kill('SIGTERM');
  await new Promise(accept => {
    if (server.exitCode !== null) return accept();
    const timer = setTimeout(() => server.kill('SIGKILL'), 10_000);
    server.once('exit', () => { clearTimeout(timer); accept(); });
  });
  log.end();
  await db.end();
}
