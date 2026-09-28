import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { chromium } from 'playwright';
const depsURL = process.env.BORG_VITE_DEPS || '/node_modules/.vite/deps';
const baseURL = process.env.BORG_TEST_URL || 'http://127.0.0.1:5182';
if (!['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname))
	throw new Error('Use local emulator server');
const env = parseEnv(readFileSync('.env', 'utf8'));
const browser = await chromium.launch({
	headless: true,
	executablePath: existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
		? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
		: undefined
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const id = 'outline-browser-' + Date.now();
const email = 'admin-' + id + '@example.test';
const db = 'http://127.0.0.1:8080/v1/projects/demo-borg/databases/(default)/documents/';
let collectionId;
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route('https://wiki.cyborglab.org/**', (route) =>
	route.fulfill({
		status: 200,
		contentType: 'text/html',
		body: '<h1>Outline editor fixture</h1><textarea aria-label="Document text">Independent document content</textarea>'
	})
);
await page.routeWebSocket(/wss:\/\/.*/, (socket) => socket.close());
try {
	const signup = await fetch(
		'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email, password: 'EmulatorOnly123!', returnSecureToken: true })
		}
	);
	assert.equal(signup.status, 200);
	await page.goto(baseURL);
	await page.getByRole('button', { name: /Google/ }).waitFor();
	await page.evaluate(
		async ({ email, id, depsURL }) => {
			const { auth, app } = await import('/src/lib/firebase/config.ts');
			if (app.options.projectId !== 'demo-borg') throw new Error('Refusing production writes');
			const { signInWithEmailAndPassword } = await import(`${depsURL}/firebase_auth.js`);
			await signInWithEmailAndPassword(auth, email, 'EmulatorOnly123!');
		},
		{ email, id, depsURL }
	);
	await page.getByRole('button', { name: 'References', exact: true }).waitFor();

	const value = (v) =>
		typeof v === 'number'
			? { doubleValue: v }
			: typeof v === 'object'
				? {
						mapValue: {
							fields: Object.fromEntries(Object.entries(v).map(([k, v]) => [k, value(v)]))
						}
					}
				: { stringValue: v };
	const put = async (path, data) => {
		const fields = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, value(v)]));
		fields.createdAt = { timestampValue: new Date().toISOString() };
		fields.updatedAt = { timestampValue: new Date().toISOString() };
		const response = await fetch(db + path, {
			method: 'PATCH',
			headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
			body: JSON.stringify({ fields })
		});
		assert.equal(response.status, 200);
	};
	await put('projects/' + id, {
		slug: id,
		title: 'Borg Outline browser check (temporary)',
		status: 'active'
	});
	for (const [nodeId, x] of [
		['a', 100],
		['b', 420]
	])
		await put('projects/' + id + '/nodes/' + nodeId, {
			templateType: 'outline',
			type: 'universal',
			nodeData: { title: 'Temporary note ' + nodeId },
			position: { x, y: 100 }
		});

	const unauthed = await page.request.post(baseURL + '/api/outline/docs', {
		data: { action: 'create', projectId: id, nodeId: 'a' }
	});
	assert.equal(unauthed.status(), 401);
	await page.goto(baseURL + '/project/' + id);
	const a = page.locator('.svelte-flow__node[data-id="a"]');
	await a.getByRole('button', { name: 'Create note', exact: true }).waitFor();
	const before = await (
		await fetch(db + 'projects/' + id, { headers: { Authorization: 'Bearer owner' } })
	).json();
	assert.equal(before.fields.outlineCollectionId, undefined);
	const created = page.waitForResponse(
		(r) => r.url().endsWith('/api/outline/docs') && r.request().postDataJSON()?.action === 'create'
	);
	await a.getByRole('button', { name: 'Create note', exact: true }).click();
	const response = await created;
	const document = await response.json();
	assert.equal(response.status(), 200, JSON.stringify(document));
	const project = await (
		await fetch(db + 'projects/' + id, { headers: { Authorization: 'Bearer owner' } })
	).json();
	collectionId = project.fields.outlineCollectionId.stringValue;
	const dialog = page.getByRole('dialog', { name: 'Outline document editor' });
	await dialog.waitFor();
	await dialog
		.frameLocator('iframe')
		.getByRole('heading', { name: 'Outline editor fixture' })
		.waitFor();
	await page.screenshot({ path: '/tmp/borg-outline-editor.png' });
	await dialog.getByRole('button', { name: 'Close document editor' }).click();
	const b = page.locator('.svelte-flow__node[data-id="b"]');
	await b.getByRole('button', { name: 'Link existing note' }).click();
	await b.getByRole('button', { name: document.title, exact: true }).click();
	await dialog.waitFor();
	await dialog.getByRole('button', { name: 'Close document editor' }).click();
	await page.reload();
	await a.getByRole('button', { name: 'Open note', exact: true }).waitFor();
	await b.getByRole('button', { name: 'Open note', exact: true }).waitFor();
	assert.deepEqual(errors, []);
	console.log(
		'Outline browser passed: lazy collection, live document creation, iframe panel, existing-document link, reload persistence, auth.'
	);
} catch (error) {
	console.log({
		pageErrors: errors,
		body: (await page.locator('body').innerText()).slice(0, 1500)
	});
	await page.screenshot({ path: '/tmp/borg-outline-browser-failure.png' });
	throw error;
} finally {
	if (!collectionId) {
		const p = await (
			await fetch(db + 'projects/' + id, { headers: { Authorization: 'Bearer owner' } })
		).json();
		collectionId = p.fields?.outlineCollectionId?.stringValue;
	}
	if (collectionId) {
		const r = await fetch(
			env.OUTLINE_API_URL.replace(/\/api\/?$/, '') + '/api/collections.delete',
			{
				method: 'POST',
				headers: {
					Authorization: 'Bearer ' + env.OUTLINE_API_TOKEN,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ id: collectionId })
			}
		);
		assert.equal(r.status, 200, 'Temporary Outline collection cleanup');
	}
	for (const path of [
		'projects/' + id + '/nodes/a',
		'projects/' + id + '/nodes/b',
		'projects/' + id
	])
		await fetch(db + path, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
	await browser.close();
}
