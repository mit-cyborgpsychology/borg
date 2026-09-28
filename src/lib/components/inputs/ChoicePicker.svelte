<script lang="ts">
	import { tick } from 'svelte';
	import { Check, ChevronDown, Search } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	type Choice = { value: string; label: string; detail?: string };

	let {
		label,
		value = $bindable(''),
		options,
		placeholder = 'Choose…',
		disabled = false,
		resetAfterSelect = false,
		onchange,
		children,
		leading
	} = $props<{
		label: string;
		value?: string;
		options: Choice[];
		placeholder?: string;
		disabled?: boolean;
		resetAfterSelect?: boolean;
		onchange?: (value: string) => void;
		children?: Snippet;
		leading?: Snippet<[string]>;
	}>();
	const id = $props.id();
	let open = $state(false);
	let query = $state('');
	let trigger: HTMLButtonElement;
	let search = $state<HTMLInputElement>();
	let choices = $state<HTMLDivElement>();
	const selected = $derived(options.find((option: Choice) => option.value === value));
	const filtered = $derived(
		options.filter((option: Choice) =>
			`${option.label} ${option.detail ?? ''}`.toLowerCase().includes(query.toLowerCase())
		)
	);
	async function toggle() {
		open = !open;
		query = '';
		if (open) {
			await tick();
			search?.focus();
		}
	}
	function choose(next: string) {
		value = resetAfterSelect ? '' : next;
		onchange?.(next);
		open = false;
		trigger?.focus();
	}
	function keyboard(event: KeyboardEvent) {
		if (event.key === 'Escape' && open) {
			event.stopPropagation();
			event.preventDefault();
			open = false;
			trigger?.focus();
		} else if (
			open &&
			['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) &&
			!(event.target === search && ['Home', 'End'].includes(event.key))
		) {
			const buttons = Array.from(choices?.querySelectorAll<HTMLButtonElement>('button') ?? []);
			if (!buttons.length) return;
			event.preventDefault();
			const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
			const next =
				event.key === 'Home'
					? 0
					: event.key === 'End'
						? buttons.length - 1
						: (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
			buttons[next]?.focus();
		} else if (open && event.key === 'Enter' && event.target === search) {
			event.preventDefault();
			if (filtered[0]) choose(filtered[0].value);
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="nodrag nopan w-full min-w-0"
	onkeydown={keyboard}
	onfocusout={(event) => {
		if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget))
			open = false;
	}}
>
	<button
		bind:this={trigger}
		type="button"
		{disabled}
		aria-label={label}
		aria-describedby={`${id}-selected`}
		aria-expanded={open}
		aria-controls={id}
		onclick={toggle}
		class="flex w-full items-center justify-between gap-2 rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-borg-blue disabled:opacity-50"
	>
		{#if selected}{@render leading?.(selected.value)}{/if}
		<span id={`${id}-selected`} class="min-w-0 flex-1 truncate"
			>{selected?.label ?? (value || placeholder)}</span
		><ChevronDown class="h-3.5 w-3.5 shrink-0" />
	</button>
	{#if open && !disabled}
		<div {id} class="mt-1 rounded-md border border-zinc-200 bg-zinc-50 p-1.5">
			<div class="flex items-center gap-2 px-1.5">
				<Search class="h-3.5 w-3.5 shrink-0 text-zinc-400" />
				<input
					bind:this={search}
					bind:value={query}
					aria-label="Search {label.toLowerCase()}"
					placeholder="Search…"
					class="min-w-0 flex-1 bg-transparent py-2 text-xs outline-none"
				/>
			</div>
			{#if children}<div class="mt-3 mb-2">{@render children()}</div>{/if}
			<div
				bind:this={choices}
				class="max-h-48 space-y-0.5 overflow-auto"
				aria-label="{label} choices"
			>
				{#each filtered as option (option.value)}
					<button
						type="button"
						aria-pressed={value === option.value}
						onclick={() => choose(option.value)}
						class="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs hover:bg-white focus:bg-white focus-visible:outline-2 focus-visible:outline-borg-blue"
					>
						{@render leading?.(option.value)}
						<span class="min-w-0 flex-1"
							><span class="block truncate">{option.label}</span>{#if option.detail}<span
									class="mt-0.5 block text-[10px] text-zinc-500">{option.detail}</span
								>{/if}</span
						>
						{#if value === option.value}<Check class="h-3.5 w-3.5 shrink-0" />{/if}
					</button>
				{:else}<p class="px-2 py-3 text-xs text-zinc-500">No matches</p>{/each}
			</div>
		</div>
	{/if}
</div>
