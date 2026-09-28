<script lang="ts">
	import { getAppServices } from '$lib/app/context';
	import GoogleLoginButton from './GoogleLoginButton.svelte';
	import type { Snippet } from 'svelte';

	const { authStore, authService } = getAppServices();
	let { children }: { children?: Snippet } = $props();
	let { user, isApproved, loading } = $derived($authStore);

	async function handleSignIn() {
		try {
			await authService.signInWithGoogle();
		} catch (error) {
			console.error('Login failed:', error);
		}
	}
</script>

{#if loading}
	<div class="flex min-h-screen items-center justify-center">
		<div class="text-zinc-400">Loading...</div>
	</div>
{:else if !user}
	<div class="flex min-h-screen items-center justify-center bg-zinc-900">
		<div class="text-center">
			<!-- <h1 class="text-2xl font-bold text-zinc-100 mb-4">Welcome to Borg</h1>
			<p class="text-zinc-400 mb-6">Please sign in to access the lab workspace</p> -->
			<GoogleLoginButton onclick={handleSignIn} />
			{#if $authStore.error}<p role="alert" class="mt-3 text-sm text-red-400">
					{$authStore.error}
				</p>{/if}
		</div>
	</div>
{:else if !isApproved}
	<div class="flex min-h-screen items-center justify-center bg-zinc-900">
		<div class="text-center">
			<h1 class="font-semobild mb-4 text-2xl text-zinc-100">Please wait for an approval</h1>
			<!-- <p class="mb-4 text-zinc-400">Your account needs approval from a lab administrator.</p> -->
			<p class="text-sm text-zinc-500">email: {user.email}</p>
			<button
				onclick={() => authService.signOut()}
				class="mt-4 text-sm text-zinc-400 hover:text-zinc-300"
			>
				Sign out
			</button>
		</div>
	</div>
{:else}
	{@render children?.()}
{/if}
