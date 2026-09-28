/** Preserve the event's written clock time and offset when presenting or editing it. */
export function formatTimelineDate(timestamp: string): string {
	if (!timestamp) return 'No date';
	const match = timestamp.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}).*?(Z|[+-]\d{2}:\d{2})?)?$/);
	if (!match) return timestamp;
	const [year, month, day] = match[1].split('-').map(Number);
	const date = new Date(year, month - 1, day).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
	if (!match[2]) return date;
	const offset = timestamp.match(/(Z|[+-]\d{2}:\d{2})$/)?.[1] ?? '';
	const zone =
		(
			{ Z: 'UTC', '+00:00': 'UTC', '-05:00': 'EST', '-04:00': 'EDT', '-12:00': 'AOE' } as Record<
				string,
				string
			>
		)[offset] ?? (offset ? `UTC${offset}` : '');
	return `${date} · ${match[2]} ${zone}`.trim();
}

export function timelineTimestamp(event: {
	timestamp?: string;
	date?: string;
	time?: string;
}): string {
	return (
		event.timestamp || (event.date ? `${event.date.split('T')[0]}T${event.time || '23:59'}` : '')
	);
}

export function timelineMillis(event: {
	timestamp?: string;
	date?: string;
	time?: string;
}): number {
	const time = Date.parse(timelineTimestamp(event));
	return Number.isFinite(time) ? time : 0;
}

export function localDateString(date = new Date()): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Resolve ET at the selected wall time using the platform's timezone database. */
export function easternOffset(date: string, time: string): string {
	const instant = new Date(`${date}T${time}:00-05:00`);
	const zone = new Intl.DateTimeFormat('en-US', {
		timeZone: 'America/New_York',
		timeZoneName: 'shortOffset'
	})
		.formatToParts(instant)
		.find((part) => part.type === 'timeZoneName')?.value;
	return zone === 'GMT-4' ? '-04:00' : '-05:00';
}
