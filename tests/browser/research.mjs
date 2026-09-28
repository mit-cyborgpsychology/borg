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

	// Exercise live duplicate handling without adding arbitrary papers to the real library.
	await library.getByRole('button', { name: 'Add paper', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Add paper' });
	const paperUrl = dialog.getByRole('textbox', { name: 'Paper URL' });
	await paperUrl.fill(papers[0].url);
	await dialog.getByRole('button', { name: 'Add paper', exact: true }).click();
	await dialog
		.getByText('This paper is already in References.', { exact: false })
		.waitFor({ timeout: 30000 });
	assert.equal(await list.locator(':scope > li').count(), papers.length);
	// Failed submissions keep the URL and allow a retry.
	const submissionFailure = (route) =>
		route.fulfill({
			status: 502,
			contentType: 'application/json',
			body: '{"message":"Unable to submit paper. Please try again."}'
		});
	await page.route('**/api/research/submissions', submissionFailure);
	await paperUrl.fill('https://example.com/new-paper');
	await dialog.getByRole('button', { name: 'Add paper', exact: true }).click();
	await dialog.getByRole('alert').waitFor();
	assert.equal(await paperUrl.inputValue(), 'https://example.com/new-paper');
	await page.unroute('**/api/research/submissions', submissionFailure);
	const mockId = 'f'.repeat(64);
	const job = {
		id: mockId,
		url: 'https://example.com/new-paper',
		status: 'queued',
		message: 'Paper queued…',
		title: '',
		updatedAt: new Date().toISOString()
	};
	const submitMock = (route) => {
		assert.deepEqual(route.request().postDataJSON(), { url: job.url });
		return route.fulfill({
			status: 202,
			contentType: 'application/json',
			body: JSON.stringify(job)
		});
	};
	const statusMock = (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				...job,
				status: 'saved',
				message: 'Paper saved. Its map point is being prepared.',
				title: 'Test paper'
			})
		});
	await page.route('**/api/research/submissions', submitMock);
	await page.route(`**/api/research/submissions/${mockId}`, statusMock);
	await dialog.getByRole('button', { name: 'Add paper', exact: true }).click();
	await dialog.getByText('Paper queued…', { exact: false }).waitFor();
	assert.equal(await dialog.getByRole('button', { name: 'Adding paper…' }).isDisabled(), true);
	await dialog
		.getByText('Paper saved. Its map point is being prepared.', { exact: false })
		.waitFor();
	await dialog.getByRole('button', { name: 'Close', exact: true }).click();
	await page.unroute('**/api/research/submissions', submitMock);
	await page.unroute(`**/api/research/submissions/${mockId}`, statusMock);
	const savedMap = await (await mapLoaded).json();
	const map = library.getByRole('region', { name: 'UMAP paper map' });
	await map.waitFor();
	const dots = map.getByRole('button', { name: /^Select paper:/ });
	assert.equal(await dots.count(), savedMap.points.length);
	const sidebar = library.getByRole('complementary', { name: 'References papers sidebar' });
	const mapBox = await map.boundingBox();
	const sideBox = await sidebar.boundingBox();
	assert.ok(mapBox.x + mapBox.width <= sideBox.x + 1, 'Map is left of paper sidebar');
	assert.ok(savedMap.topics.length >= 2 && savedMap.topics.length <= 5);
	assert.equal(
		savedMap.topics.reduce((sum, t) => sum + t.count, 0),
		savedMap.points.length
	);
	assert.ok(savedMap.topics.every((t) => t.labelSource === 'llm'));
	assert.equal(
		await map.getByRole('button', { name: /^Filter topic:/ }).count(),
		savedMap.topics.length
	);
	await page.screenshot({ path: '/tmp/borg-topics-overview.png' });
	const firstTopic = savedMap.topics[0];
	const topicLabel = map.getByRole('button', {
		name: `Filter topic: ${firstTopic.label}`,
		exact: true
	});
	await topicLabel.click();
	assert.equal(await list.locator(':scope > li').count(), firstTopic.count);
	assert.equal(
		await library.getByRole('combobox', { name: 'References topic' }).inputValue(),
		firstTopic.id
	);
	assert.equal(
		await map.locator('button[aria-label^="Select paper:"]:not(:disabled)').count(),
		firstTopic.count
	);
	await topicLabel.focus();
	await page.keyboard.press('Enter');
	assert.equal(await list.locator(':scope > li').count(), papers.length);
	await library
		.getByRole('combobox', { name: 'References topic' })
		.selectOption(savedMap.topics[1].id);
	assert.equal(await list.locator(':scope > li').count(), savedMap.topics[1].count);
	await library.getByRole('button', { name: 'Clear filters' }).click();
	const firstPaper = papers.find((p) => savedMap.points.some((point) => point.url === p.url));
	const row = list.getByRole('button', { name: `Show paper: ${firstPaper.title}`, exact: true });
	await row.click();
	const selectedDot = map.getByRole('button', {
		name: `Select paper: ${firstPaper.title}`,
		exact: true
	});
	assert.equal(await selectedDot.getAttribute('aria-pressed'), 'true');
	await sidebar.getByRole('region', { name: 'Selected paper details' }).waitFor();
	await sidebar.getByRole('button', { name: 'Close paper details' }).click();
	await selectedDot.focus();
	await page.keyboard.press('Enter');
	await sidebar.getByRole('region', { name: 'Selected paper details' }).waitFor();
	assert.equal(await row.getAttribute('aria-expanded'), 'true');
	const positions = await map
		.locator('.svelte-flow__node')
		.evaluateAll((nodes) => nodes.map((n) => n.style.transform));
	const search = library.getByRole('searchbox', { name: 'Search references' });
	await search.fill('Sensecape');
	await library.getByRole('heading', { name: /Sensecape/ }).waitFor();
	assert.equal(await list.locator(':scope > li').count(), 1);
	assert.equal(await dots.count(), savedMap.points.length);
	assert.deepEqual(
		await map
			.locator('.svelte-flow__node')
			.evaluateAll((nodes) => nodes.map((n) => n.style.transform)),
		positions
	);
	assert.equal(await map.locator('button[aria-label^="Select paper:"]:not(:disabled)').count(), 1);
	await search.fill('no-matching-research-xyz');
	await library.getByRole('heading', { name: 'No matching papers' }).waitFor();
	await library.getByRole('button', { name: 'Clear filters' }).click();
	await library.getByRole('combobox', { name: 'References source' }).selectOption('arxiv.org');
	const expected = papers.filter((p) => new URL(p.url).hostname === 'arxiv.org').length;
	assert.equal(await list.locator(':scope > li').count(), expected);
	await library.getByRole('combobox', { name: 'Sort references' }).selectOption('title');
	const titles = await list.getByRole('heading').allTextContents();
	assert.deepEqual(
		titles,
		[...titles].sort((a, b) => a.localeCompare(b))
	);
	await library.getByRole('button', { name: 'Clear filters' }).click();
	const broken = (route) =>
		route.fulfill({
			status: 502,
			contentType: 'application/json',
			body: JSON.stringify({ message: 'upstream failure' })
		});
	await page.route('**/api/research', broken);
	await library.getByRole('button', { name: 'Refresh references' }).click();
	await library.getByRole('alert').waitFor();
	assert.equal(
		await list.locator(':scope > li').count(),
		papers.length,
		'Failed refresh must retain papers'
	);
	await page.unroute('**/api/research', broken);
	await library.getByRole('button', { name: 'Try again' }).click();
	await library.getByRole('alert').waitFor({ state: 'hidden' });
	await library.getByRole('button', { name: 'Refresh references' }).waitFor();
	await page.waitForFunction(
		() => !document.querySelector('[aria-label="Refresh references"]')?.disabled
	);
	for (const anchor of await list.locator('a').all()) {
		assert.match(await anchor.getAttribute('href'), /^https?:\/\//);
		assert.equal(await anchor.getAttribute('target'), '_blank');
		assert.match(await anchor.getAttribute('rel'), /noopener/);
	}

	const mapBroken = (route) =>
		route.fulfill({
			status: 502,
			contentType: 'application/json',
			body: '{"message":"unavailable"}'
		});
	await page.route('**/api/research/map', mapBroken);
	await library.getByRole('button', { name: 'Refresh references' }).click();
	await library.getByRole('button', { name: 'Retry map' }).waitFor();
	assert.equal(await list.locator(':scope > li').count(), papers.length);
	assert.equal(await dots.count(), savedMap.points.length);
	await page.unroute('**/api/research/map', mapBroken);
	await library.getByRole('button', { name: 'Retry map' }).click();
	await library.getByRole('button', { name: 'Retry map' }).waitFor({ state: 'hidden' });
	await list.getByRole('button', { name: `Show paper: ${firstPaper.title}`, exact: true }).click();
	await page.screenshot({ path: '/tmp/borg-research-desktop.png', fullPage: true });
	await page.setViewportSize({ width: 390, height: 844 });
	await page.waitForFunction(
		() => {
			const map = document.querySelector('[aria-label="UMAP paper map"]');
			if (!map) return false;
			const bounds = map.getBoundingClientRect();
			return [...map.querySelectorAll('.svelte-flow__node')].every((node) => {
				const rect = node.getBoundingClientRect();
				return (
					rect.left >= bounds.left &&
					rect.right <= bounds.right &&
					rect.top >= bounds.top &&
					rect.bottom <= bounds.bottom
				);
			});
		},
		null,
		{ timeout: 5000 }
	);
	await search.fill('Sensecape');
	await library.getByRole('heading', { name: /Sensecape/ }).waitFor();
	assert.ok(
		await library.evaluate((el) => el.scrollWidth <= el.clientWidth),
		'References must fit mobile viewport'
	);
	await page.screenshot({ path: '/tmp/borg-research-mobile.png', fullPage: true });
	const empty = (route) =>
		route.fulfill({ status: 200, contentType: 'application/json', body: '{"papers":[]}' });
	await page.route('**/api/research', empty);
	await library.getByRole('button', { name: 'Refresh references' }).click();
	await library.getByRole('heading', { name: 'No references yet' }).waitFor();
	await page.unroute('**/api/research', empty);
	assert.deepEqual(errors, []);
	console.log(
		`References browser checks passed: ${papers.length} live papers, web submission/duplicate/retry, topic labels/filtering, and Python UMAP coordinates, map/sidebar selection, stable filtering, auth/approval, search, source filter, sorting, refresh/retry, links, empty state, mobile layout.`
	);
} catch (error) {
	await page.screenshot({ path: '/tmp/borg-paper-submission-failure.png' });
	console.error(
		await page
			.getByRole('dialog', { name: 'Add paper' })
			.textContent()
			.catch(() => '')
	);
	throw error;
} finally {
	await browser.close();
}
