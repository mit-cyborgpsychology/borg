import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// HTTP serves a Python-produced artifact only. Requests never fit a projection.
export function createResearchMapHandler(
	readMap = () => readFile(new URL('./map.json', import.meta.url), 'utf8'),
	readToken = () => process.env.RESEARCH_MAP_TOKEN
) {
	return async (req, res) => {
		res.setHeader('Cache-Control', 'private, no-store');
		const token = readToken();
		if (!token) {
			res.writeHead(503).end('Map is not configured');
			return;
		}
		const received = Buffer.from(req.headers.authorization || '');
		const expected = Buffer.from(`Bearer ${token}`);
		if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
			res.writeHead(401).end('Unauthorized');
			return;
		}
		try {
			const { method, generatedAt, points, topics = [] } = JSON.parse(await readMap());
			if (!Array.isArray(points)) throw new Error('Invalid artifact');
			res
				.writeHead(200, { 'Content-Type': 'application/json' })
				.end(
					JSON.stringify({
						method,
						generatedAt,
						points,
						topics: topics.map(({ id, label, color, count, x, y, labelSource }) => ({
							id,
							label,
							color,
							count,
							x,
							y,
							labelSource
						}))
					})
				);
		} catch {
			res.writeHead(503).end('Map is unavailable');
		}
	};
}
