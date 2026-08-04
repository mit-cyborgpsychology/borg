<script lang="ts">
	import { Handle, Position } from '@xyflow/svelte';
	import { Edit, Trash2, FileText, ExternalLink } from '@lucide/svelte';
	import { outlineService } from '../../services/instances';

	let { data, id } = $props<{
		data: any;
		id: string;
		isBeingEdited?: boolean;
	}>();

	let nodeData = $derived(data.nodeData || {});
	let isCreating = $state(false);

	// Same projectSlug derivation pattern as UniversalNode.svelte
	let projectSlug = $derived(
		data.projectSlug ||
			(() => {
				if (typeof window !== 'undefined') {
					const pathParts = window.location.pathname.split('/');
					return pathParts[2]; // /project/[slug]/...
				}
				return null;
			})()
	);

	let displayTitle = $derived(nodeData.title || 'Untitled Doc');

	function handleEdit(e: MouseEvent) {
		e.stopPropagation();
		const event = new CustomEvent('nodeEdit', {
			detail: {
				nodeId: id,
				nodeData: nodeData,
				templateType: data.templateType
			}
		});
		document.dispatchEvent(event);
	}

	function handleDelete(e: MouseEvent) {
		e.stopPropagation();
		if (confirm('Are you sure you want to delete this outline node?')) {
			const event = new CustomEvent('nodeDelete', { detail: { nodeId: id } });
			document.dispatchEvent(event);
		}
	}

	async function handleOpenDoc(e: MouseEvent) {
		e.stopPropagation();

		// If a doc already exists, just open it — no network call needed
		if (nodeData.outlineUrl) {
			window.open(nodeData.outlineUrl, '_blank');
			return;
		}

		if (isCreating) return;
		if (!projectSlug) {
			alert('Cannot create an Outline doc outside a project.');
			return;
		}
		isCreating = true;
		try {
			const doc = await outlineService.createDoc(projectSlug, nodeData.title || 'Untitled Doc');

			const updatedNodeData = {
				...nodeData,
				outlineDocId: doc.id,
				outlineUrl: doc.url
			};

			data.nodeData = updatedNodeData;

			const event = new CustomEvent('nodeUpdate', {
				detail: {
					nodeId: id,
					data: {
						nodeData: updatedNodeData
					}
				}
			});
			document.dispatchEvent(event);

			window.open(doc.url, '_blank');
		} finally {
			isCreating = false;
		}
	}

	function handleOpenInNewTab(e: MouseEvent) {
		e.stopPropagation();
		if (nodeData.outlineUrl) {
			window.open(nodeData.outlineUrl, '_blank');
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="group relative">
	<div
		class="outline-node relative rounded-lg border bg-white p-3 transition-all duration-200"
		style="min-width: 160px; max-width: 220px; border-color: #3b82f6;"
	>
		<!-- Doc icon and title -->
		<div class="flex items-center gap-2">
			<FileText class="h-4 w-4 text-blue-500" />
			<span class="truncate text-sm font-medium text-gray-800">
				{displayTitle}
			</span>
		</div>

		<!-- Open doc button -->
		<button
			class="mt-2 w-full rounded-lg bg-borg-brown/80 p-2 text-xs font-medium transition-colors hover:bg-borg-brown/60 focus:outline-none focus:ring-2 focus:ring-borg-blue disabled:opacity-50"
			onclick={handleOpenDoc}
			disabled={isCreating}
		>
			{#if nodeData.outlineUrl}
				Open Doc [↗]
			{:else if isCreating}
				Creating...
			{:else}
				Create Doc [↗]
			{/if}
		</button>

		<!-- Connection handles -->
		<Handle type="target" position={Position.Left} class="!h-2 !w-2 !bg-zinc-600" />
		<Handle type="source" position={Position.Right} class="!h-2 !w-2 !bg-zinc-600" />
	</div>

	<!-- Action buttons -->
	<div class="absolute -top-5 right-0 flex gap-1">
		{#if nodeData.outlineUrl}
			<button
				onclick={handleOpenInNewTab}
				class="flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
				title="Open in new tab"
				aria-label="Open in new tab"
			>
				<ExternalLink class="h-3 w-3 text-gray-700 hover:text-borg-orange" />
			</button>
		{/if}
		<button
			onclick={handleEdit}
			class="flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
			title="Edit node"
			aria-label="Edit node"
		>
			<Edit class="h-3 w-3 text-gray-700 hover:text-borg-orange" />
		</button>
		<button
			class="flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
			title="Delete outline node"
			aria-label="Delete outline node"
			onclick={handleDelete}
		>
			<Trash2 class="h-3 w-3 text-gray-700 hover:text-borg-orange" />
		</button>
	</div>
</div>

<style>
	.outline-node {
		user-select: none;
	}
</style>
