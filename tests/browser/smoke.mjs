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

	await page.getByRole('button', { name: 'New Project', exact: true }).click();
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
	if (errors.length) throw new Error(errors.join('\n'));
	console.log('PAGE_ERRORS', errors);
} catch (error) {
	console.log('BODY', await page.locator('body').innerText());
	console.log('ERRORS', errors);
	throw error;
} finally {
	await browser.close();
}
