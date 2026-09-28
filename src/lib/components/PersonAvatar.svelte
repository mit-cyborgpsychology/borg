<script lang="ts">
	let {
		name,
		photoUrl,
		size = 'small'
	} = $props<{
		name: string;
		photoUrl?: string | null;
		size?: 'tiny' | 'small' | 'profile';
	}>();
	let failedUrl = $state<string | null>(null);
	const initials = $derived(
		name
			.trim()
			.split(/\s+/)
			.map((part) => part[0])
			.slice(0, 2)
			.join('')
			.toUpperCase() || '?'
	);
	const tones = [
		'bg-sky-100 text-sky-700',
		'bg-violet-100 text-violet-700',
		'bg-emerald-100 text-emerald-700',
		'bg-amber-100 text-amber-700'
	];
	const tone = $derived(
		tones[Array.from(name).reduce((sum, char) => sum + char.charCodeAt(0), 0) % tones.length]
	);
</script>

<span
	title={name}
	role="img"
	aria-label={name}
	class="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-sans font-semibold ring-1 ring-black/5 {tone} {size ===
	'profile'
		? 'h-12 w-12 text-base'
		: size === 'tiny'
			? 'h-4 w-4 text-[7px]'
			: 'h-6 w-6 text-[9px]'}"
>
	{#if photoUrl && failedUrl !== photoUrl}
		<img
			src={photoUrl}
			alt=""
			referrerpolicy="no-referrer"
			onerror={() => (failedUrl = photoUrl || null)}
			class="h-full w-full object-cover"
		/>
	{:else}{initials}{/if}
</span>
