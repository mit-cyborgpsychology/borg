import type { Person, GlobalPerson } from '../../types/people';

export interface IPeopleService {
	getProjectPeople(projectSlug: string): Promise<Person[]>;
	getGlobalPeople(): Promise<GlobalPerson[]>;
	getPerson(personId: string, projectSlug?: string): Promise<Person | null>;
	addPersonToProject(projectSlug: string, data: { name: string; email?: string }): Promise<Person>;
	updatePersonInProject(
		projectSlug: string,
		personId: string,
		updates: Partial<Person>
	): Promise<Person | null>;
	deletePersonFromProject(projectSlug: string, personId: string): Promise<boolean>;
	searchProjectPeople(projectSlug: string, query: string): Promise<Person[]>;
	searchGlobalPeople(query: string): Promise<GlobalPerson[]>;

	// Legacy methods for backward compatibility
	getAllPeople(): Promise<Person[]>;
	addPerson(data: { name: string; email?: string }): Promise<Person>;
	updatePerson(id: string, updates: Partial<Person>): Promise<Person | null>;
	deletePerson(id: string): Promise<boolean>;
	searchPeople(query: string): Promise<Person[]>;

	// Real-time subscriptions (Firebase only)
	subscribeToProjectPeople?(projectSlug: string, callback: (people: Person[]) => void): () => void;
}
