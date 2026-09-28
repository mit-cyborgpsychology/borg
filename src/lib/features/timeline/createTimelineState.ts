import { createCommand } from '../../state/command.ts';
import { createResource } from '../../state/resource.ts';
import type { ITimelineService } from '../../services/interfaces';
import type { TimelineEvent } from '../../types/timeline';

export function createTimelineState(service: ITimelineService) {
	const list = createResource<TimelineEvent[]>([]);
	const command = createCommand();
	const state = {
		list,
		command,
		load: () => list.load(() => service.getEventsSortedByDate()),
		async add(template: string, data: Record<string, unknown>) {
			const result = await command.run(() => service.addEvent(template, data));
			if (result.ok) await state.load();
			return result;
		},
		async update(id: string, templateType: string, data: Record<string, unknown>) {
			const { title, timestamp, ...eventData } = data;
			const result = await command.run(() =>
				service.updateEvent(id, {
					templateType,
					title: typeof title === 'string' ? title : 'Untitled Event',
					timestamp: typeof timestamp === 'string' ? timestamp : new Date().toISOString(),
					eventData: Object.fromEntries(
						Object.entries(eventData).filter(([, value]) => value !== undefined)
					)
				})
			);
			if (result.ok) await state.load();
			return result;
		},
		async remove(id: string) {
			const result = await command.run(() => service.deleteEvent(id));
			if (result.ok) await state.load();
			return result;
		},
		dispose() {
			command.dispose();
			list.dispose();
		}
	};
	return state;
}
