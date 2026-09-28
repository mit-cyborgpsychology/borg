<script lang="ts">
	import { onDestroy } from 'svelte';
	import { createTaskCommands } from '../../features/tasks/createTaskCommands';
	import { createProfileState } from '../../features/profile/createProfileState';
	import AsyncStatus from '../AsyncStatus.svelte';
	import StatusOverlay from '../StatusOverlay.svelte';
	import { getAppServices } from '$lib/app/context';
	import { User, CheckSquare, Edit, Check, X } from '@lucide/svelte';
	import type { TaskWithContext } from '../../types/task';
	import HierarchicalTaskView from '../tasks/HierarchicalTaskView.svelte';
	import TaskLog from '../tasks/TaskLog.svelte';

	const { taskService, authStore, profileService } = getAppServices();
	const { joinTaskContext } = getAppServices().taskContext;

	const featureState = createProfileState(profileService, taskService, joinTaskContext);
	const profileResource = featureState.profile;
	const command = featureState.command;
	const tasksResource = featureState.assigned;
	const taskCommands = createTaskCommands(taskService, loadUserTasks);
	const taskCommand = taskCommands.command;
	onDestroy(() => {
		featureState.dispose();
		taskCommands.dispose();
	});

	let { activeTab } = $props<{
		activeTab: string;
	}>();

	let userTasks = $derived($tasksResource.data.active);
	let resolvedUserTasks = $derived($tasksResource.data.resolved);
	let viewTab = $state<'active' | 'resolved' | 'log'>('active');
	let personalData = $state({
		preferredName: '',
		saving: false
	});

	let profileImageUrl = $derived($authStore.user?.photoURL || '');
	let dataLoaded = $derived($profileResource.status !== 'idle');
	let isEditingName = $state(false);

	// Load data when tab becomes active
	$effect(() => {
		if (activeTab === 'personal' && !dataLoaded) {
			loadPersonalData();
			loadUserTasks();
		}
	});

	async function loadPersonalData() {
		const user = $authStore.user;
		if (!user) return;
		const profile = await featureState.loadProfile(user.uid);
		if (profile === undefined) return;
		personalData.preferredName = profile?.preferredName || user.displayName || '';
		initialData.preferredName = personalData.preferredName;
	}

	async function loadUserTasks() {
		const user = $authStore.user;
		if (user) await featureState.loadTasks(user.uid);
	}

	async function savePersonalData() {
		const user = $authStore.user;
		if (!user) return;
		const name = personalData.preferredName;
		personalData.saving = true;
		try {
			if ((await featureState.save(user.uid, { preferredName: name })).ok) {
				initialData.preferredName = name;
				isEditingName = false;
			}
		} finally {
			personalData.saving = false;
		}
	}

	function handleImageError(event: Event) {
		const target = event.target as HTMLImageElement;
		if (target) {
			target.style.display = 'none';
		}
	}

	// Track initial values to avoid saving on load
	let initialData = $state({
		preferredName: ''
	});

	// Task handlers
	async function handleDeleteTask(task: TaskWithContext) {
		if (confirm('Are you sure you want to delete this task permanently?'))
			await taskCommands.remove(task);
	}
	async function handleResolveTask(task: TaskWithContext) {
		await taskCommands.resolve(task);
	}
	async function handleReactivateTask(task: TaskWithContext) {
		await taskCommands.reactivate(task);
	}
</script>

<StatusOverlay>
	<AsyncStatus state={$taskCommand} pendingLabel="Saving…" />

	<AsyncStatus state={$command} pendingLabel="Saving…" />
	<AsyncStatus state={$profileResource} onRetry={() => void loadPersonalData()} />
	<AsyncStatus state={$tasksResource} onRetry={() => void loadUserTasks()} />
</StatusOverlay>

<div class="flex h-full w-full flex-col overflow-hidden">
	{#if $profileResource.status === 'loading'}
		<div class="flex h-64 items-center justify-center">
			<div
				class="h-6 w-6 animate-spin rounded-full border-2 border-black border-t-transparent"
			></div>
			<span class="ml-2 text-sm text-gray-600">Loading...</span>
		</div>
	{:else}
		<!-- Sticky profile + tabs -->
		<div class="w-full flex-shrink-0 border-b border-borg-brown bg-borg-beige">
			<!-- Profile row -->
			<div class="flex items-center gap-3 px-4 py-3">
				{#if profileImageUrl}
					<div class="h-9 w-9 flex-shrink-0 overflow-hidden rounded-full border border-borg-brown">
						<img
							src={profileImageUrl}
							alt="Profile"
							class="h-full w-full object-cover"
							referrerpolicy="no-referrer"
							onerror={handleImageError}
						/>
					</div>
				{:else}
					<div
						class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-borg-brown bg-white text-sm font-semibold text-zinc-600"
					>
						{($authStore.user?.displayName || '?')[0]}
					</div>
				{/if}
				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-1">
						{#if isEditingName}
							<input
								bind:value={personalData.preferredName}
								type="text"
								placeholder={initialData.preferredName || 'Your preferred name'}
								class="border-b border-zinc-500 bg-transparent px-0 text-sm font-medium text-zinc-800 focus:outline-none"
								onfocus={(e) => e.currentTarget.select()}
							/>
							<button
								onclick={() => {
									savePersonalData();
								}}
								class="p-0.5 text-green-600"><Check class="h-3.5 w-3.5" /></button
							>
							<button
								onclick={() => {
									isEditingName = false;
									personalData.preferredName = initialData.preferredName;
								}}
								class="p-0.5 text-red-500"><X class="h-3.5 w-3.5" /></button
							>
						{:else}
							<span class="text-sm font-semibold text-zinc-800"
								>{personalData.preferredName || $authStore.user?.displayName || 'No name set'}</span
							>
							<button
								onclick={() => (isEditingName = true)}
								class="p-0.5 text-zinc-400 hover:text-zinc-600"><Edit class="h-3 w-3" /></button
							>
						{/if}
						{#if personalData.saving}<div
								class="h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600"
							></div>{/if}
					</div>
					<p class="truncate text-xs text-zinc-500">{$authStore.user?.email}</p>
				</div>
			</div>
			<!-- Tabs -->
			<div class="flex border-t border-borg-brown px-4">
				<button
					onclick={() => (viewTab = 'active')}
					class="px-3 py-2 text-sm font-medium transition-colors {viewTab === 'active'
						? 'border-b-2 border-zinc-700 text-zinc-800'
						: 'text-zinc-400 hover:text-zinc-600'}">Active ({userTasks.length})</button
				>
				<button
					onclick={() => (viewTab = 'resolved')}
					class="px-3 py-2 text-sm font-medium transition-colors {viewTab === 'resolved'
						? 'border-b-2 border-zinc-700 text-zinc-800'
						: 'text-zinc-400 hover:text-zinc-600'}">Resolved ({resolvedUserTasks.length})</button
				>
				<button
					onclick={() => (viewTab = 'log')}
					class="px-3 py-2 text-sm font-medium transition-colors {viewTab === 'log'
						? 'border-b-2 border-zinc-700 text-zinc-800'
						: 'text-zinc-400 hover:text-zinc-600'}">Log</button
				>
			</div>
		</div>

		<div class="flex-1 overflow-y-auto">
			<div class="p-4">
				{#if viewTab === 'active'}
					<HierarchicalTaskView
						tasks={userTasks}
						showActions={true}
						isResolved={false}
						onResolveTask={handleResolveTask}
						onDeleteTask={handleDeleteTask}
					/>
				{:else if viewTab === 'resolved'}
					<HierarchicalTaskView
						tasks={resolvedUserTasks}
						showActions={true}
						isResolved={true}
						onReactivateTask={handleReactivateTask}
						onDeleteTask={handleDeleteTask}
					/>
				{:else if viewTab === 'log'}
					<TaskLog />
				{/if}
			</div>
		</div>
	{/if}
</div>
