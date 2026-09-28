<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import type { TemplateField } from '$lib/templates';
	import LinkUrlInput from './LinkUrlInput.svelte';
	import FieldVisibilityToggle from './FieldVisibilityToggle.svelte';
	import { Square, PanelsTopLeft, Plus, X, Undo2 } from '@lucide/svelte';

	let {
		value = $bindable(),
		fields = $bindable(),
		fieldActions
	} = $props<{
		value: Record<string, any>;
		fields: TemplateField[];
		fieldActions?: Snippet<[fieldId: string]>;
	}>();
	let links = $derived(fields.filter((field: TemplateField) => field.type === 'link'));
	let addButton = $state<HTMLButtonElement>();
	let removed = $state<{ field: TemplateField; value: unknown; index: number } | null>(null);

	async function addLink() {
		const id = `link_${crypto.randomUUID()}`;
		fields = [...fields, { id, label: 'Link', type: 'link', showInDisplay: true }];
		value = { ...value, [id]: '' };
		removed = null;
		await tick();
		document.getElementById(id)?.focus();
	}

	function toggleVisibility(id: string) {
		fields = fields.map((field: TemplateField) =>
			field.id === id ? { ...field, showInDisplay: !(field.showInDisplay ?? true) } : field
		);
	}

	async function removeLink(field: TemplateField) {
		removed = {
			field,
			value: value[field.id],
			index: fields.findIndex((item: TemplateField) => item.id === field.id)
		};
		fields = fields.filter((item: TemplateField) => item.id !== field.id);
		const remaining = { ...value };
		delete remaining[field.id];
		value = remaining;
		await tick();
		addButton?.focus();
	}

	async function undoRemove() {
		if (!removed) return;
		const { field, value: url, index } = removed;
		const next = [...fields];
		next.splice(index, 0, field);
		fields = next;
		value = { ...value, [field.id]: url ?? '' };
		removed = null;
		await tick();
		document.getElementById(field.id)?.focus();
	}
</script>

<section class="border-b border-zinc-200 px-4 py-4" aria-label="Link content">
	<div class="space-y-3">
		<LinkUrlInput id="url" bind:value={value.url} focusWhenEmpty>
			{#snippet actions()}{@render fieldActions?.('url')}{/snippet}
		</LinkUrlInput>
		{#each links as field, index (field.id)}
			{@const label = `URL ${index + 2}`}
			<LinkUrlInput id={field.id} {label} bind:value={value[field.id]}>
				{#snippet actions()}
					<FieldVisibilityToggle
						{label}
						visible={field.showInDisplay ?? true}
						ontoggle={() => toggleVisibility(field.id)}
					/>
					<button
						type="button"
						aria-label={`Remove ${label}`}
						title="Remove link"
						onclick={() => removeLink(field)}
						class="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
						><X class="h-3 w-3" /></button
					>
				{/snippet}
			</LinkUrlInput>
		{/each}
		<div class="flex items-center justify-between gap-2">
			<button
				bind:this={addButton}
				type="button"
				onclick={addLink}
				class="flex items-center gap-1 rounded py-1 text-xs text-zinc-500 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-zinc-400"
				><Plus class="h-3 w-3" />Add link</button
			>
			{#if removed}
				<div role="status" class="flex items-center gap-2 text-[11px] text-zinc-500">
					<span>Link removed</span>
					<button
						type="button"
						onclick={undoRemove}
						class="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-zinc-100"
					>
						<Undo2 class="h-3 w-3" />Undo
					</button>
				</div>
			{/if}
		</div>
		<div>
			<div class="mb-1 flex min-h-5 items-center justify-between gap-2">
				<label for="description" class="!mb-0">Description</label>
				{@render fieldActions?.('description')}
			</div>
			<textarea
				id="description"
				aria-label="Description"
				rows="2"
				bind:value={value.description}
				placeholder="Description…"
				class="block w-full resize-y rounded border px-2 py-1.5 outline-none"
			></textarea>
		</div>
	</div>
</section>

<section class="border-b border-zinc-200 px-4 py-4" aria-label="Link display">
	<h3 class="mb-2 font-sans text-xs font-semibold text-zinc-900">View as</h3>
	<div role="group" aria-label="Link display mode" class="flex gap-1 rounded-md bg-zinc-100 p-1">
		{#each ['Node', 'Iframe'] as mode}
			<button
				type="button"
				aria-pressed={(value.viewMode || 'Node') === mode}
				onclick={() => (value.viewMode = mode)}
				title={mode === 'Node' ? 'Compact card' : 'Embedded website; some sites block embedding'}
				class="flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-zinc-400 {(value.viewMode ||
					'Node') === mode
					? 'bg-white text-zinc-800 shadow-sm'
					: 'text-zinc-500 hover:text-zinc-700'}"
			>
				{#if mode === 'Node'}
					<Square class="h-3.5 w-3.5" aria-hidden="true" />
				{:else}
					<PanelsTopLeft class="h-3.5 w-3.5" aria-hidden="true" />
				{/if}
				{mode}
			</button>
		{/each}
	</div>
</section>
