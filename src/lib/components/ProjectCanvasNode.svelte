<script lang="ts">
	import { getCanvasActions } from '$lib/features/canvas/context';
	const canvasActions = getCanvasActions();
	import { getAppServices } from '$lib/app/context';
	import { Handle, Position } from '@xyflow/svelte';
	import { CircleDashed, PencilRuler, CheckCircle, Shield } from '@lucide/svelte';
	import type { Person } from '$lib/types/people';
	const { getPersonCached } = getAppServices().peopleCache;

	let { data, id } = $props<{ data: any; id: string }>();

	let nodeData = $derived(data.nodeData || {});

	// Collaborator data — reads from the shared people cache (one fetch per
	// unique person ID across the whole app, not per-node), falling back to
	// a placeholder (ID as name) for any collaborator the cache can't resolve.
	let collaboratorsData = $derived.by(() => {
		const collaboratorIds = nodeData.collaborators;
		if (!collaboratorIds || !Array.isArray(collaboratorIds)) return [];

		return collaboratorIds
			.filter(
				(collaboratorId: unknown): collaboratorId is string => typeof collaboratorId === 'string'
			)
			.map((collaboratorId: string): Person => {
				const cached = getPersonCached(collaboratorId, nodeData.projectSlug);
				if (cached) return cached;
				return {
					id: collaboratorId,
					name: collaboratorId,
					email: undefined,
					photoUrl: undefined,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString()
				};
			});
	});

	// Helper function to get initials from name
	function getInitials(name: string): string {
		return name
			.split(' ')
			.map((n) => n[0])
			.join('')
			.toUpperCase()
			.slice(0, 2);
	}

	// Determine border color based on status
	let borderColor = $derived.by(() => {
		const status = nodeData.status;
		if (status === 'To Do') return '#9333ea'; // purple-600
		if (status === 'Doing') return '#0284c7'; // sky-600
		if (status === 'Done') return '#16a34a'; // green-600
		return '#d4d4d8'; // zinc-300 - default
	});

	function handleNodeClick() {
		// Dispatch the edit event to navigate to project
		canvasActions.nodeEdit({
			nodeId: id,
			nodeData: nodeData,
			templateType: data.templateType
		});
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div>
	<!-- Main Node Container -->
	<div
		class="group relative max-w-64 min-w-48 cursor-pointer rounded-lg border bg-white transition-all duration-200"
		style="border-color: {borderColor};"
		onclick={handleNodeClick}
	>
		<div class="flex flex-col gap-1 p-2">
			<!-- Project Title -->
			<h3 class="mr-1 text-lg leading-snug font-semibold text-black">
				{nodeData.title || 'Untitled Project'}
			</h3>

			<div class="flex gap-1.5">
				<!-- Collaborators -->
				{#if nodeData.collaborators && nodeData.collaborators.length > 0}
					{#each collaboratorsData.slice(0, 5) as collaborator}
						<div
							class="flex h-4 w-4 items-center justify-center overflow-hidden rounded-full border border-black"
							title={collaborator.name || collaborator.email || 'User'}
						>
							{#if collaborator.photoUrl}
								<img
									src={collaborator.photoUrl}
									alt={collaborator.name || collaborator.email || 'User'}
									class="h-full w-full object-cover"
									referrerpolicy="no-referrer"
								/>
							{:else}
								<div
									class="flex h-full w-full items-center justify-center bg-borg-green text-xs font-medium text-white"
								>
									{getInitials(collaborator.name || collaborator.email || 'U')}
								</div>
							{/if}
						</div>
					{/each}
					{#if nodeData.collaborators.length > 5}
						<div
							class="flex h-4 w-4 items-center justify-center rounded-full border border-black bg-gray-300 text-[9px] font-medium text-gray-700"
							title="{nodeData.collaborators.length - 5} more collaborators"
						>
							+{nodeData.collaborators.length - 5}
						</div>
					{/if}
				{:else}
					<!-- <div class="flex items-center gap-2 text-sm text-gray-500">
					<Shield class="h-4 w-4" />
					<span>No collaborators</span>
				</div> -->
				{/if}
			</div>
		</div>

		<!-- Task Counts Section (Bottom Box like UniversalNode) -->
		<!-- {#if totalTaskCount > 0 || projectStatusCounts.todo > 0 || projectStatusCounts.doing > 0 || projectStatusCounts.done > 0}
			<div
				class="relative w-full cursor-pointer rounded-b-lg border-t bg-borg-beige p-3"
				style="border-color: {borderColor};"
				onclick={handleNodeClick}
			>
				<div class="text-xs text-zinc-600">
					<span class="font-semibold">{totalTaskCount} Task{totalTaskCount > 1 ? 's' : ''}</span>
					|
					<span class="inline-flex items-center gap-1">
						<span class="h-2 w-2 rounded-full border border-black bg-purple-500"></span>
						{projectStatusCounts.todo}
					</span>
					<span class="inline-flex items-center gap-1">
						<span class="h-2 w-2 rounded-full border border-black bg-sky-500"></span>
						{projectStatusCounts.doing}
					</span>
					<span class="inline-flex items-center gap-1">
						<span class="h-2 w-2 rounded-full border border-black bg-green-500"></span>
						{projectStatusCounts.done}
					</span>
				</div>
			</div>
		{/if} -->

		<!-- Connection Handles -->
		<Handle type="target" position={Position.Left} class="!h-2 !w-2 !bg-zinc-600" />
		<Handle type="source" position={Position.Right} class="!h-2 !w-2 !bg-zinc-600" />
	</div>
</div>
