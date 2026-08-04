// Extracts a display title from a canvas node's data, based on its template
// type — different node templates keep their "title" under different field
// names (a note's title is its `content`, a timeline-selector node's is
// `event`, everything else uses `title`), with a fallback search across
// common field names for nodes that don't match the expected shape.
export function getTitleFieldName(templateType?: string): string {
	switch (templateType) {
		case 'note':
			return 'content';
		case 'time':
			return 'event';
		default:
			return 'title';
	}
}

export function extractNodeTitle(nodeData: any, templateType?: string): string {
	if (!nodeData) return 'Untitled';

	const titleField = getTitleFieldName(templateType);
	const titleValue = nodeData[titleField];

	if (!titleValue) {
		for (const field of ['title', 'content', 'name']) {
			if (typeof nodeData[field] === 'string' && nodeData[field].trim()) {
				return nodeData[field];
			}
		}
		return 'Untitled';
	}

	if (templateType === 'time' && titleField === 'event') {
		// Timeline-selector fields store an event reference, not a display
		// string — resolving the actual event title needs TimelineService,
		// which this helper doesn't have access to.
		return 'Timeline Event';
	}

	return titleValue;
}
