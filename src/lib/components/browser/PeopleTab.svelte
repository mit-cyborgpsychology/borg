<script lang="ts">
	import { onDestroy } from 'svelte';
	import { createPeopleState } from '../../features/people/createPeopleState';
	import AsyncStatus from '../AsyncStatus.svelte';
	import StatusOverlay from '../StatusOverlay.svelte';
	import { getAppServices } from '$lib/app/context';
	import { PersonStandingIcon, UserCheck } from '@lucide/svelte';

	const { authStore, userService } = getAppServices();
	const featureState = createPeopleState(userService);
	const resource = featureState.list;
	const pendingResource = featureState.pending;
	const command = featureState.command;
	onDestroy(() => featureState.dispose());

	let { activeTab } = $props<{
		activeTab: string;
	}>();

	let people = $derived($resource.data);
	let searchQuery = $state('');
	let dataLoaded = $derived($resource.status !== 'idle');
	let unapprovedUsers = $derived($pendingResource.data);
	let loadingUnapproved = $derived($pendingResource.status === 'loading');
	let approvalUserTypes = $state<Map<string, 'member' | 'collaborator'>>(new Map());

	// Lazy load data when tab becomes active
	$effect(() => {
		if (activeTab === 'people' && !dataLoaded) {
			loadPeople();
			if ($authStore.userType === 'member') featureState.loadPending();
		}
	});

	async function loadPeople(force = false) {
		if (dataLoaded && !force) return;
		await featureState.load();
	}

	async function approveUser(userId: string) {
		const result = await featureState.approve(userId, approvalUserTypes.get(userId) || 'member');
		if (result.ok) {
			approvalUserTypes.delete(userId);
			approvalUserTypes = new Map(approvalUserTypes);
		}
	}

	function handleUserTypeChange(userId: string, userType: 'member' | 'collaborator') {
		approvalUserTypes.set(userId, userType);
		approvalUserTypes = new Map(approvalUserTypes);
	}

	let filteredPeople = $derived.by(() => {
		if (!searchQuery.trim()) return people;

		const lowercaseQuery = searchQuery.toLowerCase();
		return people.filter(
			(person) =>
				person.name.toLowerCase().includes(lowercaseQuery) ||
				person.email?.toLowerCase().includes(lowercaseQuery)
		);
	});

	// Separate members and collaborators
	let members = $derived(
		filteredPeople.filter((person) => !person.userType || person.userType === 'member')
	);
	let collaborators = $derived(
		filteredPeople.filter((person) => person.userType === 'collaborator')
	);

	function getInitials(name: string) {
		return name
			.split(' ')
			.map((n) => n[0])
			.join('')
			.toUpperCase()
			.slice(0, 2);
	}
</script>

<StatusOverlay>
	<AsyncStatus state={$command} pendingLabel="Saving…" />
	<AsyncStatus state={$resource} onRetry={() => void loadPeople(true)} />
</StatusOverlay>

<div class="flex h-full w-full flex-col overflow-hidden">
	<!-- Toolbar -->
	<div
		class="flex w-full flex-shrink-0 items-center gap-2 border-b border-borg-brown bg-borg-beige px-4 py-2"
	>
		<input
			bind:value={searchQuery}
			type="text"
			placeholder="Search people..."
			class="w-56 rounded border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-black placeholder-zinc-400 focus:border-zinc-400 focus:outline-none"
		/>
	</div>

	<!-- People List -->
	<div class="flex-1 overflow-y-auto px-4 py-4">
		{#if filteredPeople.length == 0}
			<div class="flex h-64 flex-col items-center justify-center text-center">
				<PersonStandingIcon class="mb-2 h-6 w-6 text-zinc-300" />
				<p class="text-sm text-zinc-400">{searchQuery ? 'No people found' : 'No people yet'}</p>
			</div>
		{:else}
			<!-- Members Section -->
			{#if members.length > 0}
				<div class="mb-6">
					<p class="mb-2 text-xs font-medium text-zinc-400">Members ({members.length})</p>
					<div class="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
						{#each members as person}
							<div
								class="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2.5"
							>
								<div
									class="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-100"
								>
									{#if person.photoUrl}
										<img
											src={person.photoUrl}
											alt={person.name}
											referrerpolicy="no-referrer"
											class="h-full w-full object-cover"
										/>
									{:else}
										<span class="text-xs font-medium text-zinc-600">{getInitials(person.name)}</span
										>
									{/if}
								</div>
								<div class="min-w-0">
									<p class="truncate text-sm font-medium text-zinc-800">{person.name}</p>
									{#if person.email}
										<p class="truncate text-xs text-zinc-400">{person.email}</p>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Collaborators Section -->
			{#if collaborators.length > 0}
				<div class="mb-6">
					<p class="mb-2 text-xs font-medium text-zinc-400">
						Collaborators ({collaborators.length})
					</p>
					<div class="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
						{#each collaborators as person}
							<div
								class="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2.5"
							>
								<div
									class="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-100"
								>
									{#if person.photoUrl}
										<img
											src={person.photoUrl}
											alt={person.name}
											referrerpolicy="no-referrer"
											class="h-full w-full object-cover"
										/>
									{:else}
										<span class="text-xs font-medium text-zinc-600">{getInitials(person.name)}</span
										>
									{/if}
								</div>
								<div class="min-w-0">
									<p class="truncate text-sm font-medium text-zinc-800">{person.name}</p>
									{#if person.email}
										<p class="truncate text-xs text-zinc-400">{person.email}</p>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		{/if}

		<!-- Allow People Section (Members Only) -->
		{#if $authStore.userType === 'member'}
			<div class="mt-6 border-t border-zinc-100 pt-4">
				<p class="mb-3 text-xs font-medium text-zinc-400">Pending Approvals</p>
				<AsyncStatus state={$pendingResource} onRetry={() => void featureState.loadPending()} />

				{#if loadingUnapproved}
					<div class="flex items-center gap-2 p-4 text-sm text-zinc-400">
						<div
							class="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-transparent"
						></div>
						Loading...
					</div>
				{:else if unapprovedUsers.length === 0}
					<p class="text-xs text-zinc-400">No pending approvals</p>
				{:else}
					<div class="space-y-2">
						{#each unapprovedUsers as user}
							<div
								class="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2"
							>
								<div class="flex items-center gap-2">
									<div
										class="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-zinc-200"
									>
										{#if user.photoUrl}
											<img
												src={user.photoUrl}
												alt={user.name || user.email}
												referrerpolicy="no-referrer"
												class="h-full w-full object-cover"
											/>
										{:else}
											<span class="text-xs text-zinc-600"
												>{getInitials(user.name || user.email || 'U')}</span
											>
										{/if}
									</div>
									<div>
										<p class="text-sm font-medium text-zinc-800">{user.name || 'Unnamed User'}</p>
										<p class="text-xs text-zinc-400">{user.email}</p>
									</div>
								</div>
								<div class="flex items-center gap-2">
									<select
										value={approvalUserTypes.get(user.id) || 'member'}
										onchange={(e) =>
											handleUserTypeChange(
												user.id,
												e.currentTarget.value as 'member' | 'collaborator'
											)}
										class="rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700"
									>
										<option value="member">Member</option>
										<option value="collaborator">Collaborator</option>
									</select>
									<button
										disabled={$command.status === 'loading'}
										onclick={() => approveUser(user.id)}
										class="flex items-center gap-1 rounded border border-green-200 bg-green-50 px-2 py-1 text-xs text-green-700 transition-colors hover:bg-green-100"
									>
										<UserCheck class="h-3 w-3" />
										Approve
									</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
