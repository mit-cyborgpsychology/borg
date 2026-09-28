export interface IAssistantService {
	request(
		projectSlug: string,
		selectedNodeIds: string[],
		body: string,
		signal?: AbortSignal | null
	): Promise<Response>;
}
