import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath =
	process.env.BROWSER_EXECUTABLE_PATH || (existsSync(chrome) ? chrome : undefined);
const baseURL = process.env.BORG_TEST_URL || 'http://127.0.0.1:5179';
if (!['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname))
	throw new Error('Smoke tests require a local server');
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ locale: 'en-US', timezoneId: 'America/New_York' });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.route('**/*', (route) => {
	const url = new URL(route.request().url());
	return ['localhost', '127.0.0.1'].includes(url.hostname) ? route.continue() : route.abort();
});
await page.routeWebSocket(/wss:\/\/.*/, (ws) => ws.close());

async function checkNodeDetails(sidebar, node) {
	const details = sidebar.getByRole('region', { name: 'Details', exact: true });
	const addDetail = async (name, value) => {
		await details.getByRole('button', { name: 'Add detail', exact: true }).click();
		const form = details.getByRole('form', { name: 'Add detail', exact: true });
		await form.getByLabel('Detail name').fill(name);
		await form.getByLabel('Detail value').fill(value);
		await form.getByRole('button', { name: 'Add', exact: true }).click();
	};
	await addDetail('Venue', 'Media Lab');
	await node.getByText('Media Lab', { exact: true }).waitFor();
	const venue = details.getByRole('group', { name: 'Venue', exact: true }).getByRole('textbox');
	await venue.fill('Room 401');
	await node.getByText('Room 401', { exact: true }).waitFor();
	await details.getByRole('button', { name: 'Hide Venue on canvas', exact: true }).click();
	await node.getByText('Room 401', { exact: true }).waitFor({ state: 'hidden' });
	if ((await venue.inputValue()) !== 'Room 401') throw new Error('hiding a detail lost its value');
	await details.getByRole('button', { name: 'Show Venue on canvas', exact: true }).click();
	await node.getByText('Room 401', { exact: true }).waitFor();
	await venue.fill('');
	await node.getByText('Venue', { exact: true }).waitFor({ state: 'hidden' });
	await venue.fill('Room 401');
	await node.getByText('Room 401', { exact: true }).waitFor();
	await details.getByRole('button', { name: 'Remove Venue', exact: true }).click();
	await node.getByText('Room 401', { exact: true }).waitFor({ state: 'hidden' });
	await details.getByRole('button', { name: 'Undo', exact: true }).click();
	await node.getByText('Room 401', { exact: true }).waitFor();
	await addDetail('Reference', 'arxiv.org/abs/1234.5678');
	await node.getByRole('button', { name: 'Open arXiv', exact: true }).waitFor();
	const reference = details
		.getByRole('group', { name: 'Reference', exact: true })
		.getByRole('textbox');
	if ((await reference.inputValue()) !== 'https://arxiv.org/abs/1234.5678')
		throw new Error('detail URL was not normalized');
	await addDetail('Deadline', '2028-02-29');
	await details
		.getByRole('group', { name: 'Deadline', exact: true })
		.locator('input[type="date"]')
		.waitFor();
	await node.getByText('2/29/2028', { exact: true }).waitFor();
	await addDetail(' venue ', 'Duplicate');
	await details.getByRole('alert').getByText('That name is already in use.').waitFor();
	await details.getByLabel('Detail name').press('Escape');
	await details.getByRole('form').waitFor({ state: 'hidden' });
	if (
		(await sidebar.getByRole('button', { name: 'Hide Venue on canvas', exact: true }).count()) !== 1
	)
		throw new Error('detail visibility controls are duplicated');
	if (await sidebar.getByRole('region', { name: 'Custom properties', exact: true }).count())
		throw new Error('old custom property section remains');
	console.log(
		'details: creation, editing, empty values, visibility, removal/undo, URL detection and duplicate validation passed'
	);
}

async function checkLinkNode(canvasName, source = 'toolbar') {
	await page.locator('.svelte-flow__node').first().waitFor();
	await page.waitForTimeout(1000);
	const before = await page
		.locator('.svelte-flow__node')
		.evaluateAll((nodes) => nodes.map((node) => node.dataset.id));
	if (canvasName === 'project' && source === 'menu') {
		await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
	}
	if (source === 'menu') {
		await page
			.locator('.svelte-flow__pane')
			.first()
			.evaluate((pane) => {
				pane.dispatchEvent(
					new MouseEvent('contextmenu', { clientX: 500, clientY: 300, button: 2, bubbles: true })
				);
			});
		await page.getByRole('menuitem', { name: 'Link', exact: true }).click();
	} else {
		await page.getByRole('button', { name: 'Create Link node', exact: true }).click();
	}
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
	const sidebar = page.getByRole('complementary');
	await sidebar.getByLabel('URL', { exact: true }).waitFor();
	await page.waitForFunction(() => document.activeElement?.id === 'url');
	if (await sidebar.getByRole('button', { name: 'Edit title', exact: true }).count())
		throw new Error('new link should start with the URL, not title editing');
	await sidebar.getByLabel('URL', { exact: true }).fill('github.com/example/repository');
	await sidebar.getByLabel('URL', { exact: true }).blur();
	await node.getByRole('button', { name: 'Open GitHub', exact: true }).waitFor();
	await node.getByText('GitHub', { exact: true }).waitFor();
	await sidebar.getByRole('button', { name: 'Edit title', exact: true }).click();
	if ((await sidebar.getByLabel('Title', { exact: true }).inputValue()) !== '')
		throw new Error('automatic title should remain an empty override');
	if ((await sidebar.getByLabel('Title', { exact: true }).getAttribute('placeholder')) !== 'GitHub')
		throw new Error('title placeholder did not follow service detection');
	const title = `Unified Link ${canvasName} ${source} ${Date.now()}`;
	await sidebar.getByLabel('Title', { exact: true }).fill(title);
	await sidebar.getByLabel('Title', { exact: true }).press('Enter');
	await sidebar.getByRole('heading', { name: title, exact: true }).waitFor();
	await sidebar.getByRole('button', { name: 'Edit title', exact: true }).click();
	await sidebar.getByLabel('Title', { exact: true }).fill('Discarded draft');
	await sidebar.getByLabel('Title', { exact: true }).press('Escape');
	await sidebar.getByLabel('URL', { exact: true }).fill('https://www.figma.com/design/123/Test');
	await node.getByRole('button', { name: 'Open Figma', exact: true }).waitFor();
	await node.locator('img[src="/link-icons/figma.svg"]').first().waitFor();
	await page.waitForFunction(
		(nodeId) =>
			[
				...document.querySelectorAll(`[data-id="${nodeId}"] img[src="/link-icons/figma.svg"]`)
			].every((img) => img.complete && img.naturalWidth > 0),
		id
	);
	await node.getByText(title, { exact: true }).waitFor();
	await sidebar.getByRole('heading', { name: title, exact: true }).waitFor();
	if (await sidebar.getByRole('textbox', { name: 'Title', exact: true }).count())
		throw new Error('duplicate title input remains visible');
	if (canvasName === 'project' && source === 'toolbar') await checkNodeDetails(sidebar, node);
	if (canvasName === 'project' && process.env.BORG_TEST_SCREENSHOT)
		await page.screenshot({ path: process.env.BORG_TEST_SCREENSHOT });
	await sidebar.getByLabel('URL', { exact: true }).fill('https://github.com/example/repository');
	await node.getByText('Code', { exact: true }).waitFor();
	await node.getByRole('button', { name: 'Open GitHub', exact: true }).waitFor();
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
	if (canvasName === 'project' && source === 'toolbar') {
		await node.getByText('Room 401', { exact: true }).waitFor();
		await node.getByRole('button', { name: 'Open arXiv', exact: true }).waitFor();
		console.log('details reload persistence passed');
	}
	console.log(
		`${canvasName} (${source}): URL focus, detection, title editing, views, icons, and reload persistence passed`
	);
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
	await checkLinkNode('overview', 'menu');
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
	await checkLinkNode('project', 'menu');
	if (errors.length) throw new Error(errors.join('\n'));
	console.log('PAGE_ERRORS', errors);
} catch (error) {
	console.log('BODY', await page.locator('body').innerText());
	console.log('ERRORS', errors);
	throw error;
} finally {
	await browser.close();
}
