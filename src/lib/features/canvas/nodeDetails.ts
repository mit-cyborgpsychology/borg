import type { CustomField, TemplateField } from '../../templates.ts';
import { normalizeLinkUrl } from '../links/linkNode.ts';

export function inferDetailValue(raw: string): { type: TemplateField['type']; value: string } {
	const value = raw.trim();
	// Plain numbers (e.g. a budget of 3.5) must not become web addresses.
	const looksLikeUrl = /^(?:https?:\/\/|(?:[a-z\d-]+\.)+[a-z]{2,}(?:[/:?#]|$))/i.test(value);
	const url = looksLikeUrl && !/\s/.test(value) ? normalizeLinkUrl(value) : '';
	if (url) return { type: 'link', value: url };
	if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		const date = new Date(value);
		if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value) {
			return { type: 'date', value };
		}
	}
	return { type: value.includes('\n') ? 'textarea' : 'text', value };
}

export function createNodeDetail(
	id: string,
	name: string,
	rawValue: string,
	existing: TemplateField[]
): { field: CustomField; value: string } {
	const label = name.trim();
	if (!label || !rawValue.trim()) throw new Error('Enter a name and value.');
	if (existing.some((field) => field.label.trim().toLowerCase() === label.toLowerCase())) {
		throw new Error('That name is already in use.');
	}
	const { type, value } = inferDetailValue(rawValue);
	return { field: { id, label, type, isCustom: true, showInDisplay: true }, value };
}

export function hasDetailValue(value: unknown): boolean {
	if (typeof value === 'string') return value.trim().length > 0;
	if (Array.isArray(value)) return value.some(hasDetailValue);
	return value !== undefined && value !== null;
}
