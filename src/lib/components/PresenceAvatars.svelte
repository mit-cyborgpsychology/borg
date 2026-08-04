<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { authStore } from '../stores/authStore';
	import { doc, getDoc, setDoc } from 'firebase/firestore';
	import { db } from '../firebase/config';
	import type { User } from 'firebase/auth';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

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
	let ws: WebSocket | null = null;
	let currentUser: User | null = $state(null);
	let userColor = $state('');
	let staleTimer: ReturnType<typeof setInterval> | null = null;
	const photoCache = new Map<string, Promise<string>>();
	let lastWrittenPage = '';

	const STALE_THRESHOLD = 30000;

	const COLORS = [
		'#ef4444', '#f97316', '#eab308', '#22c55e',
		'#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef',
		'#f43f5e', '#10b981'
	];

	function colorForUser(uid: string): string {
		let hash = 0;
		for (let i = 0; i < uid.length; i++) hash = uid.charCodeAt(i) + ((hash << 5) - hash);
		return COLORS[Math.abs(hash) % COLORS.length];
	}

	function initials(name: string): string {
		return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
	}

	function fetchPhoto(userId: string): Promise<string> {
		if (!photoCache.has(userId)) {
			photoCache.set(userId, getDoc(doc(db, 'users', userId))
				.then((snap) => snap.data()?.photoUrl || '')
				.catch(() => ''));
		}
		return photoCache.get(userId)!;
	}

	// Write our current page to Firestore so others can follow us
	async function updateCurrentPage(path: string) {
		if (!currentUser || path === lastWrittenPage) return;
		lastWrittenPage = path;
		try {
			await setDoc(doc(db, 'users', currentUser.uid), { currentPage: path }, { merge: true });
		} catch {}
	}

	$effect(() => {
		const unsub = authStore.subscribe((auth) => {
			currentUser = auth.user;
			if (auth.user && !userColor) userColor = colorForUser(auth.user.uid);
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
		ws = new WebSocket(`wss://borg-cursors.chayapatr.partykit.dev/party/${wsRoom}`);
		ws.onopen = () => sendPresence();
		ws.onmessage = (event) => {
			try { handleMessage(JSON.parse(event.data)); } catch {}
		};
		ws.onclose = () => setTimeout(connect, 3000);
	}

	function sendPresence() {
		if (!ws || ws.readyState !== WebSocket.OPEN || !currentUser) return;
		ws.send(JSON.stringify({
			type: 'cursor_update',
			userId: currentUser.uid,
			userName: currentUser.displayName || 'Anonymous',
			color: userColor,
			x: 0, y: 0, pointer: 'mouse'
		}));
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
		const photoUrl = await fetchPhoto(data.userId);
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
		const snap = await getDoc(doc(db, 'users', user.userId));
		const targetPage = snap.data()?.currentPage || '/';
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
		selfUser
			? [selfUser, ...Array.from(activeUsers.values())]
			: Array.from(activeUsers.values())
	);

	onMount(() => {
		connect();
		const heartbeat = setInterval(sendPresence, 10000);
		staleTimer = setInterval(cleanStale, 10000);
		return () => clearInterval(heartbeat);
	});

	onDestroy(() => {
		if (staleTimer) clearInterval(staleTimer);
		if (ws) ws.close();
	});

	$effect(() => {
		if (currentUser && !ws) connect();
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
			<div class="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
				{user.userName}{isSelf ? ' (you)' : ''}
			</div>
		</button>
	{/each}
</div>
