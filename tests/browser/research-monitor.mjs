import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const baseURL = process.env.BORG_TEST_URL || 'http://127.0.0.1:5181';
if (!['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname))
	throw new Error('Use a local server');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({
	headless: true,
	executablePath: process.env.BROWSER_EXECUTABLE_PATH || (existsSync(chrome) ? chrome : undefined)
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.route('**/*', (route) =>
	['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)
		? route.continue()
		: route.abort()
);
await page.routeWebSocket(/wss:\/\/.*/, (socket) => socket.close());
try {
	assert.equal((await page.request.get(`${baseURL}/api/research`)).status(), 401);
	assert.equal((await page.request.get(`${baseURL}/api/research/map`)).status(), 401);
	assert.equal(
		(
			await page.request.get(`${baseURL}/api/research`, {
				headers: { Authorization: 'Bearer invalid' }
			})
		).status(),
		401
	);
	const signup = async (email) => {
		const response = await fetch(
			'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, password: 'EmulatorOnly123!', returnSecureToken: true })
			}
		);
		assert.equal(response.status, 200);
		return response.json();
	};
	// An authenticated account with no approved profile must not read Grist.
	const pending = await signup(`research-pending-${Date.now()}@example.test`);
	assert.equal(
		(
			await page.request.get(`${baseURL}/api/research`, {
				headers: { Authorization: `Bearer ${pending.idToken}` }
			})
		).status(),
		403
	);
	assert.equal(
		(
			await page.request.get(`${baseURL}/api/research/map`, {
				headers: { Authorization: `Bearer ${pending.idToken}` }
			})
		).status(),
		403
	);
	assert.equal(
		(
			await page.request.post(`${baseURL}/api/research/submissions`, {
				data: { url: 'https://example.com/paper' }
			})
		).status(),
		401
	);
	assert.equal(
		(
			await page.request.post(`${baseURL}/api/research/submissions`, {
				headers: { Authorization: `Bearer ${pending.idToken}` },
				data: { url: 'https://example.com/paper' }
			})
		).status(),
		403
	);
	await page.goto(baseURL);
	await page.getByRole('button', { name: /Google/ }).waitFor();
	const email = `admin-research-${Date.now()}@example.test`;
	await signup(email);
	await page.evaluate(async (email) => {
		const { auth, app } = await import('/src/lib/firebase/config.ts');
		if (app.options.projectId !== 'demo-borg') throw new Error('Refusing non-emulator project');
		const { signInWithEmailAndPassword } = await import(
			'/node_modules/.vite/deps/firebase_auth.js'
		);
		await signInWithEmailAndPassword(auth, email, 'EmulatorOnly123!');
	}, email);
	await page.getByRole('button', { name: 'References', exact: true }).waitFor();
	const loaded = page.waitForResponse(
		(response) => response.url().endsWith('/api/research') && response.status() === 200
	);
	const mapLoaded = page.waitForResponse(
		(response) => response.url().endsWith('/api/research/map') && response.status() === 200
	);
	await page.getByRole('button', { name: 'References', exact: true }).click();
	const { papers } = await (await loaded).json();
	assert.ok(papers.length > 0, 'Live Grist should contain papers');
	const library = page.getByRole('region', { name: 'References library' });
	const list = library.getByRole('list', { name: 'References papers' });
	await list.locator(':scope > li').first().waitFor();
	assert.equal(await list.locator(':scope > li').count(), papers.length);
	assert.ok(papers.every((p) => !('fields' in p) && !('apiKey' in p)));

	assert.equal((await page.request.get(`${baseURL}/api/research/status`)).status(), 401);
	assert.equal(
		(
			await page.request.get(`${baseURL}/api/research/status`, {
				headers: { Authorization: `Bearer ${pending.idToken}` }
			})
		).status(),
		403
	);
	const statusLoaded = page.waitForResponse(
		(r) => r.url().endsWith('/api/research/status') && r.status() === 200
	);
	await library.getByRole('button', { name: 'Status', exact: true }).click();
	const report = await (await statusLoaded).json();
	assert.equal(report.checks.length, 6);
	assert.ok(
		report.checks.every((c) => c.status === 'ok'),
		JSON.stringify(report.checks)
	);
	const monitor = page.getByRole('region', { name: 'References status monitor' });
	await monitor.getByText('No web submissions yet.').waitFor();
	await page.screenshot({ path: '/tmp/borg-monitor-desktop.png' });
	await page.route('**/api/research/status', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				...report,
				checks: report.checks.map((c) =>
					c.id === 'map' ? { ...c, status: 'error', message: 'Map check failed.' } : c
				),
				submissions: [
					{
						id: 'a'.repeat(64),
						url: 'https://example.test/paper',
						title: 'Example submitted paper',
						status: 'failed',
						message: 'Could not save this paper. Please try again.',
						updatedAt: new Date().toISOString()
					}
				]
			})
		})
	);
	await monitor.getByRole('button', { name: 'Check now' }).click();
	await monitor.getByText('Map check failed.').waitFor();
	await monitor.getByText('Example submitted paper').waitFor();
	await page.route('**/api/research/status', (route) =>
		route.fulfill({ status: 502, body: 'Unavailable' })
	);
	await monitor.getByRole('button', { name: 'Check now' }).click();
	await monitor.getByRole('alert').waitFor();
	await page.setViewportSize({ width: 390, height: 844 });
	await page.screenshot({ path: '/tmp/borg-monitor-mobile.png' });
	assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
	await library.getByRole('button', { name: 'Status', exact: true }).click();
	assert.equal(await monitor.count(), 0);
	assert.deepEqual(errors, []);
	console.log(
		'Monitor browser checks passed: live services, auth, partial failure, history, retry error, mobile layout, close.'
	);
} finally {
	await browser.close();
}
