export interface IImageService {
	uploadImage(nodeId: string, file: File): Promise<string>;
}
