import type { ResearchMap, ResearchMapPoint, ResearchTopic } from '../types/research';

export async function fetchResearchMap(
	url: string,
	token: string,
	request = fetch
): Promise<ResearchMap> {
	const response = await request(url, {
		headers: { Authorization: `Bearer ${token}` },
		signal: AbortSignal.timeout(25_000),
		// Workers requires manual mode; the status check below rejects redirects.
		redirect: 'manual'
	});
	if (!response.ok) throw new Error('Research map source unavailable');
	const data = await response.json();
	if (
		!data ||
		!['umap', 'insufficient-data'].includes(data.method) ||
		!Array.isArray(data.points) ||
		typeof data.generatedAt !== 'string' ||
		!Number.isFinite(Date.parse(data.generatedAt))
	) {
		throw new Error('Invalid research map');
	}
	const topics: ResearchTopic[] = [];
	const topicIds = new Set<string>();
	for (const topic of Array.isArray(data.topics) ? data.topics : []) {
		if (
			!topic ||
			typeof topic.id !== 'string' ||
			!/^topic-\d+$/.test(topic.id) ||
			topicIds.has(topic.id) ||
			typeof topic.label !== 'string' ||
			!topic.label.trim() ||
			topic.label.length > 64 ||
			typeof topic.color !== 'string' ||
			!/^#[0-9a-f]{6}$/i.test(topic.color) ||
			![topic.x, topic.y].every(
				(v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1
			)
		)
			continue;
		topicIds.add(topic.id);
		topics.push({
			id: topic.id,
			label: topic.label.trim(),
			color: topic.color,
			x: topic.x,
			y: topic.y,
			count: 0,
			labelSource: topic.labelSource === 'llm' ? 'llm' : 'fallback'
		});
	}
	const points: ResearchMapPoint[] = [];
	const seen = new Set<string>();
	for (const point of data.points) {
		if (
			!point ||
			typeof point.url !== 'string' ||
			![point.x, point.y].every(
				(value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
			)
		)
			continue;
		try {
			const parsed = new URL(point.url);
			if (
				!['https:', 'http:'].includes(parsed.protocol) ||
				parsed.username ||
				parsed.password ||
				seen.has(parsed.href)
			)
				continue;
			seen.add(parsed.href);
			points.push({
				url: parsed.href,
				x: point.x,
				y: point.y,
				...(topicIds.has(point.topicId) ? { topicId: point.topicId } : {})
			});
		} catch {
			/* Ignore malformed record URLs. */
		}
	}
	for (const topic of topics) topic.count = points.filter((p) => p.topicId === topic.id).length;
	return {
		method: data.method,
		generatedAt: data.generatedAt,
		points,
		topics: topics.filter((t) => t.count > 0)
	};
}
