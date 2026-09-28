<script lang="ts">
	import '../app.css';
	import LoginRequired from '$lib/components/auth/LoginRequired.svelte';
	import { onMount, untrack } from 'svelte';
	import { createAppServices } from '$lib/app/createAppServices';
	import { provideAppServices } from '$lib/app/context';

	const services = createAppServices();
	const { authStore } = services;
	onMount(() => {
		services.start();
		return () => services.dispose();
	});
	provideAppServices(services);
	$effect(() => {
		$authStore.user?.uid;
		untrack(() => {
			services.peopleCache.clear();
			services.taskContext.clear();
		});
	});

	let { children } = $props();
</script>

<LoginRequired>
	{@render children()}
</LoginRequired>
