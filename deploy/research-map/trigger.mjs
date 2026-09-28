import { spawn } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function startWorker(count) {
	const directory = new URL('./', import.meta.url);
	const log = openSync(new URL('worker.log', directory), 'a', 0o600);
	try {
		const child = spawn(
			fileURLToPath(new URL('.venv/bin/python', directory)),
			['-u', fileURLToPath(new URL('worker.py', directory)), '--paper-count', String(count)],
			{
				cwd: fileURLToPath(new URL('../', directory)),
				detached: true,
				stdio: ['ignore', log, log]
			}
		);
		child.on('error', () => console.error('Could not start references map worker'));
		child.unref();
	} finally {
		closeSync(log);
	}
}

// Called only after a successful Chroma write. Never block ingestion on UMAP/LLM.
export async function triggerResearchMap(collection, start = startWorker) {
	try {
		const count = await collection.count();
		if (!Number.isSafeInteger(count) || count <= 0) return false;
		start(count);
		return true;
	} catch {
		console.error('Could not trigger references map update');
		return false;
	}
}

// Serialize insert+count so concurrent messages cannot skip the count-40 hook.
let insertion = Promise.resolve();
export function saveAndTriggerReference(collection, record, start = startWorker) {
	const saved = insertion.then(async () => {
		await collection.add(record);
		await triggerResearchMap(collection, start);
	});
	insertion = saved.catch(() => {});
	return saved;
}
