// Local Firebase-emulator regression for corrupted canvas geometry.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const baseURL = process.env.BORG_TEST_URL || 'http://127.0.0.1:5179';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname));
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({
	headless: true,
	executablePath: process.env.BROWSER_EXECUTABLE_PATH || (existsSync(chrome) ? chrome : undefined)
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
	if (
		message.type() === 'error' &&
		/NaN|Expected (length|number)|attribute (x|y|d):/.test(message.text())
	)
		errors.push(message.text());
});
await page.route('**/*', (route) =>
	['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)
		? route.continue()
		: route.abort()
);
await page.routeWebSocket(/wss:\/\/.*/, (socket) => socket.close());
const rest = 'http://127.0.0.1:8080/v1/projects/demo-borg/databases/(default)/documents';
const headers = { 'content-type': 'application/json', Authorization: 'Bearer owner' };
const str = (stringValue) => ({ stringValue });
const number = (doubleValue) => ({ doubleValue });
const map = (fields) => ({ mapValue: { fields } });
async function put(path, fields, mask = '') {
	const response = await fetch(`${rest}/${path}${mask}`, {
		method: 'PATCH',
		headers,
		body: JSON.stringify({ fields })
	});
	assert.ok(response.ok, await response.text());
}
async function read(path) {
	const response = await fetch(`${rest}/${path}`, { headers });
	assert.ok(response.ok);
	return (await response.json()).fields;
}
async function findProject(slug) {
	const response = await fetch(`${rest}:runQuery`, {
		method: 'POST',
		headers,
		body: JSON.stringify({
			structuredQuery: {
				from: [{ collectionId: 'projects' }],
				where: { fieldFilter: { field: { fieldPath: 'slug' }, op: 'EQUAL', value: str(slug) } },
				limit: 1
			}
		})
	});
	assert.ok(response.ok);
	return (await response.json())[0]?.document?.name.split('/').at(-1);
}
try {
	await page.goto(baseURL);
	await page.getByRole('button', { name: /Google/ }).waitFor();
	const email = `admin-geometry-${Date.now()}@example.test`;
	const signup = await fetch(
		'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email, password: 'EmulatorOnly123!', returnSecureToken: true })
		}
	);
	assert.ok(signup.ok);
	const { localId: userId } = await signup.json();
	const viewportMask = `?updateMask.fieldPaths=viewportPositions.%60${userId}%60`;
	await page.evaluate(
		async ({ email, authModule }) => {
			const { auth, app } = await import('/src/lib/firebase/config.ts');
			if (app.options.projectId !== 'demo-borg') throw new Error('Refusing non-emulator project');
			const { signInWithEmailAndPassword } = await import(/* @vite-ignore */ authModule);
			await signInWithEmailAndPassword(auth, email, 'EmulatorOnly123!');
		},
		{
			email,
			authModule: process.env.BORG_AUTH_MODULE || '/node_modules/.vite/deps/firebase_auth.js'
		}
	);
	await page.getByRole('button', { name: 'Projects', exact: true }).waitFor();
	const id = `geometry-${Date.now()}`;
	const slug = `slug-${id}`;
	const project = {
		title: str('Geometry test'),
		slug: str(slug),
		status: str('active'),
		createdAt: str(new Date().toISOString()),
		updatedAt: str(new Date().toISOString()),
		collaborators: { arrayValue: { values: [] } }
	};
	await put(`projects/${id}`, project);
	const overviewId = (await findProject('project-canvas')) || 'project-canvas';
	if (!(await findProject('project-canvas')))
		await put(`projects/${overviewId}`, { ...project, slug: str('project-canvas') });
	await put(`projects/${id}/nodes/link`, {
		type: str('universal'),
		templateType: str('link'),
		nodeData: map({ title: str('Geometry link'), url: str('https://example.com') }),
		position: map({ x: number(100), y: number(100) }),
		createdAt: str(new Date().toISOString()),
		updatedAt: str(new Date().toISOString())
	});
	const invalidViewports = [
		{ x: number('NaN'), y: number('NaN'), zoom: number(1) },
		{ x: number(0), y: number(0), zoom: number(0) },
		{ x: number(0), y: number(0), zoom: number('NaN') },
		{ x: str('broken'), y: number(0), zoom: number(1) },
		{ x: number(0), y: number(0), zoom: number(-1) }
	];
	for (const [path, url] of [
		[`projects/${overviewId}`, baseURL],
		[`projects/${id}`, `${baseURL}/project/${slug}`]
	]) {
		for (const viewport of invalidViewports) {
			await put(path, { viewportPositions: map({ [userId]: map(viewport) }) }, viewportMask);
			await page.goto(url);
			await page.locator('.svelte-flow__background pattern').waitFor({ state: 'attached' });
			await page.waitForTimeout(500);
			const invalid = await page
				.locator('.svelte-flow svg, .svelte-flow svg *')
				.evaluateAll((elements) =>
					elements.flatMap((el) =>
						[...el.attributes]
							.filter((attr) => /NaN|Infinity/.test(attr.value))
							.map((attr) => `${el.tagName} ${attr.name}=${attr.value}`)
					)
				);
			if (process.env.BORG_EXPECT_INVALID === '1') {
				assert.ok(invalid.length > 0);
				console.log('Reproduced:', invalid.slice(0, 5), errors.slice(0, 3));
				process.exitCode = 0;
				await browser.close();
				process.exit(0);
			}
			assert.deepEqual(invalid, [], `${path} rendered invalid SVG geometry`);
			assert.deepEqual(errors, []);
		}
		// Valid saved positions still restore exactly.
		await put(
			path,
			{
				viewportPositions: map({
					[userId]: map({ x: number(42), y: number(-30), zoom: number(0.8) })
				})
			},
			viewportMask
		);
		await page.goto(url);
		await page.waitForFunction(
			() =>
				document.querySelector('.svelte-flow__viewport')?.style.transform ===
				'translate(42px, -30px) scale(0.8)'
		);
		await page.getByRole('button', { name: 'Zoom In', exact: true }).click();
		await page.waitForTimeout(1000);
		const saved = (await read(path)).viewportPositions.mapValue.fields[userId].mapValue.fields;
		for (const key of ['x', 'y', 'zoom'])
			assert.ok(Number.isFinite(Number(saved[key].doubleValue ?? saved[key].integerValue)));
		assert.ok(Number(saved.zoom.doubleValue) > 0.8);
		// A malformed remote node must never poison minimap bounds or fit-to-view.
		const nodeId = `invalid-position-${id}`;
		const nodePath = `${url === baseURL ? 'projects/project-canvas' : path}/nodes/${nodeId}`;
		try {
			await put(nodePath, {
				type: str('universal'),
				templateType: str('link'),
				nodeData: map({ title: str('Position validation'), url: str('https://example.com') }),
				position: map({ x: number(300), y: number(300) }),
				updatedAt: str(new Date().toISOString())
			});
			const node = page.locator(`.svelte-flow__node[data-id="${nodeId}"]`);
			await node.waitFor({ state: 'attached' });
			await put(
				nodePath,
				{ position: map({ x: number('NaN'), y: number('Infinity') }) },
				'?updateMask.fieldPaths=position'
			);
			await node.waitFor({ state: 'detached' });
			assert.equal(
				(await read(nodePath)).position.mapValue.fields.x.doubleValue,
				'NaN',
				'Validation must not overwrite stored content'
			);
			await page.getByRole('button', { name: 'Fit View', exact: true }).click();
			await page.waitForTimeout(500);
			assert.deepEqual(errors, []);
		} finally {
			const removed = await fetch(`${rest}/${nodePath}`, { method: 'DELETE', headers });
			assert.ok(removed.ok);
		}
	}
	assert.deepEqual(errors, []);
	console.log(
		'Geometry: invalid saved viewports, valid restoration, zoom, persistence and malformed node positions passed on both canvases.'
	);
} catch (error) {
	console.error('SVG_ERRORS', errors.slice(0, 5));
	throw error;
} finally {
	await browser.close();
}
