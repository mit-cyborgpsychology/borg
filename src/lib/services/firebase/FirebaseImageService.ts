import { ref, uploadBytes, getDownloadURL, type FirebaseStorage } from 'firebase/storage';
import type { IImageService } from '../interfaces/IImageService';

export class FirebaseImageService implements IImageService {
	constructor(
		private storage: FirebaseStorage,
		private prepare: (file: File) => Promise<Blob>
	) {}

	async uploadImage(nodeId: string, file: File): Promise<string> {
		const image = await this.prepare(file);
		const target = ref(this.storage, `images/${nodeId}/${Date.now()}_${file.name}`);
		const snapshot = await uploadBytes(target, image);
		return getDownloadURL(snapshot.ref);
	}
}
