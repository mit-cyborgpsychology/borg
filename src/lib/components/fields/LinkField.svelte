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
	function getFieldIcon(fieldLabel: string, url: string = ''): {
		type: 'svg' | 'lucide';
		path?: string;
		component?: any;
	} {
		const label = fieldLabel.toLowerCase();
		const urlLower = url.toLowerCase();

		// First check URL for Google services
		if (url) {
			if (urlLower.includes('docs.google.com/document') || urlLower.includes('docs.google.com')) {
				return { type: 'svg', path: '/docs.svg' };
			}
			if (urlLower.includes('docs.google.com/spreadsheets') || urlLower.includes('sheets.google.com')) {
				return { type: 'svg', path: '/sheets.svg' };
			}
			if (urlLower.includes('docs.google.com/presentation') || urlLower.includes('slides.google.com')) {
				return { type: 'svg', path: '/slides.svg' };
			}
			if (urlLower.includes('drive.google.com')) {
				return { type: 'svg', path: '/googledrive.svg' };
			}
		}

		// Check for static SVG logos from field label
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
			{@const icon = getFieldIcon(field.label, value)}
			<button
				onclick={(e) => { e.stopPropagation(); window.open(value, '_blank'); }}
				class="flex w-full items-center justify-center gap-1 rounded-lg bg-borg-brown/80 p-2 text-xs font-medium transition-colors hover:bg-borg-brown/60 focus:ring-2 focus:ring-borg-blue focus:ring-offset-2 focus:ring-offset-zinc-900 focus:outline-none"
			>
				{#if icon.type === 'svg'}
					<img src={icon.path} alt="" class="mr-1 h-4 w-4" />
				{:else if icon.component}
					{@const IconComponent = icon.component}
					<IconComponent class="mr-1 h-4 w-4" />
				{/if}
				Open {field.label}
			</button>
		{:else}
			<div class="py-1 text-zinc-600">No link set</div>
		{/if}
	{:else if readonly}
		{#if value}
			<a
				href={value}
				target="_blank"
				rel="noopener noreferrer"
				class="text-blue-400 underline hover:text-blue-300"
			>
				{value}
			</a>
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
			placeholder={field.placeholder}
			class="w-full rounded border border-zinc-700 bg-white px-3 py-2 text-black placeholder-zinc-400 focus:border-borg-blue focus:outline-none"
		/>
	{/if}
</div>