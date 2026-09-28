import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { publicUrl } from './public-fetch.mjs';

export function createPaperSubmissionHandler(
	processPaper,
	{
		directory = fileURLToPath(new URL('./jobs/', import.meta.url)),
		readToken = () => process.env.RESEARCH_INGEST_TOKEN
	} = {}
) {
	const jobs = new Map();
	let active = false;
	const save = async (job) => {
		const filename = path.join(directory, job.id + '.json');
		await writeFile(filename + '.tmp', JSON.stringify(job), { mode: 0o600 });
		await rename(filename + '.tmp', filename);
	};
	const publicJob = (job) => ({
		id: job.id,
		url: job.url,
		status: job.status,
		message: job.message,
		title: job.title || '',
		updatedAt: job.updatedAt
	});
	const ready = (async () => {
		await mkdir(directory, { recursive: true, mode: 0o700 });
		for (const name of await readdir(directory)) {
			if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
			try {
				const job = JSON.parse(await readFile(path.join(directory, name), 'utf8'));
				if (job.id + '.json' !== name || !job.owner || !job.url) continue;
				if (job.status === 'processing') job.status = 'queued';
				jobs.set(job.id, job);
			} catch {
				/* An incomplete file must not prevent other queued papers from resuming. */
			}
		}
	})();
	async function drain() {
		if (active) return;
		active = true;
		try {
			for (;;) {
				const job = [...jobs.values()].find((j) => j.status === 'queued');
				if (!job) break;
				job.status = 'processing';
				job.message = 'Fetching and saving paper…';
				job.updatedAt = new Date().toISOString();
				await save(job);
				try {
					const result = await processPaper(job.url, {
						source: 'web',
						sharedBy: job.sharedBy,
						chatName: 'Web'
					});
					if (!result || !['saved', 'already_saved', 'not_paper', 'failed'].includes(result.status))
						throw new Error('Invalid ingestion result');
					Object.assign(job, {
						status: result.status,
						message: result.message,
						title: result.title || ''
					});
				} catch {
					job.status = 'failed';
					job.message = 'Could not save this paper. Please try again.';
				}
				job.updatedAt = new Date().toISOString();
				await save(job);
			}
		} finally {
			active = false;
		}
	}
	const kick = () => {
		void ready.then(drain).catch(() => console.error('Paper submission queue unavailable'));
	};
	kick();
	function send(res, status, value) {
		res
			.writeHead(status, {
				'Content-Type': 'application/json',
				'Cache-Control': 'private, no-store'
			})
			.end(JSON.stringify(value));
	}
	let admission = Promise.resolve();
	const admit = (operation) => {
		const task = admission.then(operation);
		admission = task.catch(() => {});
		return task;
	};
	const handle = async (req, res) => {
		const token = readToken();
		const received = Buffer.from(req.headers.authorization || '');
		const expected = Buffer.from(`Bearer ${token}`);
		if (!token || received.length !== expected.length || !timingSafeEqual(received, expected)) {
			send(res, 401, { message: 'Unauthorized' });
			return;
		}
		try {
			await ready;
			if (req.method !== 'POST') {
				send(res, 405, { message: 'Method not allowed' });
				return;
			}
			let body = '';
			for await (const chunk of req) {
				body += chunk;
				if (Buffer.byteLength(body) > 4096) {
					send(res, 413, { message: 'Request too large' });
					return;
				}
			}
			let input;
			try {
				input = JSON.parse(body);
			} catch {
				send(res, 400, { message: 'Invalid request' });
				return;
			}
			if (!input || typeof input.owner !== 'string' || !input.owner || input.owner.length > 128) {
				send(res, 400, { message: 'Invalid account' });
				return;
			}
			if (input.action === 'monitor') {
				const all = [...jobs.values()];
				send(res, 200, {
					queued: all.filter((j) => j.status === 'queued').length,
					processing: all.filter((j) => j.status === 'processing').length,
					submissions: all
						.filter((j) => j.owner === input.owner)
						.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
						.slice(0, 20)
						.map(publicJob)
				});
				return;
			}
			if (input.action === 'status') {
				const job = jobs.get(input.id);
				if (!job || job.owner !== input.owner) {
					send(res, 404, { message: 'Submission not found' });
					return;
				}
				send(res, 200, publicJob(job));
				return;
			}
			let url;
			try {
				url = publicUrl(input.url);
			} catch {
				send(res, 400, { message: 'Enter a public HTTP or HTTPS paper URL.' });
				return;
			}
			const id = createHash('sha256')
				.update(JSON.stringify([input.owner, url]))
				.digest('hex');
			await admit(async () => {
				let job = jobs.get(id);
				if (job && ['queued', 'processing'].includes(job.status)) {
					send(res, 202, publicJob(job));
					return;
				}
				if (
					[...jobs.values()].filter((j) => ['queued', 'processing'].includes(j.status)).length >= 20
				) {
					send(res, 429, { message: 'The paper queue is full. Please try again shortly.' });
					return;
				}
				// A completed URL can be submitted again: Grist verifies duplicates in the pipeline.
				job = {
					id,
					url,
					owner: input.owner,
					sharedBy: typeof input.sharedBy === 'string' ? input.sharedBy.slice(0, 160) : 'Web',
					status: 'queued',
					message: 'Paper queued…',
					updatedAt: new Date().toISOString()
				};
				await save(job);
				jobs.set(id, job);
				send(res, 202, publicJob(job));
				kick();
			});
		} catch {
			send(res, 503, { message: 'Paper submissions are unavailable. Please try again.' });
		}
	};
	return handle;
}
