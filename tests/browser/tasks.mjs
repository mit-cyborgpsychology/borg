// Run against a local Vite server configured for the demo-borg Firebase emulators.
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
const page = await browser.newPage({
	viewport: { width: 1440, height: 1000 },
	timezoneId: 'America/New_York'
});
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.route('**/*', (route) =>
	['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)
		? route.continue()
		: route.abort()
);
await page.routeWebSocket(/wss:\/\/.*/, (socket) => socket.close());

const rest = 'http://127.0.0.1:8080/v1/projects/demo-borg/databases/(default)/documents';
const headers = { 'content-type': 'application/json', Authorization: 'Bearer owner' };
const str = (stringValue) => ({ stringValue });
const map = (fields) => ({ mapValue: { fields } });
async function put(path, fields) {
	const response = await fetch(`${rest}/${path}`, {
		method: 'PATCH',
		headers,
		body: JSON.stringify({ fields })
	});
	assert.ok(response.ok, await response.text());
}
const projectId = `tasks-${Date.now()}`;
const slug = `slug-${projectId}`;
async function savedTasks() {
	const response = await fetch(`${rest}:runQuery`, {
		method: 'POST',
		headers,
		body: JSON.stringify({
			structuredQuery: {
				from: [{ collectionId: 'tasks' }],
				where: {
					fieldFilter: { field: { fieldPath: 'projectSlug' }, op: 'EQUAL', value: str(slug) }
				}
			}
		})
	});
	assert.ok(response.ok);
	return (await response.json()).filter((row) => row.document).map((row) => row.document.fields);
}
async function waitForSaved(title, status = 'active') {
	for (let i = 0; i < 50; i++) {
		const found = (await savedTasks()).filter((task) => task.title.stringValue === title);
		if (found.length === 1 && found[0].status.stringValue === status) return found[0];
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	assert.fail(`Task was not persisted exactly once: ${title} (${status})`);
}
try {
	await page.goto(baseURL);
	await page.getByRole('button', { name: /Google/ }).waitFor();
	const email = `admin-tasks-${Date.now()}@example.test`;
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
	await put(`projects/${projectId}`, {
		title: str('Checklist test'),
		slug: str(slug),
		status: str('active'),
		createdAt: str(new Date().toISOString()),
		updatedAt: str(new Date().toISOString()),
		collaborators: { arrayValue: { values: [] } }
	});
	await put(`projects/${projectId}/nodes/link`, {
		createdAt: str(new Date().toISOString()),
		updatedAt: str(new Date().toISOString()),
		id: str('link'),
		type: str('universal'),
		templateType: str('link'),
		nodeData: map({
			title: str('Survey'),
			url: str('https://qualtrics.com/jfe/form/test'),
			viewMode: str('Node')
		}),
		position: map({ x: { integerValue: '100' }, y: { integerValue: '100' } })
	});
	await page.goto(`${baseURL}/project/${slug}`);
	const node = page.locator('.svelte-flow__node[data-id="link"]');
	const input = node.getByRole('textbox', { name: 'New task', exact: true });
	await input.waitFor();
	const position = await node.evaluate((el) => el.style.transform);
	await input.fill('   ');
	await input.press('Enter');
	assert.equal((await savedTasks()).length, 0, 'Empty tasks are rejected');
	for (const title of ['Review survey', 'Send invitations', 'Check responses', 'Share results']) {
		await input.fill(title);
		await input.press('Enter');
		await page.waitForFunction(
			() => document.querySelector('[data-id="link"] input[aria-label="New task"]')?.value === ''
		);
		const saved = await waitForSaved(title);
		assert.equal(saved.nodeId.stringValue, 'link');
		assert.equal(saved.assignee.stringValue, userId);
		assert.ok(await input.evaluate((el) => el === document.activeElement), 'Enter keeps focus');
	}
	assert.equal(
		await node.evaluate((el) => el.style.transform),
		position,
		'Typing did not move the node'
	);
	await node.getByRole('button', { name: '+1 more', exact: true }).click();
	const sidebar = page.getByRole('region', { name: 'Node tasks', exact: true });
	await sidebar.getByRole('button', { name: 'Edit Review survey', exact: true }).waitFor();
	await sidebar.getByRole('textbox', { name: 'New task', exact: true }).fill('Sidebar task');
	await sidebar.getByRole('textbox', { name: 'New task', exact: true }).press('Enter');
	await node.getByRole('button', { name: 'Edit Sidebar task', exact: true }).waitFor();
	await sidebar.getByRole('button', { name: 'Close tasks' }).click();
	// Completion is persisted and undo restores the same task.
	await node.getByRole('checkbox', { name: 'Mark Sidebar task as done', exact: true }).click();
	await node.getByRole('button', { name: 'Undo', exact: true }).waitFor();
	await waitForSaved('Sidebar task', 'resolved');
	await node.getByRole('button', { name: 'Undo', exact: true }).click();
	await waitForSaved('Sidebar task');
	await page.waitForFunction(
		() =>
			document.querySelector('[data-id="link"] input[aria-label="Mark Sidebar task as done"]')
				?.disabled === false
	);
	await node
		.getByRole('checkbox', { name: 'Mark Sidebar task as done', exact: true })
		.press('Space');
	await waitForSaved('Sidebar task', 'resolved');
	await node.getByRole('button', { name: 'Completed · 1', exact: true }).click();
	assert.ok(
		await node
			.getByRole('checkbox', { name: 'Mark Sidebar task as not done', exact: true })
			.isChecked()
	);
	// Task editing lives outside the transformed canvas and supports Escape.
	await node.getByRole('button', { name: 'Edit Share results', exact: true }).click();
	const modal = page.getByRole('dialog', { name: 'Edit Task', exact: true });
	await modal.getByLabel('Task', { exact: true }).fill('Share updated results');
	await modal.getByLabel('Notes', { exact: true }).fill('Bring these to the meeting');
	await modal.getByRole('button', { name: 'Save Changes', exact: true }).click();
	await modal.waitFor({ state: 'hidden' });
	await waitForSaved('Share updated results');
	await node.getByRole('button', { name: 'Edit Share updated results', exact: true }).click();
	await page.keyboard.press('Escape');
	await modal.waitFor({ state: 'hidden' });
	// Inject command failures at the service boundary; successful retries still use Firebase.
	await page.evaluate(async () => {
		const { FirebaseTaskService } = await import(
			'/src/lib/services/firebase/FirebaseTaskService.ts'
		);
		const prototype = FirebaseTaskService.prototype;
		const original = prototype.addTask;
		prototype.addTask = async function (...args) {
			prototype.addTask = original;
			throw new Error('Test save failed');
		};
	});
	await input.fill('Retry this task');
	await input.press('Enter');
	await node.getByRole('alert').getByText('Test save failed', { exact: true }).waitFor();
	assert.equal(await input.inputValue(), 'Retry this task');
	await input.press('Enter');
	await waitForSaved('Retry this task');
	await page.evaluate(async () => {
		const { FirebaseTaskService } = await import(
			'/src/lib/services/firebase/FirebaseTaskService.ts'
		);
		const prototype = FirebaseTaskService.prototype;
		const original = prototype.resolveTask;
		prototype.resolveTask = async function (...args) {
			prototype.resolveTask = original;
			throw new Error('Test completion failed');
		};
	});
	const checkbox = node.getByRole('checkbox', {
		name: 'Mark Retry this task as done',
		exact: true
	});
	await checkbox.click();
	await node.getByRole('alert').getByText('Test completion failed', { exact: true }).waitFor();
	assert.equal(await checkbox.isChecked(), false, 'Failed completion stays unchecked');
	await waitForSaved('Retry this task');
	await checkbox.click();
	await waitForSaved('Retry this task', 'resolved');
	await page.reload();
	await node.getByRole('button', { name: 'Completed · 2', exact: true }).click();
	assert.ok(
		await node
			.getByRole('checkbox', { name: 'Mark Retry this task as not done', exact: true })
			.isChecked()
	);
	await node
		.getByRole('checkbox', { name: 'Mark Retry this task as not done', exact: true })
		.click();
	await waitForSaved('Retry this task');
	// Multiple Enter presses during an in-flight write must produce one task.
	await page.evaluate(async () => {
		const { FirebaseTaskService } = await import(
			'/src/lib/services/firebase/FirebaseTaskService.ts'
		);
		const prototype = FirebaseTaskService.prototype;
		const original = prototype.addTask;
		prototype.addTask = async function (...args) {
			await new Promise((resolve) => setTimeout(resolve, 400));
			return original.apply(this, args);
		};
	});
	await input.fill('Only once');
	await input.press('Enter');
	await input.press('Enter');
	await input.press('Enter');
	await page.waitForFunction(
		() => document.querySelector('[data-id="link"] input[aria-label="New task"]')?.value === ''
	);
	await waitForSaved('Only once');
	const projectSidebar = page.getByRole('complementary', { name: 'Project sidebar', exact: true });
	await projectSidebar.getByRole('button', { name: /^Tasks/ }).click();
	await projectSidebar.getByRole('button', { name: 'Edit Only once', exact: true }).waitFor();
	await projectSidebar
		.getByRole('textbox', { name: 'New task', exact: true })
		.fill('From project sidebar');
	await projectSidebar.getByRole('textbox', { name: 'New task', exact: true }).press('Enter');
	await node.getByRole('button', { name: 'Edit From project sidebar', exact: true }).waitFor();
	await waitForSaved('From project sidebar');
	await page.waitForFunction(
		() =>
			document.querySelector(
				'[data-id="link"] input[aria-label="Mark From project sidebar as done"]'
			)?.disabled === false
	);
	await projectSidebar
		.getByRole('button', { name: 'Edit From project sidebar', exact: true })
		.click();
	await modal.getByLabel('Due Date', { exact: true }).fill('2028-03-05');
	await modal.getByRole('button', { name: 'Save Changes', exact: true }).click();
	await modal.waitFor({ state: 'hidden' });
	assert.equal((await waitForSaved('From project sidebar')).dueDate.stringValue, '2028-03-05');
	await node.getByRole('button', { name: 'Completed · 1', exact: true }).click();
	await page.screenshot({ path: '/tmp/borg-tasks.png', fullPage: true });
	assert.deepEqual(errors, []);
	console.log(
		'Tasks: inline creation, scope, focus, sidebar sync, completion/undo, editing, failure/retry and reload passed.'
	);
} catch (error) {
	console.error('PAGE_ERRORS', errors);
	console.error((await page.locator('body').innerText()).slice(-10000));
	throw error;
} finally {
	await browser.close();
}
