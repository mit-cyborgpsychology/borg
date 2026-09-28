export interface OutlineDoc {
	id: string;
	url: string;
	title: string;
	updatedAt?: string;
}

export interface OutlineDocSummary {
	id: string;
	title: string;
	url: string;
	updatedAt: string;
	collectionId: string;
}

export interface IOutlineService {
	createDoc(projectSlug: string, nodeId: string): Promise<OutlineDoc>;
	getNodeDoc(projectSlug: string, nodeId: string): Promise<OutlineDoc>;
	linkDoc(projectSlug: string, nodeId: string, documentId: string): Promise<OutlineDoc>;
	listProjectDocs(projectSlug: string, nodeId: string): Promise<OutlineDocSummary[]>;
	searchDocs(query: string): Promise<OutlineDocSummary[]>;
	listDocs(collectionIds: string[]): Promise<OutlineDocSummary[]>;
}
