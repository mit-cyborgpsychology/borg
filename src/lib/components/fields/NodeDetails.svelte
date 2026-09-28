<script lang="ts">
	import { tick } from 'svelte';
	import { Eye, EyeOff, Plus, X, Undo2 } from '@lucide/svelte';
	import type { TemplateField } from '../../templates';
	import { createNodeDetail, inferDetailValue } from '$lib/features/canvas/nodeDetails';
	import FieldRenderer from './FieldRenderer.svelte';

	let {
		fields = $bindable(),
		data = $bindable(),
		templateFields
	} = $props<{
		fields: TemplateField[];
		data: Record<string, any>;
		templateFields: TemplateField[];
	}>();
	let adding = $state(false);
	let name = $state('');
	let value = $state('');
	let error = $state('');
	let format = $derived(inferDetailValue(value).type);
	let removed = $state<{
		field: TemplateField;
		value: unknown;
		hadValue: boolean;
		index: number;
	} | null>(null);
	let addButton = $state<HTMLButtonElement>();

	function focusName(input: HTMLInputElement) {
		input.focus();
	}
	function reset() {
		adding = false;
		name = '';
		value = '';
		error = '';
	}
	async function cancel() {
		reset();
		await tick();
		addButton?.focus();
	}
	function handleDraftKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			void cancel();
		}
	}
	async function add() {
		try {
			const detail = createNodeDetail(`custom_${crypto.randomUUID()}`, name, value, [
				...templateFields,
				...fields
			]);
			fields = [...fields, detail.field];
			data = { ...data, [detail.field.id]: detail.value };
			removed = null;
			reset();
			await tick();
			document.getElementById(detail.field.id)?.focus();
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Could not add detail.';
		}
	}
	function toggleVisibility(id: string) {
		fields = fields.map((field: TemplateField) =>
			field.id === id ? { ...field, showInDisplay: !(field.showInDisplay ?? true) } : field
		);
	}
	function remove(field: TemplateField, index: number) {
		removed = { field, index, value: data[field.id], hadValue: Object.hasOwn(data, field.id) };
		fields = fields.filter((item: TemplateField) => item.id !== field.id);
		const remaining = { ...data };
		delete remaining[field.id];
		data = remaining;
	}
	function undo() {
		if (!removed) return;
		const next = [...fields];
		next.splice(Math.min(removed.index, next.length), 0, removed.field);
		fields = next;
		if (removed.hadValue) data = { ...data, [removed.field.id]: removed.value };
		removed = null;
	}
</script>

<section class="border-b border-zinc-200 px-4 py-4" aria-label="Details">
	<div class="flex items-center justify-between gap-2">
		<h3 class="font-sans text-xs font-semibold text-zinc-900">Details</h3>
		<button
			bind:this={addButton}
			type="button"
			onclick={() => {
				if (adding) void cancel();
				else adding = true;
			}}
			aria-expanded={adding}
			class="flex items-center gap-1 rounded py-1 text-xs text-zinc-500 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-zinc-400"
		>
			<Plus class="h-3 w-3" />Add detail
		</button>
	</div>

	{#if fields.length > 0}
		<div class="mt-3 space-y-4">
			{#each fields as field, index (field.id)}
				{@const visible = field.showInDisplay ?? true}
				<div role="group" aria-label={field.label}>
					<div class="mb-1 flex items-center justify-between gap-2">
						<span
							class="min-w-0 truncate text-[11px] font-medium text-zinc-500"
							title={field.label}
							aria-hidden="true">{field.label}</span
						>
						<div class="flex shrink-0 gap-1">
							<button
								type="button"
								onclick={() => toggleVisibility(field.id)}
								aria-pressed={visible}
								aria-label={`${visible ? 'Hide' : 'Show'} ${field.label} on canvas`}
								title={visible ? 'Hide on canvas' : 'Show on canvas'}
								class="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
							>
								{#if visible}<Eye class="h-3 w-3" />{:else}<EyeOff class="h-3 w-3" />{/if}
							</button>
							<button
								type="button"
								onclick={() => remove(field, index)}
								aria-label={`Remove ${field.label}`}
								title="Remove detail"
								class="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
								><X class="h-3 w-3" /></button
							>
						</div>
					</div>
					<div class="detail-value">
						<FieldRenderer {field} bind:value={data[field.id]} mode="edit" nodeData={data} />
					</div>
				</div>
			{/each}
		</div>
	{/if}

	{#if removed}
		<div
			role="status"
			class="mt-3 flex items-center justify-between gap-2 text-[11px] text-zinc-500"
		>
			<span class="truncate">{removed.field.label} removed</span>
			<button
				type="button"
				onclick={undo}
				class="flex shrink-0 items-center gap-1 rounded px-1 py-0.5 hover:bg-zinc-100"
				><Undo2 class="h-3 w-3" />Undo</button
			>
		</div>
	{/if}

	{#if adding}
		<form
			aria-label="Add detail"
			class="mt-3 space-y-2 rounded-md border border-zinc-200 bg-zinc-50/50 p-2"
			onsubmit={(event) => {
				event.preventDefault();
				void add();
			}}
		>
			<input
				use:focusName
				aria-label="Detail name"
				onkeydown={handleDraftKeydown}
				oninput={() => (error = '')}
				bind:value={name}
				placeholder="Name"
				aria-invalid={!!error}
				class="w-full rounded border bg-white px-2 py-1.5 outline-none"
			/>
			<textarea
				aria-label="Detail value"
				onkeydown={handleDraftKeydown}
				bind:value
				rows="2"
				placeholder="Value"
				class="block w-full resize-y rounded border bg-white px-2 py-1.5 outline-none"
			></textarea>
			{#if error}<p role="alert" class="text-[11px] text-red-600">{error}</p>{/if}
			<div class="flex items-center justify-between gap-2">
				<span class="text-[10px] text-zinc-400" title="Detected format"
					>{format === 'link' ? 'Link' : format === 'date' ? 'Date' : ''}</span
				>
				<div class="flex gap-2">
					<button
						type="button"
						onclick={cancel}
						class="rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100">Cancel</button
					>
					<button
						type="submit"
						disabled={!name.trim() || !value.trim()}
						class="rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-40"
						>Add</button
					>
				</div>
			</div>
		</form>
	{/if}
</section>

<style>
	/* Keep the renderer's accessible labels without repeating the row heading. */
	.detail-value :global(.field-container > label),
	.detail-value :global(.field-container > span:first-child) {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
		border: 0;
	}
</style>
