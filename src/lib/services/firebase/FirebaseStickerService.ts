import { type FirebaseStorage, ref, getDownloadURL, getBytes } from 'firebase/storage';
import type { IStickerService } from '../interfaces/IStickerService';
import type { StickerCategory, StickerCatalog } from '../../types/sticker';

export class FirebaseStickerService implements IStickerService {
	constructor(private storage: FirebaseStorage) {}
	private catalogCache: StickerCatalog | null = null;
	private catalogCacheTime: number = 0;
	private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours - stickers rarely change
	private readonly SESSION_CACHE_KEY = 'borg-sticker-catalog';
	private readonly SESSION_CACHE_TIME_KEY = 'borg-sticker-catalog-time';
	private readonly CATALOG_REF = 'private/sticker-catalog.json';
	private downloadUrlCache = new Map<string, { url: string; timestamp: number }>();
	private readonly URL_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours for download URLs

	async loadCatalog(): Promise<StickerCatalog> {
		// Return in-memory cached catalog if still fresh
		if (this.catalogCache && !this.isCatalogStale()) {
			console.log('📋 Using in-memory cached sticker catalog');
			return this.catalogCache;
		}

		// Check sessionStorage for cached catalog
		if (typeof window !== 'undefined') {
			try {
				const cachedCatalog = sessionStorage.getItem(this.SESSION_CACHE_KEY);
				const cachedTime = sessionStorage.getItem(this.SESSION_CACHE_TIME_KEY);

				if (cachedCatalog && cachedTime) {
					const cacheAge = Date.now() - parseInt(cachedTime);
					if (cacheAge < this.CACHE_DURATION) {
						console.log('📋 Using sessionStorage cached sticker catalog');
						const catalog = JSON.parse(cachedCatalog);
						this.catalogCache = catalog;
						this.catalogCacheTime = parseInt(cachedTime);
						return catalog;
					} else {
						console.log('📋 SessionStorage sticker catalog expired, clearing...');
						sessionStorage.removeItem(this.SESSION_CACHE_KEY);
						sessionStorage.removeItem(this.SESSION_CACHE_TIME_KEY);
					}
				}
			} catch (error) {
				console.warn('⚠️ Failed to read sticker catalog from sessionStorage:', error);
				sessionStorage.removeItem(this.SESSION_CACHE_KEY);
				sessionStorage.removeItem(this.SESSION_CACHE_TIME_KEY);
			}
		}

		// Load from Firebase and cache aggressively
		try {
			console.log('📋 Loading sticker catalog from Firebase Storage...');
			const catalogRef = ref(this.storage, this.CATALOG_REF);
			const catalogBytes = await getBytes(catalogRef);
			const catalogJson = new TextDecoder().decode(catalogBytes);
			const catalog: StickerCatalog = JSON.parse(catalogJson);

			const timestamp = Date.now();

			// Cache in memory
			this.catalogCache = catalog;
			this.catalogCacheTime = timestamp;

			// Cache in sessionStorage for persistence across page reloads
			if (typeof window !== 'undefined') {
				try {
					sessionStorage.setItem(this.SESSION_CACHE_KEY, JSON.stringify(catalog));
					sessionStorage.setItem(this.SESSION_CACHE_TIME_KEY, timestamp.toString());
					console.log('📋 Sticker catalog cached in sessionStorage');
				} catch (error) {
					console.warn('⚠️ Failed to cache sticker catalog in sessionStorage:', error);
				}
			}

			console.log(
				`✅ Loaded Firebase sticker catalog with ${catalog.categories.length} categories`
			);
			return catalog;
		} catch (firebaseError) {
			console.error('❌ Failed to load Firebase catalog:', firebaseError);
			throw new Error('Failed to load sticker catalog from Firebase');
		}
	}

	async getCategories(): Promise<StickerCategory[]> {
		const catalog = await this.loadCatalog();
		return catalog.categories;
	}

	async getStickersInCategory(categorySlug: string): Promise<StickerCategory | null> {
		const catalog = await this.loadCatalog();
		return catalog.categories.find((cat) => cat.slug === categorySlug) || null;
	}

	async getStickerDownloadUrl(category: string, filename: string): Promise<string> {
		const cacheKey = `${category}/${filename}`;

		// Check if we have a cached URL that's still valid
		const cached = this.downloadUrlCache.get(cacheKey);
		if (cached && Date.now() - cached.timestamp < this.URL_CACHE_DURATION) {
			console.log(`🎯 Using cached download URL for ${cacheKey}`);
			return cached.url;
		}

		try {
			const stickerRef = ref(this.storage, `stickers/${category}/${filename}`);
			const downloadUrl = await getDownloadURL(stickerRef);

			// Cache the URL
			this.downloadUrlCache.set(cacheKey, {
				url: downloadUrl,
				timestamp: Date.now()
			});

			console.log(`🎯 Cached download URL for ${cacheKey}`);
			return downloadUrl;
		} catch (error) {
			console.warn(
				`⚠️ Failed to get Firebase URL for ${category}/${filename}, using local fallback`
			);
			// Fallback to local path - this allows development/testing without full upload
			const fallbackUrl = `/stickers/${category}/${filename}`;

			// Cache the fallback URL too to avoid repeated Firebase calls
			this.downloadUrlCache.set(cacheKey, {
				url: fallbackUrl,
				timestamp: Date.now()
			});

			return fallbackUrl;
		}
	}

	isCatalogStale(): boolean {
		if (!this.catalogCache || !this.catalogCacheTime) {
			return true;
		}
		return Date.now() - this.catalogCacheTime > this.CACHE_DURATION;
	}

	async refreshCatalog(): Promise<StickerCatalog> {
		console.log('🔄 Force refreshing sticker catalog...');

		// Clear all caches
		this.catalogCache = null;
		this.catalogCacheTime = 0;
		this.downloadUrlCache.clear();

		// Clear sessionStorage cache
		if (typeof window !== 'undefined') {
			sessionStorage.removeItem(this.SESSION_CACHE_KEY);
			sessionStorage.removeItem(this.SESSION_CACHE_TIME_KEY);
		}

		return await this.loadCatalog();
	}

	// Method to clear URL cache if needed
	clearUrlCache(): void {
		console.log('🗑️ Clearing sticker URL cache...');
		this.downloadUrlCache.clear();
	}

	// Method to get cache statistics for debugging
	getCacheStats(): { catalogCached: boolean; urlsCached: number; cacheAge: number } {
		return {
			catalogCached: !!this.catalogCache,
			urlsCached: this.downloadUrlCache.size,
			cacheAge: this.catalogCacheTime ? Date.now() - this.catalogCacheTime : 0
		};
	}
}
