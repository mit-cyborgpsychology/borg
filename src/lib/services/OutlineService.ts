import { get } from 'svelte/store';
import type { IOutlineService, OutlineDoc, OutlineDocSummary } from './interfaces/IOutlineService';
import { authStore } from '../stores/authStore';
import { projectsService } from './instances';

async function authHeader(): Promise<Record<string, string>> {
	const user = get(authStore).user;
	if (!user) {
		throw new Error('Must be signed in to use the Outline integration');
	}
	const idToken = await user.getIdToken();
	return { Authorization: `Bearer ${idToken}` };
}

export class OutlineService implements IOutlineService {
	async createDoc(projectSlug: string, title: string): Promise<OutlineDoc> {
		const headers = await authHeader();

		const project = await projectsService.getProject(projectSlug);
		if (!project) {
			throw new Error(`Project not found: ${projectSlug}`);
		}

		const res = await fetch('/api/outline/docs', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...headers
			},
			body: JSON.stringify({
				projectSlug,
				projectTitle: project.title,
				existingCollectionId: project.outlineCollectionId,
				title
			})
		});

		if (!res.ok) {
			throw new Error(`Failed to create Outline doc: ${await res.text()}`);
		}

		const result: OutlineDoc & { collectionId: string } = await res.json();

		// Persist the collection id on the project the first time it's created
		if (!project.outlineCollectionId && result.collectionId) {
			await projectsService.updateProject(projectSlug, {
				outlineCollectionId: result.collectionId
			});
		}

		return { id: result.id, url: result.url, title: result.title };
	}

	async searchDocs(query: string): Promise<OutlineDocSummary[]> {
		const headers = await authHeader();
		const res = await fetch(`/api/outline/search?q=${encodeURIComponent(query)}`, { headers });
		if (!res.ok) {
			throw new Error(`Failed to search Outline docs: ${await res.text()}`);
		}
		const { docs } = await res.json();
		return docs;
	}

	async listDocs(collectionIds: string[]): Promise<OutlineDocSummary[]> {
		if (collectionIds.length === 0) return [];
		const headers = await authHeader();
		const params = new URLSearchParams();
		for (const id of collectionIds) params.append('collectionId', id);
		const res = await fetch(`/api/outline/search?${params.toString()}`, { headers });
		if (!res.ok) {
			throw new Error(`Failed to list Outline docs: ${await res.text()}`);
		}
		const { docs } = await res.json();
		return docs;
	}
}
