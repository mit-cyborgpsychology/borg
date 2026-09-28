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
page.setDefaultNavigationTimeout(60000);
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

	const futureTitle = `Future event ${projectId}`;
	const pastTitle = `Past event ${projectId}`;
	for (const [id, title, timestamp] of [
		['future', futureTitle, '2099-06-15T09:00+05:30'],
		['past', pastTitle, '2001-01-01T12:00Z']
	]) {
		await put(`timeline/${projectId}-${id}`, {
			title: str(title),
			timestamp: str(timestamp),
			templateType: str('event'),
			eventData: map({
				title: str('Stale nested title'),
				timestamp: str('2000-01-01T00:00Z'),
				description: str('Preserve this note')
			}),
			createdAt: str(new Date().toISOString()),
			updatedAt: str(new Date().toISOString())
		});
	}
	await page.getByRole('button', { name: 'Timeline', exact: true }).click();
	await page.getByRole('button', { name: new RegExp(`^${futureTitle}`) }).waitFor();
	assert.equal(await page.getByRole('button', { name: new RegExp(`^${pastTitle}`) }).count(), 0);
	await page.getByRole('switch', { name: 'Future only' }).click();
	await page.getByRole('button', { name: new RegExp(`^${pastTitle}`) }).waitFor();
	await page.getByRole('button', { name: new RegExp(`^${futureTitle}`) }).click();
	const edit = page.getByRole('region', { name: 'Edit event', exact: true });
	assert.equal(
		await edit.getByLabel('Event title').inputValue(),
		futureTitle,
		'Top-level title wins over stale nested data'
	);
	assert.equal(await edit.getByLabel('When', { exact: true }).inputValue(), '2099-06-15');
	await edit.getByRole('button', { name: 'Save changes', exact: true }).click();
	await edit.waitFor({ state: 'hidden' });
	const saved = await (await fetch(`${rest}/timeline/${projectId}-future`, { headers })).json();
	assert.equal(saved.fields.timestamp.stringValue, '2099-06-15T09:00+05:30');
	assert.equal(
		saved.fields.eventData.mapValue.fields.description.stringValue,
		'Preserve this note'
	);

	await page.getByRole('button', { name: 'New event', exact: true }).click();
	const composer = page.getByRole('region', { name: 'New event', exact: true });
	assert.equal(await page.locator('dialog:visible').count(), 0);
	await composer.getByLabel('Event title').fill(`New ${projectId}`);
	await page.screenshot({ path: '/tmp/borg-event-composer.png' });
	await composer.getByRole('button', { name: 'Tomorrow', exact: true }).click();
	await composer.getByRole('button', { name: 'Deadline', exact: true }).click();
	assert.equal(
		await composer.getByLabel('Event title').inputValue(),
		`New ${projectId}`,
		'Changing type keeps the draft'
	);
	await composer.getByRole('button', { name: 'Timezone', exact: true }).click();
	await composer.getByRole('textbox', { name: 'Search timezone' }).fill('Earth');
	await composer.getByRole('textbox', { name: 'Search timezone' }).press('ArrowDown');
	await page.keyboard.press('Enter');
	await composer.getByRole('button', { name: '23:59', exact: true }).click();
	await composer.getByRole('button', { name: 'Details', exact: true }).click();
	await composer.getByLabel('Description', { exact: true }).fill('Keep draft on error');
	await page.evaluate(async () => {
		const { FirebaseTimelineService } = await import(
			'/src/lib/services/firebase/FirebaseTimelineService.ts'
		);
		const original = FirebaseTimelineService.prototype.addEvent;
		FirebaseTimelineService.prototype.addEvent = async function () {
			FirebaseTimelineService.prototype.addEvent = original;
			throw new Error('Test timeline save failed');
		};
	});
	await composer.getByRole('button', { name: 'Add to timeline', exact: true }).click();
	await composer
		.getByRole('alert')
		.getByText('Test timeline save failed', { exact: true })
		.waitFor();
	assert.equal(await composer.getByLabel('Event title').inputValue(), `New ${projectId}`);
	await composer.getByRole('button', { name: 'Add to timeline', exact: true }).click();
	await composer.waitFor({ state: 'hidden' });
	await page.getByRole('button', { name: new RegExp(`^New ${projectId}`) }).waitFor();
	await page.screenshot({ path: '/tmp/borg-timeline.png' });

	await put(`projects/${projectId}`, {
		title: str('Timeline picker test'),
		slug: str(slug),
		status: str('active'),
		createdAt: str(new Date().toISOString()),
		updatedAt: str(new Date().toISOString()),
		collaborators: { arrayValue: { values: [] } }
	});
	for (const [id, template, nodeData, x] of [
		['time', 'time', { event: str(`${projectId}-past`) }, 100],
		[
			'people',
			'subproject',
			{ title: str('People picker'), collaborators: { arrayValue: { values: [] } } },
			400
		]
	]) {
		await put(`projects/${projectId}/nodes/${id}`, {
			id: str(id),
			type: str('universal'),
			templateType: str(template),
			nodeData: map(nodeData),
			position: map({ x: { integerValue: String(x) }, y: { integerValue: '100' } }),
			createdAt: str(new Date().toISOString()),
			updatedAt: str(new Date().toISOString())
		});
	}
	await page.goto(`${baseURL}/project/${slug}`);
	const timeNode = page.locator('.svelte-flow__node[data-id="time"]');
	await timeNode.waitFor();
	await timeNode.dblclick();
	const sidebar = page.getByRole('complementary', { name: 'Project sidebar' });
	await sidebar.getByRole('button', { name: 'Timeline Event', exact: true }).click();
	assert.ok(await sidebar.getByRole('switch', { name: 'Future only' }).isChecked());
	await sidebar.getByRole('button', { name: new RegExp(`^${pastTitle}`) }).waitFor();
	await sidebar.getByRole('textbox', { name: 'Search timeline event' }).fill(futureTitle);
	await sidebar.getByRole('textbox', { name: 'Search timeline event' }).press('ArrowDown');
	await page.keyboard.press('Enter');
	await sidebar.getByRole('button', { name: 'Timeline Event', exact: true }).click();
	assert.equal(
		await sidebar.getByRole('button', { name: new RegExp(`^${pastTitle}`) }).count(),
		0,
		'Unselected past events are filtered out'
	);
	await sidebar.getByRole('switch', { name: 'Future only' }).click();
	await sidebar.getByRole('button', { name: new RegExp(`^${pastTitle}`) }).waitFor();
	await page.keyboard.press('Escape');
	await sidebar.getByRole('button', { name: 'New event', exact: true }).click();
	const inline = sidebar.getByRole('region', { name: 'New event', exact: true });
	await inline.getByLabel('Event title').fill(`Inline ${projectId}`);
	await inline.getByRole('button', { name: 'Next week', exact: true }).click();
	await inline.getByRole('button', { name: 'Add to timeline', exact: true }).click();
	await inline.waitFor({ state: 'hidden' });
	assert.match(
		await sidebar.getByRole('button', { name: 'Timeline Event', exact: true }).innerText(),
		/Inline/
	);
	await timeNode.getByText(`Inline ${projectId}`, { exact: true }).waitFor();
	await put(`users/person-${projectId}`, {
		name: str(`Alex ${projectId}`),
		email: str(`alex-${projectId}@example.test`),
		isApproved: { booleanValue: true },
		createdAt: str(new Date().toISOString()),
		lastLoginAt: str(new Date().toISOString())
	});
	await page.locator('.svelte-flow__node[data-id="people"]').dblclick();
	await sidebar.getByRole('button', { name: 'Add person', exact: true }).click();
	await sidebar
		.getByRole('textbox', { name: 'Search add person', exact: true })
		.fill(`Alex ${projectId}`);
	await sidebar.getByRole('textbox', { name: 'Search add person', exact: true }).press('ArrowDown');
	await page.keyboard.press('Enter');
	await sidebar.getByRole('button', { name: `Remove Alex ${projectId}` }).waitFor();
	assert.equal(
		(await sidebar.getByRole('button', { name: 'Add person', exact: true }).innerText()).trim(),
		'Add person…'
	);
	await page.screenshot({ path: '/tmp/borg-people-picker.png' });
	await page.getByRole('button', { name: 'Projects', exact: true }).click();
	await page.getByRole('button', { name: 'New Project', exact: true }).click();
	const projectComposer = page.getByRole('region', { name: 'New project', exact: true });
	await projectComposer.getByLabel('Project name').fill(`Inline project ${projectId}`);
	assert.equal(await page.locator('dialog:visible').count(), 0);
	await projectComposer.getByRole('button', { name: 'Create project', exact: true }).click();
	await projectComposer.waitFor({ state: 'hidden' });

	assert.deepEqual(errors, []);
	console.log(
		'PASS timeline creation, editing, retry, offset preservation, custom picker keyboard controls, future filter, inline linked creation'
	);
} finally {
	await browser.close();
}
