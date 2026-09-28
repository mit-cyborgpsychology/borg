<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { Check, Pencil, X } from '@lucide/svelte';
	import { createProfileState } from '$lib/features/profile/createProfileState';
	import { getAppServices } from '$lib/app/context';
	import AsyncStatus from '../AsyncStatus.svelte';
	import StatusOverlay from '../StatusOverlay.svelte';
	import TaskWorkspace from '../tasks/TaskWorkspace.svelte';
	import PersonAvatar from '../PersonAvatar.svelte';
	let { activeTab } = $props<{ activeTab: string }>();
	const { taskService, authStore, profileService, taskContext, projectsService } = getAppServices();
	const feature = createProfileState(
		profileService,
		taskService,
		taskContext.joinTaskContext,
		projectsService
	);
	const profile = feature.profile;
	const tasks = feature.assigned;
	const command = feature.command;
	onDestroy(() => feature.dispose());
	let editingName = $state(false);
	let name = $state('');
	let nameInput = $state<HTMLInputElement>();
	const displayName = $derived(
		$profile.data?.preferredName || $authStore.user?.displayName || 'Your name'
	);
	const saving = $derived($command.status === 'loading');
	$effect(() => {
		if (activeTab !== 'personal' || !$authStore.user) return;
		if ($profile.status === 'idle') void loadProfile();
		if ($tasks.status === 'idle') void loadTasks();
	});
	async function loadProfile() {
		if ($authStore.user) await feature.loadProfile($authStore.user.uid);
	}
	async function loadTasks() {
		if ($authStore.user) await feature.loadTasks($authStore.user.uid);
	}
	async function editName() {
		name = $profile.data?.preferredName || $authStore.user?.displayName || '';
		editingName = true;
		await tick();
		nameInput?.focus();
		nameInput?.select();
	}
	async function saveName(event: SubmitEvent) {
		event.preventDefault();
		if (saving || !$authStore.user || !name.trim()) return;
		if ((await feature.save($authStore.user.uid, { preferredName: name.trim() })).ok)
			editingName = false;
	}
</script>

<StatusOverlay>
	<AsyncStatus state={$profile} onRetry={() => void loadProfile()} />
	<AsyncStatus state={$tasks} onRetry={() => void loadTasks()} />
</StatusOverlay>
<div class="flex h-full min-h-0 flex-col overflow-hidden">
	<div class="z-10 mx-auto w-full max-w-6xl shrink-0 bg-white px-4 pt-4 pb-3">
		<div class="flex items-center gap-3 py-2">
			<PersonAvatar name={displayName} photoUrl={$authStore.user?.photoURL} size="profile" />
			<div class="min-w-0 flex-1">
				{#if editingName}
					<form onsubmit={saveName} class="flex items-center gap-2">
						<input
							bind:this={nameInput}
							bind:value={name}
							aria-label="Preferred name"
							required
							disabled={saving}
							onkeydown={(event) => {
								if (event.key === 'Escape' && !saving) editingName = false;
							}}
							class="max-w-64 min-w-0 flex-1 rounded-md border border-zinc-200 px-2 py-1 font-sans text-sm outline-none focus:border-zinc-400"
						/>
						<button
							type="submit"
							disabled={saving || !name.trim()}
							aria-label="Save name"
							class="rounded p-1 text-zinc-600 hover:bg-zinc-100 disabled:opacity-40"
							><Check class="h-4 w-4" /></button
						>
						<button
							type="button"
							disabled={saving}
							onclick={() => (editingName = false)}
							aria-label="Cancel name edit"
							class="rounded p-1 text-zinc-400 hover:bg-zinc-100"><X class="h-4 w-4" /></button
						>
					</form>
				{:else}
					<button
						type="button"
						onclick={() => void editName()}
						aria-label="Edit preferred name"
						class="group flex max-w-full items-center gap-2 text-left"
						><span class="truncate font-sans text-base font-semibold text-zinc-800"
							>{displayName}</span
						><Pencil class="h-3 w-3 shrink-0 text-zinc-400" /></button
					>
				{/if}
				<p class="mt-1 truncate text-xs text-zinc-400">{$authStore.user?.email}</p>
			</div>
		</div>
		<AsyncStatus state={$command} pendingLabel="Saving name…" />
	</div>
	<div class="min-h-0 flex-1 overflow-auto p-4 md:overflow-hidden">
		<div class="mx-auto w-full max-w-6xl md:h-full">
			<TaskWorkspace
				active={$tasks.data.active}
				completed={$tasks.data.resolved}
				personal
				loading={$tasks.status === 'idle' || $tasks.status === 'loading'}
				onRefresh={loadTasks}
				hasMore={{
					active: !!$tasks.data.cursors.active,
					completed: !!$tasks.data.cursors.completed
				}}
				pageNumbers={$tasks.data.pageNumbers}
				onPageChange={(view, direction) => feature.changePage(view, direction)}
				projects={$tasks.data.projects}
				project={$tasks.data.selectedProject}
				onProjectChange={(value) => feature.selectProject(value)}
			/>
		</div>
	</div>
</div>
