// Firestore document fields written as `new Date()` come back from the
// client SDK as a Timestamp instance (with a .toDate() method), not a plain
// JS Date — despite what was written. Some code paths also see a plain
// {seconds, nanoseconds} object (e.g. data that passed through JSON) or an
// already-formatted ISO string. This normalizes all three to an ISO string.
export function toIsoString(value: unknown): string {
	if (typeof value === 'string') return value;
	if (value instanceof Date) return value.toISOString();
	if (value && typeof value === 'object') {
		if ('toDate' in value && typeof (value as { toDate: unknown }).toDate === 'function') {
			return (value as { toDate: () => Date }).toDate().toISOString();
		}
		if ('seconds' in value && typeof (value as { seconds: unknown }).seconds === 'number') {
			return new Date((value as { seconds: number }).seconds * 1000).toISOString();
		}
	}
	return new Date().toISOString();
}
