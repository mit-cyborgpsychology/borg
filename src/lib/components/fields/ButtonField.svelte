<script lang="ts">
	import { HardDrive, Link, Archive, Globe } from '@lucide/svelte';
	import type { TemplateField } from '../../templates';

	let {
		field,
		value = $bindable(),
		readonly = false,
		mode = 'display'
	} = $props<{
		field: TemplateField;
		value: any;
		readonly?: boolean;
		mode?: 'display' | 'edit';
	}>();

	// Function to get the appropriate icon for a field
	function getFieldIcon(fieldLabel: string): {
		type: 'svg' | 'lucide';
		path?: string;
		component?: any;
	} {
		const label = fieldLabel.toLowerCase();

		// Check for static SVG logos first
		if (label.includes('github')) {
			return { type: 'svg', path: '/github.svg' };
		}
		if (label.includes('google drive') || label.includes('drive')) {
			return { type: 'svg', path: '/googledrive.svg' };
		}
		if (label.includes('overleaf')) {
			return { type: 'svg', path: '/overleaf.svg' };
		}

		// Fall back to Lucide icons
		if (label.includes('arxiv') || label.includes('archive')) {
			return { type: 'lucide', component: Archive };
		}
		if (label.includes('publisher') || label.includes('website')) {
			return { type: 'lucide', component: Globe };
		}
		if (label.includes('dropbox') || label.includes('storage')) {
			return { type: 'lucide', component: HardDrive };
		}

		// Default to Link icon
		return { type: 'lucide', component: Link };
	}
</script>

<div class="field-container">
	{#if mode === 'display'}
		{#if value}
			{@const icon = getFieldIcon(field.label)}
			<button
				onclick={(e) => { e.stopPropagation(); window.open(value, '_blank'); }}
				class="flex w-full items-center justify-center gap-1 rounded-lg bg-black px-2 py-1.5 text-xs font-medium text-white transition-colors hover:bg-borg-violet focus:ring-2 focus:ring-borg-blue focus:ring-offset-2 focus:ring-offset-zinc-900 focus:outline-none"
			>
				{#if icon.type === 'svg'}
					<img src={icon.path} alt="" class="h-4 w-4" />
				{:else if icon.component}
					{@const IconComponent = icon.component}
					<IconComponent class="h-4 w-4" />
				{/if}
				Open {field.label}
			</button>
		{:else}
			<div class="py-1 text-zinc-600">No URL set</div>
		{/if}
	{:else if readonly}
		{#if value}
			{@const icon = getFieldIcon(field.label)}
			<button
				onclick={(e) => { e.stopPropagation(); window.open(value, '_blank'); }}
				class="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-600 px-4 py-3 text-sm font-medium text-white hover:bg-zinc-500 focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 focus:ring-offset-zinc-900 focus:outline-none"
			>
				{#if icon.type === 'svg'}
					<img src={icon.path} alt="" class="h-4 w-4" />
				{:else if icon.component}
					{@const IconComponent = icon.component}
					<IconComponent class="h-4 w-4" />
				{/if}
				Open {field.label}
			</button>
		{:else}
			<div class="py-1 text-black">-</div>
		{/if}
	{:else}
		<label class="mb-1 block text-sm font-medium text-zinc-600" for={field.id}>
			{field.label}
		</label>
		<input
			id={field.id}
			type="url"
			bind:value
			placeholder="Enter URL..."
			class="w-full rounded border border-zinc-200 bg-white px-3 py-2 text-black placeholder-zinc-400 focus:border-borg-blue focus:outline-none"
		/>
	{/if}
</div>