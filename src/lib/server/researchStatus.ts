import { listResearch } from './research.ts';
import { fetchResearchMap } from './researchMap.ts';
import type { PaperSubmission, ResearchHealthCheck, ResearchStatus } from '../types/research';

type Config = Partial<Record<string, string>>;

export async function getResearchStatus(
	env: Config,
	owner: string,
	request = fetch
): Promise<ResearchStatus> {
	const checks: ResearchHealthCheck[] = [];
	let submissions: PaperSubmission[] = [];
	let mapUpdatedAt: string | undefined;
	const check = async (
		id: string,
		name: string,
		configured: boolean,
		probe: () => Promise<string>
	) => {
		const result: ResearchHealthCheck = {
			id,
			name,
			status: 'unconfigured',
			message: 'Not configured in this deployment.'
		};
		if (configured) {
			try {
				result.message = await probe();
				result.status = 'ok';
			} catch {
				result.status = 'error';
				result.message =
					'Check failed. The service may be unreachable or its credentials may be invalid.';
			}
		}
		return result;
	};
	const source = env.RESEARCH_MAP_URL || env.RESEARCH_INGEST_URL;
	const [database, map, infrastructure, ingestion] = await Promise.all([
		check(
			'grist',
			'Paper database',
			Boolean(env.GRIST_API_URL && env.GRIST_API_KEY && env.GRIST_RESEARCH_DOC_ID),
			async () => {
				const papers = await listResearch(
					{
						apiUrl: env.GRIST_API_URL!,
						apiKey: env.GRIST_API_KEY!,
						docId: env.GRIST_RESEARCH_DOC_ID!,
						tableId: env.GRIST_RESEARCH_TABLE_ID || 'Table1'
					},
					request
				);
				return `${papers.length} papers saved in Grist.`;
			}
		),
		check('map', 'Paper map', Boolean(env.RESEARCH_MAP_URL && env.RESEARCH_MAP_TOKEN), async () => {
			const data = await fetchResearchMap(env.RESEARCH_MAP_URL!, env.RESEARCH_MAP_TOKEN!, request);
			mapUpdatedAt = data.generatedAt;
			return `${data.points.length} mapped papers · ${data.topics.length} topics.`;
		}),
		(async (): Promise<ResearchHealthCheck[]> => {
			const names = [
				['server', 'Ingestion server'],
				['chroma', 'Chroma'],
				['whatsapp', 'WhatsApp process']
			];
			if (!source)
				return names.map(([id, name]) => ({
					id,
					name,
					status: 'unconfigured',
					message: 'Not configured in this deployment.'
				}));
			try {
				const response = await request(new URL('/health', source), {
					redirect: 'manual',
					signal: AbortSignal.timeout(10_000)
				});
				if (!response.ok) throw new Error();
				const data = await response.json();
				return names.map(([id, name]) => {
					const ok =
						id === 'chroma'
							? data?.chroma?.ok === true
							: data?.borg?.jobs?.some(
									(job: { label?: string; running?: boolean }) =>
										job.label === `com.borg.${id === 'server' ? 'server' : 'whatsapp'}` &&
										job.running === true
								) === true;
					return {
						id,
						name,
						status: ok ? 'ok' : 'error',
						message: ok
							? id === 'whatsapp'
								? 'Process running. WhatsApp connection is not verified by this check.'
								: id === 'chroma'
									? 'Database responding.'
									: 'Process running.'
							: 'Not reporting healthy. Check the service on the server.'
					};
				});
			} catch {
				return names.map(([id, name]) => ({
					id,
					name,
					status: 'error',
					message: 'Unable to reach the server health check.'
				}));
			}
		})(),
		check(
			'queue',
			'Web submission queue',
			Boolean(env.RESEARCH_INGEST_URL && env.RESEARCH_INGEST_TOKEN),
			async () => {
				const response = await request(env.RESEARCH_INGEST_URL!, {
					method: 'POST',
					headers: {
						Authorization: `Bearer ${env.RESEARCH_INGEST_TOKEN}`,
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({ action: 'monitor', owner }),
					redirect: 'manual',
					signal: AbortSignal.timeout(10_000)
				});
				if (!response.ok) throw new Error();
				const data = await response.json();
				if (
					!Number.isSafeInteger(data.queued) ||
					data.queued < 0 ||
					!Number.isSafeInteger(data.processing) ||
					data.processing < 0 ||
					!Array.isArray(data.submissions)
				)
					throw new Error();
				submissions = data.submissions
					.slice(0, 20)
					.filter(
						(job: PaperSubmission) =>
							job &&
							typeof job.id === 'string' &&
							/^[a-f0-9]{64}$/.test(job.id) &&
							['queued', 'processing', 'saved', 'already_saved', 'not_paper', 'failed'].includes(
								job.status
							) &&
							typeof job.url === 'string' &&
							typeof job.updatedAt === 'string'
					)
					.map((job: PaperSubmission) => ({
						id: job.id,
						url: job.url.slice(0, 2048),
						title: typeof job.title === 'string' ? job.title.slice(0, 500) : '',
						status: job.status,
						message: typeof job.message === 'string' ? job.message.slice(0, 500) : '',
						updatedAt: job.updatedAt
					}));
				return `${data.processing} processing · ${data.queued} queued across web submissions.`;
			}
		)
	]);
	if (mapUpdatedAt) map.updatedAt = mapUpdatedAt;
	checks.push(database, map, ...infrastructure, ingestion);
	return { checkedAt: new Date().toISOString(), checks, submissions };
}
