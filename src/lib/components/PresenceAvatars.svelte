<script lang="ts">
	import type { PresenceConnection } from '../services/interfaces/IPresenceService';
	import { getAppServices } from '$lib/app/context';
	import { untrack } from 'svelte';
	import type { AuthUser as User } from '../services/interfaces/IAuthService';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	const { presenceService, authStore, profileService } = getAppServices();
	interface ActiveUser {
		userId: string;
		userName: string;
		photoUrl: string;
		color: string;
		lastSeen: number;
		currentPage?: string;
	}

	// room = project slug for project pages, or undefined for main page (global mode)
	let { room } = $props<{ room?: string }>();

	// In global mode we connect to __global__ and track everyone's location
	let isGlobal = $derived(!room);
	let wsRoom = $derived(room ?? '__global__');

	let activeUsers = $state<Map<string, ActiveUser>>(new Map());
	let ws: PresenceConnection | null = null;
	let currentUser: User | null = $state(null);
	let userColor = $state('');
	let connectionVersion = 0;
	const photoCache = new Map<string, Promise<string>>();
	let lastWrittenPage = '';

	const STALE_THRESHOLD = 30000;

	const COLORS = [
		'#ef4444',
		'#f97316',
		'#eab308',
		'#22c55e',
		'#06b6d4',
		'#3b82f6',
		'#8b5cf6',
		'#d946ef',
		'#f43f5e',
		'#10b981'
	];

	function colorForUser(uid: string): string {
		let hash = 0;
		for (let i = 0; i < uid.length; i++) hash = uid.charCodeAt(i) + ((hash << 5) - hash);
		return COLORS[Math.abs(hash) % COLORS.length];
	}

	function initials(name: string): string {
		return name
			.split(' ')
			.map((w) => w[0])
			.join('')
			.slice(0, 2)
			.toUpperCase();
	}

	function fetchPhoto(userId: string): Promise<string> {
		if (!photoCache.has(userId)) {
			photoCache.set(
				userId,
				profileService
					.getProfile(userId)
					.then((profile) => profile?.photoUrl || '')
					.catch(() => '')
			);
		}
		return photoCache.get(userId)!;
	}

	// Write our current page to Firestore so others can follow us
	async function updateCurrentPage(path: string) {
		if (!currentUser || path === lastWrittenPage) return;
		lastWrittenPage = path;
		try {
			await profileService.updateProfile(currentUser.uid, { currentPage: path });
		} catch {}
	}

	$effect(() => {
		const unsub = authStore.subscribe((auth) => {
			currentUser = auth.user;
			userColor = auth.user ? colorForUser(auth.user.uid) : '';
			lastWrittenPage = '';
		});
		return unsub;
	});

	// Track current page and write to Firestore so others can follow us
	$effect(() => {
		if (!currentUser) return;
		const path = isGlobal ? $page.url.pathname : `/project/${room}`;
		if (path) updateCurrentPage(path);
	});

	function connect() {
		if (!currentUser) return;
		ws = presenceService.connect(wsRoom, { connected: sendPresence, message: handleMessage });
	}

	function sendPresence() {
		if (!ws || !currentUser) return;
		ws.send({
			type: 'cursor_update',
			userId: currentUser.uid,
			userName: currentUser.displayName || 'Anonymous',
			color: userColor,
			x: 0,
			y: 0,
			pointer: 'mouse'
		});
	}

	function handleMessage(data: any) {
		if (data.type === 'cursor_update') {
			if (data.userId === currentUser?.uid) return;
			upsertUser(data);
		} else if (data.type === 'cursors_sync') {
			(data.cursors as any[]).forEach((c) => {
				if (c.userId !== currentUser?.uid) upsertUser(c);
			});
		} else if (data.type === 'user_left') {
			activeUsers.delete(data.userId);
			activeUsers = new Map(activeUsers);
		}
	}

	async function upsertUser(data: any) {
		const version = connectionVersion;
		const photoUrl = await fetchPhoto(data.userId);
		if (version !== connectionVersion) return;
		activeUsers.set(data.userId, {
			userId: data.userId,
			userName: data.userName || 'Anonymous',
			photoUrl,
			color: data.color || colorForUser(data.userId),
			lastSeen: Date.now()
		});
		activeUsers = new Map(activeUsers);
	}

	function cleanStale() {
		const now = Date.now();
		for (const [uid, u] of activeUsers) {
			if (now - u.lastSeen > STALE_THRESHOLD) activeUsers.delete(uid);
		}
		activeUsers = new Map(activeUsers);
	}

	async function followUser(user: ActiveUser) {
		if (user.userId === currentUser?.uid) return;
		if (!isGlobal) return; // only navigate from global/main page
		// Re-fetch fresh page location
		const profile = await profileService.getProfile(user.userId);
		const targetPage = profile?.currentPage || '/';
		goto(targetPage);
	}

	// Self avatar from authStore — always shown
	let selfUser = $derived.by(() => {
		const user = currentUser;
		if (!user) return null;
		return {
			userId: user.uid,
			userName: user.displayName || 'Anonymous',
			photoUrl: user.photoURL || '',
			color: userColor,
			lastSeen: Date.now(),
			currentPage: $page.url.pathname
		};
	});

	let allUsers = $derived(
		selfUser ? [selfUser, ...Array.from(activeUsers.values())] : Array.from(activeUsers.values())
	);

	$effect(() => {
		const userId = currentUser?.uid;
		const room = wsRoom;
		if (!userId || !room) return;
		untrack(connect);
		const connection = ws;
		const heartbeat = setInterval(sendPresence, 10000);
		const staleTimer = setInterval(cleanStale, 10000);
		return () => {
			connectionVersion++;
			clearInterval(heartbeat);
			clearInterval(staleTimer);
			connection?.close();
			ws = null;
			activeUsers = new Map();
			photoCache.clear();
		};
	});
</script>

<div class="flex items-center gap-1">
	{#each allUsers as user (user.userId)}
		{@const isSelf = user.userId === currentUser?.uid}
		{@const canFollow = isGlobal && !isSelf}
		<button
			class="group relative {canFollow ? 'cursor-pointer' : 'cursor-default'}"
			title={canFollow ? `Follow ${user.userName}` : user.userName}
			onclick={() => followUser(user)}
		>
			{#if user.photoUrl}
				<img
					src={user.photoUrl}
					alt={user.userName}
					referrerpolicy="no-referrer"
					class="h-7 w-7 rounded-full object-cover"
				/>
			{:else}
				<div
					class="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white"
					style="background-color: {user.color};"
				>
					{initials(user.userName)}
				</div>
			{/if}
			<div
				class="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 rounded bg-zinc-800 px-2 py-0.5 text-[10px] whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100"
			>
				{user.userName}{isSelf ? ' (you)' : ''}
			</div>
		</button>
	{/each}
</div>
