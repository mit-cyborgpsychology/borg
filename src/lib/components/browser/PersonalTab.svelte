<script lang="ts">
	import { User, CheckSquare, Edit, Check, X } from '@lucide/svelte';
	import type { ITaskService } from '../../services/interfaces/ITaskService';
	import type { TaskWithContext } from '../../types/task';
	import { authStore } from '../../stores/authStore';
	import { doc, updateDoc, getDoc } from 'firebase/firestore';
	import { db } from '../../firebase/config';
	import HierarchicalTaskView from '../tasks/HierarchicalTaskView.svelte';
	import TaskLog from '../tasks/TaskLog.svelte';
	import { joinTaskContext } from '../../services/taskContext';

	let { taskService, activeTab } = $props<{
		taskService: ITaskService;
		activeTab: string;
	}>();

	let userTasks = $state<TaskWithContext[]>([]);
	let resolvedUserTasks = $state<TaskWithContext[]>([]);
	let viewTab = $state<'active' | 'resolved' | 'log'>('active');
	let personalData = $state({
		preferredName: '',
		loading: false,
		saving: false
	});

	// Get profile image from Firebase user (read-only)
	let profileImageUrl = $state('');

	// Update profile image when auth changes
	$effect(() => {
		const user = $authStore.user;
		if (user && user.photoURL) {
			profileImageUrl = user.photoURL;
			console.log('Setting profile image URL:', user.photoURL);
		} else {
			profileImageUrl = '';
			console.log('No photoURL found in user:', user);
		}
	});
	let dataLoaded = $state(false);
	let isEditingName = $state(false);

	// Load data when tab becomes active
	$effect(() => {
		if (activeTab === 'personal' && !dataLoaded) {
			loadPersonalData();
			loadUserTasks();
			loadResolvedUserTasks();
		}
	});

	async function loadPersonalData() {
		personalData.loading = true;
		const currentUser = $authStore.user;

		if (!currentUser) {
			personalData.loading = false;
			return;
		}

		try {
			const userRef = doc(db, 'users', currentUser.uid);
			const userDoc = await getDoc(userRef);

			if (userDoc.exists()) {
				const userData = userDoc.data();
				personalData.preferredName = userData.preferredName || currentUser.displayName || '';
			} else {
				personalData.preferredName = currentUser.displayName || '';
			}

			// Store initial values to track changes
			initialData.preferredName = personalData.preferredName;
		} catch (error) {
			console.error('Failed to load personal data:', error);
		} finally {
			personalData.loading = false;
			dataLoaded = true;
		}
	}

	async function loadUserTasks() {
		const currentUser = $authStore.user;
		if (!currentUser) return;

		try {
			// In Firebase mode, person ID is the user's Firebase UID
			// In local mode, it might be email or another identifier
			let personId = currentUser.uid || currentUser.email || '';

			const result = taskService.getPersonTasks(personId);
			const tasks = result instanceof Promise ? await result : result;
			const active = tasks.filter((task: any) => !task.resolvedAt);
			userTasks = active;
			joinTaskContext(active).then((joined) => (userTasks = joined));
		} catch (error) {
			console.error('Failed to load user tasks:', error);
			userTasks = [];
		}
	}

	async function loadResolvedUserTasks() {
		const currentUser = $authStore.user;
		if (!currentUser) return;

		try {
			let personId = currentUser.uid || currentUser.email || '';

			// Get all resolved tasks and filter by person
			const result = taskService.getResolvedTasks();
			const allResolvedTasks = result instanceof Promise ? await result : result;
			const filtered = allResolvedTasks.filter((task: any) => task.assignee === personId);
			resolvedUserTasks = filtered;
			joinTaskContext(filtered).then((joined) => (resolvedUserTasks = joined));
		} catch (error) {
			console.error('Failed to load resolved user tasks:', error);
			resolvedUserTasks = [];
		}
	}

	async function savePersonalData() {
		const currentUser = $authStore.user;
		if (!currentUser) return;

		personalData.saving = true;

		try {
			const userRef = doc(db, 'users', currentUser.uid);
			await updateDoc(userRef, {
				preferredName: personalData.preferredName,
				updatedAt: new Date()
			});
		} catch (error) {
			console.error('Failed to save personal data:', error);
			alert('Failed to save changes');
		} finally {
			personalData.saving = false;
		}
	}

	function handleImageError(event: Event) {
		const target = event.target as HTMLImageElement;
		if (target) {
			target.style.display = 'none';
		}
	}

	// Track initial values to avoid saving on load
	let initialData = $state({
		preferredName: ''
	});

	// Task handlers
	async function handleDeleteTask(task: TaskWithContext) {
		if (confirm('Are you sure you want to delete this task permanently?')) {
			const result = taskService.deleteTask(task.nodeId, task.id, task.projectSlug);
			if (result instanceof Promise) await result;
			await loadUserTasks(); // Reload tasks
		}
	}

	async function handleResolveTask(task: TaskWithContext) {
		const result = taskService.resolveTask(task.nodeId, task.id, task.projectSlug);
		if (result instanceof Promise) await result;
		await loadUserTasks();
		await loadResolvedUserTasks();
	}

	async function handleReactivateTask(task: TaskWithContext) {
		const result = taskService.updateTask(
			task.nodeId,
			task.id,
			{ status: 'active' } as any,
			task.projectSlug
		);
		if (result instanceof Promise) await result;
		await loadUserTasks();
		await loadResolvedUserTasks();
	}
</script>

<div class="flex h-full w-full flex-col overflow-hidden">
	{#if personalData.loading}
		<div class="flex h-64 items-center justify-center">
			<div
				class="h-6 w-6 animate-spin rounded-full border-2 border-black border-t-transparent"
			></div>
			<span class="ml-2 text-sm text-gray-600">Loading...</span>
		</div>
	{:else}
		<!-- Sticky profile + tabs -->
		<div class="w-full flex-shrink-0 border-b border-borg-brown bg-borg-beige">
			<!-- Profile row -->
			<div class="flex items-center gap-3 px-4 py-3">
				{#if profileImageUrl}
					<div class="h-9 w-9 flex-shrink-0 overflow-hidden rounded-full border border-borg-brown">
						<img src={profileImageUrl} alt="Profile" class="h-full w-full object-cover" referrerpolicy="no-referrer" onerror={handleImageError} />
					</div>
				{:else}
					<div class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-borg-brown bg-white text-sm font-semibold text-zinc-600">
						{($authStore.user?.displayName || '?')[0]}
					</div>
				{/if}
				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-1">
						{#if isEditingName}
							<input bind:value={personalData.preferredName} type="text" placeholder={initialData.preferredName || 'Your preferred name'} class="border-b border-zinc-500 bg-transparent px-0 text-sm font-medium text-zinc-800 focus:outline-none" onfocus={(e) => e.currentTarget.select()} />
							<button onclick={() => { isEditingName = false; savePersonalData(); }} class="p-0.5 text-green-600"><Check class="h-3.5 w-3.5" /></button>
							<button onclick={() => { isEditingName = false; personalData.preferredName = initialData.preferredName; }} class="p-0.5 text-red-500"><X class="h-3.5 w-3.5" /></button>
						{:else}
							<span class="text-sm font-semibold text-zinc-800">{personalData.preferredName || $authStore.user?.displayName || 'No name set'}</span>
							<button onclick={() => (isEditingName = true)} class="p-0.5 text-zinc-400 hover:text-zinc-600"><Edit class="h-3 w-3" /></button>
						{/if}
						{#if personalData.saving}<div class="h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600"></div>{/if}
					</div>
					<p class="truncate text-xs text-zinc-500">{$authStore.user?.email}</p>
				</div>
				</div>
			<!-- Tabs -->
			<div class="flex border-t border-borg-brown px-4">
				<button onclick={() => (viewTab = 'active')} class="px-3 py-2 text-sm font-medium transition-colors {viewTab === 'active' ? 'border-b-2 border-zinc-700 text-zinc-800' : 'text-zinc-400 hover:text-zinc-600'}">Active ({userTasks.length})</button>
				<button onclick={() => (viewTab = 'resolved')} class="px-3 py-2 text-sm font-medium transition-colors {viewTab === 'resolved' ? 'border-b-2 border-zinc-700 text-zinc-800' : 'text-zinc-400 hover:text-zinc-600'}">Resolved ({resolvedUserTasks.length})</button>
				<button onclick={() => (viewTab = 'log')} class="px-3 py-2 text-sm font-medium transition-colors {viewTab === 'log' ? 'border-b-2 border-zinc-700 text-zinc-800' : 'text-zinc-400 hover:text-zinc-600'}">Log</button>
			</div>
		</div>

		<div class="flex-1 overflow-y-auto">
			<div class="p-4">
				{#if viewTab === 'active'}
					<HierarchicalTaskView 
						tasks={userTasks} 
						showActions={true} 
						isResolved={false}
						onResolveTask={handleResolveTask}
						onDeleteTask={handleDeleteTask}
					/>
				{:else if viewTab === 'resolved'}
					<HierarchicalTaskView 
						tasks={resolvedUserTasks} 
						showActions={true} 
						isResolved={true}
						onReactivateTask={handleReactivateTask}
						onDeleteTask={handleDeleteTask}
					/>
				{:else if viewTab === 'log'}
					<TaskLog {taskService} />
				{/if}
			</div>
		</div>
	{/if}
</div>
