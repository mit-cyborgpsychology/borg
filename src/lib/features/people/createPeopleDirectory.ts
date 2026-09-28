import { createResource } from '../../state/resource.ts';
import type { IPeopleService } from '../../services/interfaces/IPeopleService';
import type { Person } from '../../types/people';

export function createPeopleDirectory(service: IPeopleService) {
	const list = createResource<Person[]>([]);
	return {
		list,
		load: () => list.load(() => service.getAllPeople()),
		dispose: () => list.dispose()
	};
}
