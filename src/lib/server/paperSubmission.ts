import type { PaperSubmission } from '../types/research';

export class SubmissionNotFoundError extends Error {
	constructor() {
		super('Submission not found.');
	}
}

export async function requestPaperSubmission(
	endpoint: string,
	token: string,
	input: { owner: string; sharedBy?: string; url?: string; action?: 'status'; id?: string },
	request = fetch
): Promise<PaperSubmission> {
	const response = await request(endpoint, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify(input),
		// Workers requires manual mode; the status check below rejects redirects.
		redirect: 'manual',
		signal: AbortSignal.timeout(15_000)
	});
	if (!response.ok) {
		if (response.status === 404) throw new SubmissionNotFoundError();
		if (response.status === 429)
			throw new Error('The paper queue is full. Please try again shortly.');
		if (response.status === 400) throw new Error('Enter a public HTTP or HTTPS paper URL.');
		throw new Error('Paper submissions are unavailable. Please try again.');
	}
	const data = await response.json();
	if (
		!data ||
		!/^[a-f0-9]{64}$/.test(data.id) ||
		!['queued', 'processing', 'saved', 'already_saved', 'not_paper', 'failed'].includes(
			data.status
		) ||
		typeof data.message !== 'string' ||
		typeof data.url !== 'string'
	)
		throw new Error('Invalid submission response');
	return {
		id: data.id,
		url: data.url,
		status: data.status,
		message: data.message.slice(0, 500),
		title: typeof data.title === 'string' ? data.title.slice(0, 500) : '',
		updatedAt: data.updatedAt
	};
}
