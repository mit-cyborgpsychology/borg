import type { TimelineEvent, TimelineTemplate } from '../../types/timeline';

export interface ITimelineService {
	getAllEvents(): Promise<TimelineEvent[]>;
	getEvent(id: string): Promise<TimelineEvent | null>;
	addEvent(templateType: string, eventData: Record<string, unknown>): Promise<TimelineEvent>;
	updateEvent(id: string, updates: Partial<TimelineEvent>): Promise<TimelineEvent | null>;
	deleteEvent(id: string): Promise<boolean>;
	getTemplate(templateType: string): TimelineTemplate;
	getAllTemplates(): TimelineTemplate[];
	getPredefinedOptions(templateType: string): Record<string, unknown>[];
	getEventsSortedByDate(): Promise<TimelineEvent[]>;

	// Real-time subscriptions (Firebase only)
	subscribeToEvents?(callback: (events: TimelineEvent[]) => void): () => void;
	subscribeToProjectEvents?(
		projectId: string,
		callback: (events: TimelineEvent[]) => void
	): () => void;
}
