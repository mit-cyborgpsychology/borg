<script lang="ts">
	import type { PresenceConnection } from '../services/interfaces/IPresenceService';
	import { getAppServices } from '$lib/app/context';
	import { untrack } from 'svelte';
	import type { AuthUser as User } from '../services/interfaces/IAuthService';

	const { presenceService, authStore } = getAppServices();
	interface CursorData {
		x: number; // XYFlow canvas coordinate (not screen coordinate)
		y: number; // XYFlow canvas coordinate (not screen coordinate)
		pointer: 'mouse' | 'touch';
		userId: string;
		userName: string;
		color: string;
	}

	interface CursorUser {
		userId: string;
		userName: string;
		color: string;
		cursor: CursorData | null;
		lastSeen: number;
	}

	let { projectSlug, screenToFlowPosition, flowToScreenPosition } = $props<{
		projectSlug?: string;
		screenToFlowPosition?: (screenPoint: { x: number; y: number }) => { x: number; y: number };
		flowToScreenPosition?: (flowPoint: { x: number; y: number }) => { x: number; y: number };
	}>();

	let otherCursors: Map<string, CursorUser> = $state(new Map());
	let ws: PresenceConnection | null = null;
	let currentUser: User | null = $state(null);
	let isConnected = $state(false);
	let userColor = $state('');

	// Subscribe to auth store
	$effect(() => {
		const unsubscribe = authStore.subscribe((auth) => {
			currentUser = auth.user;
			// Generate color once when user changes
			if (auth.user && !userColor) {
				userColor = generateUserColor();
			}
		});
		return unsubscribe;
	});

	// Generate a random color for the user
	function generateUserColor(): string {
		const colors = [
			'#ef4444', // red-500
			'#f97316', // orange-500
			'#eab308', // yellow-500
			'#22c55e', // green-500
			'#06b6d4', // cyan-500
			'#3b82f6', // blue-500
			'#8b5cf6', // violet-500
			'#d946ef', // fuchsia-500
			'#f43f5e', // rose-500
			'#10b981' // emerald-500
		];
		return colors[Math.floor(Math.random() * colors.length)];
	}

	function connectWebSocket() {
		if (!currentUser || !projectSlug) return;
		ws = presenceService.connect(projectSlug, {
			connected: () => {
				isConnected = true;
			},
			disconnected: () => {
				isConnected = false;
			},
			message: handleWebSocketMessage,
			error: (error) => console.error('Cursor connection failed:', error)
		});
	}

	// Handle WebSocket messages
	function handleWebSocketMessage(data: any) {
		switch (data.type) {
			case 'cursor_update':
				updateOtherCursor(data);
				break;
			case 'user_left':
				removeOtherCursor(data.userId);
				break;
			case 'cursors_sync':
				syncAllCursors(data.cursors);
				break;
		}
	}

	// Update other user's cursor
	function updateOtherCursor(cursorData: CursorData & { userName: string; color: string }) {
		if (cursorData.userId === currentUser?.uid) return; // Ignore own cursor

		const existingUser = otherCursors.get(cursorData.userId);
		const updatedUser: CursorUser = {
			userId: cursorData.userId,
			userName: cursorData.userName || existingUser?.userName || 'Anonymous',
			color: cursorData.color || existingUser?.color || generateUserColor(),
			cursor: {
				x: cursorData.x,
				y: cursorData.y,
				pointer: cursorData.pointer,
				userId: cursorData.userId,
				userName: cursorData.userName,
				color: cursorData.color
			},
			lastSeen: Date.now()
		};

		otherCursors.set(cursorData.userId, updatedUser);
		otherCursors = new Map(otherCursors); // Trigger reactivity
	}

	// Remove other user's cursor
	function removeOtherCursor(userId: string) {
		otherCursors.delete(userId);
		otherCursors = new Map(otherCursors); // Trigger reactivity
	}

	// Sync all cursors
	function syncAllCursors(cursors: CursorUser[]) {
		otherCursors.clear();
		cursors.forEach((cursor) => {
			if (cursor.userId !== currentUser?.uid) {
				otherCursors.set(cursor.userId, cursor);
			}
		});
		otherCursors = new Map(otherCursors); // Trigger reactivity
	}

	// Send cursor position
	function sendCursorPosition(x: number, y: number, pointer: 'mouse' | 'touch') {
		if (!ws || !currentUser) return;

		const cursorData: CursorData = {
			x,
			y,
			pointer,
			userId: currentUser.uid,
			userName: currentUser.displayName || 'Anonymous',
			color: userColor
		};

		ws.send({
			type: 'cursor_update',
			...cursorData
		});
	}

	// Mouse/touch tracking
	let isTracking = false;

	function handleMouseMove(event: MouseEvent) {
		if (!isTracking || !screenToFlowPosition) return;

		// Always convert to flow coordinates - this is our ground truth
		const flowPosition = screenToFlowPosition({ x: event.clientX, y: event.clientY });
		sendCursorPosition(flowPosition.x, flowPosition.y, 'mouse');
	}

	function handleTouchMove(event: TouchEvent) {
		if (!isTracking || event.touches.length === 0 || !screenToFlowPosition) return;
		const touch = event.touches[0];

		// Always convert to flow coordinates - this is our ground truth
		const flowPosition = screenToFlowPosition({ x: touch.clientX, y: touch.clientY });
		sendCursorPosition(flowPosition.x, flowPosition.y, 'touch');
	}

	function handleMouseLeave() {
		if (!ws || !currentUser) return;
		ws.send({
			type: 'cursor_leave',
			userId: currentUser.uid
		});
	}

	function startTracking() {
		isTracking = true;
		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('touchmove', handleTouchMove);
		window.addEventListener('mouseleave', handleMouseLeave);
	}

	function stopTracking() {
		isTracking = false;
		window.removeEventListener('mousemove', handleMouseMove);
		window.removeEventListener('touchmove', handleTouchMove);
		window.removeEventListener('mouseleave', handleMouseLeave);
	}

	// Cleanup stale cursors
	function cleanupStaleCursors() {
		const now = Date.now();
		const staleThreshold = 30000; // 30 seconds

		for (const [userId, user] of otherCursors) {
			if (now - user.lastSeen > staleThreshold) {
				otherCursors.delete(userId);
			}
		}
		otherCursors = new Map(otherCursors); // Trigger reactivity
	}

	$effect(() => {
		// Reconnect when the room or signed-in account changes.
		const userId = currentUser?.uid;
		const room = projectSlug;
		if (!userId || !room) return;
		untrack(() => {
			connectWebSocket();
			startTracking();
		});
		const connection = ws;
		const cleanupInterval = setInterval(cleanupStaleCursors, 10000);
		return () => {
			clearInterval(cleanupInterval);
			stopTracking();
			connection?.close();
			ws = null;
			isConnected = false;
			otherCursors = new Map();
		};
	});
</script>

<!-- Cursor overlay container -->
<div class="pointer-events-none fixed inset-0 z-0 overflow-hidden">
	{#each Array.from(otherCursors.values()) as user (user.userId)}
		{#if user.cursor && flowToScreenPosition}
			{@const screenPosition = flowToScreenPosition({ x: user.cursor.x, y: user.cursor.y })}
			<div
				class="absolute transition-transform duration-75 ease-out"
				style="transform: translate({screenPosition.x}px, {screenPosition.y}px)"
			>
				<!-- Cursor pointer -->
				<div class="relative">
					{#if user.cursor.pointer === 'mouse'}
						<svg
							width="24"
							height="24"
							viewBox="0 0 24 24"
							fill="none"
							xmlns="http://www.w3.org/2000/svg"
							class="drop-shadow-sm"
						>
							<path
								d="M5.5 3L19 16.5L13 15L9.5 19.5L5.5 3Z"
								fill={user.color}
								stroke="white"
								stroke-width="1"
							/>
						</svg>
					{:else}
						<div
							class="h-3 w-3 rounded-full border-2 border-white drop-shadow-sm"
							style="background-color: {user.color}"
						></div>
					{/if}

					<!-- User name label -->
					<div
						class="absolute top-6 left-2 rounded px-2 py-1 text-xs font-medium whitespace-nowrap text-white drop-shadow-sm"
						style="background-color: {user.color}"
					>
						{user.userName}
					</div>
				</div>
			</div>
		{/if}
	{/each}
</div>

<!-- Connection indicator (optional) -->
{#if !isConnected && currentUser && projectSlug}
	<div class="fixed right-4 bottom-4 z-50 rounded bg-yellow-500 px-3 py-1 text-sm text-white">
		Reconnecting cursors...
	</div>
{/if}
