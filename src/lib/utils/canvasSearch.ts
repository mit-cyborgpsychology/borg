import type { Node } from '@xyflow/svelte';
import { describeLink } from '../features/links/linkNode.ts';

export interface SearchState {
	query: string;
	matchingNodeIds: string[];
	currentMatchIndex: number;
}

export function createSearchState(): SearchState {
	return {
		query: '',
		matchingNodeIds: [],
		currentMatchIndex: 0
	};
}

export function clearSearchStyling() {
	document.querySelectorAll('.search-highlighted').forEach((el) => {
		el.classList.remove('search-highlighted');
	});
	document.querySelectorAll('.search-dimmed').forEach((el) => {
		el.classList.remove('search-dimmed');
	});
}

export function updateMatchingNodes(
	query: string,
	nodes: Node[],
	state: SearchState,
	onNavigate: () => void
) {
	const trimmedQuery = query.trim().toLowerCase();
	if (!trimmedQuery) {
		state.matchingNodeIds = [];
		state.currentMatchIndex = 0;
		clearSearchStyling();
		return;
	}

	state.matchingNodeIds = nodes
		.filter((node) => {
			// Search through all fields in nodeData
			const nodeData = (node.data?.nodeData || {}) as Record<string, unknown>;
			const link = node.data?.templateType === 'link' ? describeLink(nodeData.url) : null;
			const searchableText = [...Object.values(nodeData), link?.providerName, link?.label]
				.filter((value) => typeof value === 'string')
				.join(' ')
				.toLowerCase();
			return searchableText.includes(trimmedQuery);
		})
		.map((node) => node.id);

	state.currentMatchIndex = 0;
	if (state.matchingNodeIds.length > 0) {
		onNavigate();
	}
}

export function navigateToMatch(
	state: SearchState,
	nodes: Node[],
	setViewport: (viewport: { x: number; y: number; zoom: number }, options?: any) => void
) {
	if (state.matchingNodeIds.length === 0) return;

	// Remove highlight and dimming from all nodes
	clearSearchStyling();

	// Dim all non-matching nodes
	nodes.forEach((node) => {
		if (!state.matchingNodeIds.includes(node.id)) {
			const nodeElement = document.querySelector(`[data-id="${node.id}"]`);
			if (nodeElement) {
				nodeElement.classList.add('search-dimmed');
			}
		}
	});

	const nodeId = state.matchingNodeIds[state.currentMatchIndex];
	const node = nodes.find((n) => n.id === nodeId);
	if (node && node.position) {
		setViewport(
			{ x: -node.position.x + 400, y: -node.position.y + 300, zoom: 1 },
			{ duration: 300 }
		);

		// Add highlight to current node after a short delay to ensure it's rendered
		setTimeout(() => {
			const nodeElement = document.querySelector(`[data-id="${nodeId}"]`);
			if (nodeElement) {
				nodeElement.classList.add('search-highlighted');
			}
		}, 100);
	}
}

export function nextMatch(state: SearchState, onNavigate: () => void) {
	if (state.matchingNodeIds.length === 0) return;
	state.currentMatchIndex = (state.currentMatchIndex + 1) % state.matchingNodeIds.length;
	onNavigate();
}

export function previousMatch(state: SearchState, onNavigate: () => void) {
	if (state.matchingNodeIds.length === 0) return;
	state.currentMatchIndex =
		(state.currentMatchIndex - 1 + state.matchingNodeIds.length) % state.matchingNodeIds.length;
	onNavigate();
}
