import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath =
	process.env.BROWSER_EXECUTABLE_PATH || (existsSync(chrome) ? chrome : undefined);
const baseURL = process.env.BORG_TEST_URL || 'http://127.0.0.1:5179';
if (!['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname))
	throw new Error('Smoke tests require a local server');
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.route('**/*', (route) => {
	const url = new URL(route.request().url());
	return ['localhost', '127.0.0.1'].includes(url.hostname) ? route.continue() : route.abort();
});
await page.routeWebSocket(/wss:\/\/.*/, (ws) => ws.close());
async function checkLinkNode(canvasName) {
	await page.locator('.svelte-flow__node').first().waitFor();
	await page.waitForTimeout(1000);
	const before = await page
		.locator('.svelte-flow__node')
		.evaluateAll((nodes) => nodes.map((node) => node.dataset.id));
	await page.getByRole('button', { name: 'Create Link node', exact: true }).click();
	await page.waitForFunction(
		(ids) =>
			[...document.querySelectorAll('.svelte-flow__node')].some(
				(node) => !ids.includes(node.dataset.id)
			),
		before
	);
	const id = await page
		.locator('.svelte-flow__node')
		.evaluateAll(
			(nodes, ids) => nodes.find((node) => !ids.includes(node.dataset.id)).dataset.id,
			before
		);
	const node = page.locator(`.svelte-flow__node[data-id="${id}"]`);
	await node.getByText('Link', { exact: true }).click();
	const sidebar = page.getByRole('complementary');
	await sidebar.getByLabel('URL', { exact: true }).fill('https://github.com/example/repository');
	const title = `Unified Link ${canvasName} ${Date.now()}`;
	await sidebar.getByLabel('Title', { exact: true }).fill(title);
	await node.getByText('Code', { exact: true }).waitFor();
	await node.getByRole('button', { name: 'Open github.com', exact: true }).waitFor();
	await sidebar.getByRole('button', { name: 'Iframe', exact: true }).click();
	await node.locator('iframe').waitFor();
	if (
		(await node.locator('iframe').getAttribute('src')) !== 'https://github.com/example/repository'
	)
		throw new Error('wrong iframe URL');
	await sidebar.getByRole('button', { name: 'Node', exact: true }).click();
	await node.getByText('Code', { exact: true }).waitFor();
	await page.reload();
	await node.getByText(title, { exact: true }).waitFor();
	if (await node.locator('iframe').count()) throw new Error('view mode did not persist');
	console.log(`${canvasName}: link detection, both views, and reload persistence passed`);
}

async function checkLegacyLinks() {
	const prefix = `legacy-link-${Date.now()}`;
	const fixtures = [
		[
			'paper',
			{
				title: `${prefix} paper`,
				arxiv: 'https://arxiv.org/abs/1234.5678',
				overleaf: 'https://overleaf.com/project/123',
				publicationStatus: 'Published'
			}
		],
		['code', { title: `${prefix} code`, github: 'https://github.com/example/legacy' }],
		['iframe', { title: `${prefix} iframe`, url: 'https://example.com', width: 620, height: 360 }]
	];
	const firestoreValue = (value) =>
		typeof value === 'number'
			? { integerValue: String(value) }
			: typeof value === 'string'
				? { stringValue: value }
				: {
						mapValue: {
							fields: Object.fromEntries(
								Object.entries(value).map(([key, item]) => [key, firestoreValue(item)])
							)
						}
					};
	for (const [type, nodeData] of fixtures) {
		const docURL = `http://127.0.0.1:8080/v1/projects/demo-borg/databases/(default)/documents/projects/project-canvas/nodes/${prefix}-${type}`;
		const record = {
			type: 'universal',
			templateType: type,
			nodeData,
			position: { x: 400, y: 300 },
			updatedAt: new Date().toISOString(),
			createdAt: new Date().toISOString()
		};
		const response = await fetch(docURL, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json', Authorization: 'Bearer owner' },
			body: JSON.stringify(firestoreValue(record).mapValue)
		});
		if (!response.ok) throw new Error(await response.text());
		const node = page.locator(`.svelte-flow__node[data-id="${prefix}-${type}"]`);
		if (type === 'iframe') {
			await node.locator('iframe').waitFor();
			const width = await node.locator('.iframe-node').evaluate((element) => element.style.width);
			if (width !== '620px') throw new Error('legacy embed lost its dimensions');
		} else {
			await node.getByText(nodeData.title, { exact: true }).waitFor();
			await node.getByText(type === 'paper' ? 'Paper' : 'Code', { exact: true }).waitFor();
		}
		if (type === 'paper') {
			await node.getByText('Paper', { exact: true }).evaluate((element) => element.click());
			const sidebar = page.getByRole('complementary');
			if ((await sidebar.getByLabel('URL', { exact: true }).inputValue()) !== nodeData.arxiv)
				throw new Error('legacy URL was not inferred');
			await sidebar.getByLabel('URL', { exact: true }).fill('https://github.com/example/converted');
			await node.getByText('Code', { exact: true }).waitFor();
			const stored = await (
				await fetch(docURL, { headers: { Authorization: 'Bearer owner' } })
			).json();
			if (
				stored.fields.templateType.stringValue !== 'link' ||
				stored.fields.nodeData.mapValue.fields.publicationStatus.stringValue !== 'Published'
			)
				throw new Error('legacy conversion lost metadata');
			await sidebar.getByRole('button', { name: 'Close inspector', exact: true }).click();
		}
	}
	console.log('legacy paper/code/iframe rendering and lossless conversion passed');
}

try {
	await page.goto(baseURL);
	await page.getByRole('button', { name: /Google/ }).waitFor();
	const email = `admin-refactor-${Date.now()}@example.test`;
	const response = await fetch(
		'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email, password: 'EmulatorOnly123!', returnSecureToken: true })
		}
	);
	if (!response.ok) throw new Error(await response.text());
	const { localId: userId } = await response.json();
	await page.evaluate(
		async ({ email }) => {
			const { auth, app } = await import('/src/lib/firebase/config.ts');
			if (app.options.projectId !== 'demo-borg') throw new Error('Refusing non-emulator project');
			const { signInWithEmailAndPassword } = await import(
				'/node_modules/.vite/deps/firebase_auth.js'
			);
			await signInWithEmailAndPassword(auth, email, 'EmulatorOnly123!');
		},
		{ email }
	);
	await page.getByRole('button', { name: 'Projects', exact: true }).waitFor();
	await checkLinkNode('overview');
	await checkLegacyLinks();

	await page
		.locator('.svelte-flow__pane')
		.first()
		.evaluate((pane) => {
			pane.dispatchEvent(
				new MouseEvent('contextmenu', { clientX: 500, clientY: 300, button: 2, bubbles: true })
			);
		});
	await page.getByRole('menuitem', { name: 'New Project', exact: true }).click();
	await page.getByRole('menu', { name: 'Create node' }).waitFor({ state: 'hidden' });
	const title = `Refactor Smoke ${Date.now()}`;
	await page.getByLabel('Project Name').fill(title);
	const setRole = async (role) => {
		const res = await fetch(
			`http://127.0.0.1:8080/v1/projects/demo-borg/databases/(default)/documents/users/${userId}?updateMask.fieldPaths=userType`,
			{
				method: 'PATCH',
				headers: { 'content-type': 'application/json', Authorization: 'Bearer owner' },
				body: JSON.stringify({ fields: { userType: { stringValue: role } } })
			}
		);
		if (!res.ok) throw new Error(await res.text());
	};
	await setRole('collaborator');
	await page.getByRole('button', { name: 'Create Project', exact: true }).click();
	await page.locator('form').getByRole('alert').waitFor();
	if ((await page.getByLabel('Project Name').inputValue()) !== title)
		throw new Error('failed save lost form data');
	await setRole('member');
	await page.getByRole('button', { name: 'Create Project', exact: true }).click();
	console.log('permission failure preserved form; retry submitted');
	await page.getByRole('heading', { name: 'Create New Project' }).waitFor({ state: 'hidden' });
	console.log('project creation passed');
	for (const tab of ['People', 'Tasks', 'Personal', 'Timeline']) {
		await page.getByRole('button', { name: tab, exact: true }).click();
		await page.waitForTimeout(500);
		if (await page.getByRole('alert').count())
			throw new Error(tab + ': ' + (await page.getByRole('alert').allTextContents()));
		console.log(tab + ' passed');
	}
	await page.getByRole('button', { name: 'Projects', exact: true }).click();
	await page.getByRole('button', { name: 'List', exact: true }).click();
	await page.getByText(title, { exact: true }).click();
	await page.waitForURL('**/project/**');
	await page.getByRole('button', { name: 'Create Post-It node', exact: true }).waitFor();
	await page.locator('.svelte-flow__node').first().waitFor();
	await page.getByRole('button', { name: 'Create Post-It node', exact: true }).click();
	await page.waitForTimeout(1000);
	console.log('canvas nodes', await page.locator('.svelte-flow__node').count());
	if ((await page.locator('.svelte-flow__node').count()) < 2)
		throw new Error('node creation failed');
	console.log('project canvas and node creation passed');
	await page.reload();
	await page.locator('.svelte-flow__node').nth(1).waitFor();
	console.log('node persistence after reload passed');
	await checkLinkNode('project');
	if (errors.length) throw new Error(errors.join('\n'));
	console.log('PAGE_ERRORS', errors);
} catch (error) {
	console.log('BODY', await page.locator('body').innerText());
	console.log('ERRORS', errors);
	throw error;
} finally {
	await browser.close();
}
