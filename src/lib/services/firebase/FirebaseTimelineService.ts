import {
	collection,
	doc,
	addDoc,
	updateDoc,
	deleteDoc,
	getDocs,
	query,
	orderBy,
	onSnapshot,
	type Unsubscribe
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { TimelineEvent, TimelineTemplate } from '../../types/timeline';
import { getTimelineTemplate, timelineTemplates } from '../../types/timeline';
import type { ITimelineService } from '../interfaces';

import type { ReadSession } from '../interfaces/Session';
export class FirebaseTimelineService implements ITimelineService {
	private projectId?: string;

	constructor(
		private db: Firestore,
		private readSession: ReadSession,
		projectId?: string
	) {
		this.projectId = projectId;
	}

	async getAllEvents(): Promise<TimelineEvent[]> {
		const userId = this.readSession().user?.uid;
		if (!userId) {
			throw new Error('User must be authenticated to access timeline');
		}

		const collectionPath = this.projectId ? `projects/${this.projectId}/timeline` : 'timeline';

		const snapshot = await getDocs(collection(this.db, collectionPath));

		return snapshot.docs.map(
			(doc) =>
				({
					...doc.data(),
					id: doc.id
				}) as TimelineEvent
		);
	}

	async getEvent(id: string): Promise<TimelineEvent | null> {
		const events = await this.getAllEvents();
		return events.find((e) => e.id === id) || null;
	}

	async addEvent(templateType: string, eventData: Record<string, unknown>): Promise<TimelineEvent> {
		const template = getTimelineTemplate(templateType);

		// Initialize default data based on template
		const initializedData: Record<string, unknown> = {};
		template.fields.forEach((field) => {
			if (field.type === 'tags') {
				initializedData[field.id] = eventData[field.id] || [];
			} else {
				initializedData[field.id] = eventData[field.id] || '';
			}
		});

		const userId = this.readSession().user?.uid;
		if (!userId) {
			throw new Error('User must be authenticated to create timeline events');
		}

		const collectionPath = this.projectId ? `projects/${this.projectId}/timeline` : 'timeline';

		const eventDoc = {
			templateType,
			title: (initializedData.title as string) || 'Untitled Event',
			timestamp: (initializedData.timestamp as string) || new Date().toISOString(),
			eventData: initializedData,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			createdBy: userId,
			projectId: this.projectId || null
		};

		const docRef = await addDoc(collection(this.db, collectionPath), eventDoc);

		return {
			id: docRef.id,
			...eventDoc
		} as TimelineEvent;
	}

	async updateEvent(id: string, updates: Partial<TimelineEvent>): Promise<TimelineEvent | null> {
		const userId = this.readSession().user?.uid;
		if (!userId) {
			throw new Error('User must be authenticated to update timeline events');
		}

		const collectionPath = this.projectId ? `projects/${this.projectId}/timeline` : 'timeline';

		const eventRef = doc(this.db, collectionPath, id);

		const updateData = {
			...updates,
			updatedAt: new Date().toISOString()
		};

		await updateDoc(eventRef, updateData);

		const events = await this.getAllEvents();
		return events.find((e) => e.id === id) || null;
	}

	async deleteEvent(id: string): Promise<boolean> {
		try {
			const userId = this.readSession().user?.uid;
			if (!userId) {
				throw new Error('User must be authenticated to delete timeline events');
			}

			const collectionPath = this.projectId ? `projects/${this.projectId}/timeline` : 'timeline';

			await deleteDoc(doc(this.db, collectionPath, id));
			return true;
		} catch (error) {
			console.error('Failed to delete timeline event:', error);
			return false;
		}
	}

	getTemplate(templateType: string): TimelineTemplate {
		return getTimelineTemplate(templateType);
	}

	getAllTemplates(): TimelineTemplate[] {
		return Object.values(timelineTemplates);
	}

	getPredefinedOptions(templateType: string): Record<string, unknown>[] {
		const template = getTimelineTemplate(templateType);
		return template.predefinedOptions || [];
	}

	async getEventsSortedByDate(): Promise<TimelineEvent[]> {
		return this.getAllEvents(); // Already sorted by date in getAllEvents
	}

	subscribeToEvents(callback: (events: TimelineEvent[]) => void): Unsubscribe {
		const userId = this.readSession().user?.uid;
		if (!userId) {
			throw new Error('User must be authenticated to subscribe to timeline events');
		}

		const collectionPath = this.projectId ? `projects/${this.projectId}/timeline` : 'timeline';

		const q = collection(this.db, collectionPath);

		return onSnapshot(q, (snapshot) => {
			const events = snapshot.docs.map(
				(doc) =>
					({
						...doc.data(),
						id: doc.id
					}) as TimelineEvent
			);
			callback(events);
		});
	}

	subscribeToProjectEvents(
		projectId: string,
		callback: (events: TimelineEvent[]) => void
	): Unsubscribe {
		const q = collection(this.db, `projects/${projectId}/timeline`);

		return onSnapshot(q, (snapshot) => {
			const events = snapshot.docs.map(
				(doc) =>
					({
						...doc.data(),
						id: doc.id
					}) as TimelineEvent
			);
			callback(events);
		});
	}
}
