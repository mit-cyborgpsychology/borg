import imageCompression from 'browser-image-compression';

export async function compressImageFile(file: File, maxWidthOrHeight = 3600): Promise<File> {
	return imageCompression(file, {
		maxWidthOrHeight,
		useWebWorker: true,
		preserveExif: true
	});
}
