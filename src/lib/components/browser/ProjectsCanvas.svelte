<script lang="ts">
	import NodeCreationMenu from '$lib/components/NodeCreationMenu.svelte';
	import NodeStatusMenu from '$lib/components/NodeStatusMenu.svelte';
	import {
		isFinitePosition,
		readCanvasViewport,
		MIN_CANVAS_ZOOM,
		MAX_CANVAS_ZOOM
	} from '$lib/utils/canvasGeometry';
	let creationMenu = $state<{ x: number; y: number } | null>(null);
	let statusMenu = $state<{ x: number; y: number; projectId: string } | null>(null);
	function openCreationMenu({ event }: { event: MouseEvent }) {
		event.preventDefault();
		statusMenu = null;
		creationMenu = { x: event.clientX, y: event.clientY };
	}
	function openStatusMenu({ node, event }: { node: Node; event: MouseEvent }) {
		if (node.type !== 'projectCanvas') return;
		event.preventDefault();
		event.stopPropagation();
		const data = node.data.nodeData as Record<string, unknown>;
		if (typeof data.projectId !== 'string') return;
		creationMenu = null;
		statusMenu = { x: event.clientX, y: event.clientY, projectId: data.projectId };
	}
	async function setProjectDone(projectId: string, done: boolean) {
		const result = await editCommand.run(() =>
			projectsService.updateProject(projectId, { status: done ? 'Done' : 'active' })
		);
		if (!result.ok) throw new Error($editCommand.error || 'Could not update project status.');
		await onProjectUpdate?.();
	}
	async function createCanvasNode(type: string, position: { x: number; y: number }) {
		if (!nodesService) return { ok: false } as const;
		const result = await editCommand.run(() => nodesService.addNode(type, position));
		if (result.ok && result.value.data.templateType === 'link') {
			handleNodeEdit({
				nodeId: result.value.id,
				nodeData: result.value.data.nodeData as Record<string, unknown>,
				templateType: 'link'
			});
		}
		return result;
	}
	async function createFromMenu(type: string, position: { x: number; y: number }) {
		if (!nodesService) return false;
		const result = await createCanvasNode(type, position);
		if (!result.ok)
			throw new Error($editCommand.error || 'Could not create node. Please try again.');
		return true;
	}
	import { createCommand } from '$lib/state/command';
	import { onDestroy } from 'svelte';
	const editCommand = createCommand({ queue: true });
	onDestroy(() => editCommand.dispose());
	import { provideCanvasActions, type CanvasPayloads } from '$lib/features/canvas/context';
	import AsyncStatus from '../AsyncStatus.svelte';
	import { getAppServices } from '$lib/app/context';
	import { onMount, untrack } from 'svelte';
	import { buildProjectCanvasNodes } from '../../features/projects/projectCanvasNodes';
	import { connectCanvas } from '../../features/canvas/connectCanvas';
	import { Network, Grid, Search } from '@lucide/svelte';
	import {
		SvelteFlow,
		SvelteFlowProvider,
		Background,
		Controls,
		MiniMap,
		Panel,
		useSvelteFlow,
		type Node,
		type Edge,
		type Connection
	} from '@xyflow/svelte';
	import UniversalNode from '../UniversalNode/UniversalNode.svelte';
	import NoteNode from '../UniversalNode/NoteNode.svelte';
	import ProjectCanvasNode from '../ProjectCanvasNode.svelte';
	import StickerNode from '../UniversalNode/StickerNode.svelte';
	import Toolbar from '../Toolbar.svelte';
	import EditPanel from '../EditPanel.svelte';
	import StickerPanel from '../stickers/StickerPanel.svelte';
	import type { INodesService } from '../../services/interfaces';
	import type { Project } from '$lib/types/project';
	import { getTemplate } from '../../templates';
	import {
		updateMatchingNodes as updateMatches,
		navigateToMatch,
		nextMatch as goToNextMatch,
		previousMatch as goToPreviousMatch
	} from '../../utils/canvasSearch';
	import { ProjectStore } from '../../stores/ProjectStore.svelte';
	import { setProjectStoreContext } from '../../stores/projectStoreContext';
	import '@xyflow/svelte/dist/style.css';
	import '../svelteflow.css';

	const { authStore, projectsService, createNodesService, imageService, taskService } =
		getAppServices();
	let {
		projects,
		onProjectClick,
		onCreateProject,
		onProjectUpdate,
		viewMode = $bindable<'list' | 'canvas'>('canvas')
	} = $props<{
		projects: Project[];
		onProjectClick: (slug: string) => void;
		onCreateProject?: () => void;
		onProjectUpdate?: () => void | Promise<void>;
		viewMode?: 'list' | 'canvas';
	}>();
	let statusProject = $derived(
		projects.find((project: Project) => project.id === statusMenu?.projectId)
	);

	const nodeTypes = {
		universal: UniversalNode,
		projectCanvas: ProjectCanvasNode,
		sticker: StickerNode
	};

	// The scratch canvas is a synthetic pseudo-project ('project-canvas') distinct
	// from any real project — its own universal nodes need a ProjectStore in
	// context too, same as Canvas.svelte, so UniversalNode can read task data
	// without opening its own per-node Firestore listener.
	const projectStore = new ProjectStore(taskService);
	setProjectStoreContext(projectStore);

	$effect(() => {
		projectStore.open('project-canvas');
		return () => projectStore.close();
	});

	let canvasNodes = $state<Node[]>([]);
	let canvasEdges = $state<Edge[]>([]);
	let nodesService: INodesService;
	let mounted = $state(false);
	let canvasError = $state<string | null>(null);

	// Svelte Flow helpers - will be initialized after SvelteFlow is ready
	let getViewport: any;
	let setViewport: any;
	let screenToFlowPosition: any;
	let svelteFlowReady = $state(false);

	// Current working nodes (mutable for SvelteFlow)
	let workingNodes = $state<Node[]>([]);

	// Handle lock state reactively - set draggable property based on lock state
	$effect(() => {
		if (workingNodes.length > 0) {
			workingNodes.forEach((node) => {
				if (node.data) {
					// Set draggable property based on lock state - locked nodes can't be dragged
					const nodeData = node.data.nodeData as Record<string, unknown> | undefined;
					node.draggable = !(nodeData && nodeData.locked);
				}
			});
		}
	});

	// Minimap toggle state
	let showMinimap = $state(true);

	// Edit panel state
	let sidebarView = $state<'inspector' | 'stickers' | null>(null);
	let editNodeId = $state('');
	let editNodeData = $state({});
	let editTemplateType = $state('');

	// Selection state
	let selectedNodes = $state<Node[]>([]);
	let selectedNodesWithStatus = $derived(
		selectedNodes.filter(
			(node) => (node.data?.nodeData as Record<string, unknown> | undefined)?.status !== undefined
		)
	);

	// Search functionality
	let searchQuery = $state('');
	let matchingNodeIds = $state<string[]>([]);
	let currentMatchIndex = $state(0);

	function updateMatchingNodes() {
		const query = searchQuery.trim().toLowerCase();
		if (!query) {
			matchingNodeIds = [];
			currentMatchIndex = 0;
			// Clear all search styling when search is empty
			document.querySelectorAll('.search-highlighted').forEach((el) => {
				el.classList.remove('search-highlighted');
			});
			document.querySelectorAll('.search-dimmed').forEach((el) => {
				el.classList.remove('search-dimmed');
			});
			return;
		}

		matchingNodeIds = workingNodes
			.filter((node) => {
				// Search through all fields in nodeData
				const nodeData = node.data?.nodeData || {};
				const searchableText = Object.values(nodeData)
					.filter((value) => typeof value === 'string')
					.join(' ')
					.toLowerCase();
				return searchableText.includes(query);
			})
			.map((node) => node.id);

		currentMatchIndex = 0;
		if (matchingNodeIds.length > 0) {
			navigateToCurrentMatch();
		}
	}

	function navigateToCurrentMatch() {
		if (matchingNodeIds.length === 0) return;

		// Remove highlight and dimming from all nodes
		document.querySelectorAll('.search-highlighted').forEach((el) => {
			el.classList.remove('search-highlighted');
		});
		document.querySelectorAll('.search-dimmed').forEach((el) => {
			el.classList.remove('search-dimmed');
		});

		// Dim all non-matching nodes
		workingNodes.forEach((node) => {
			if (!matchingNodeIds.includes(node.id)) {
				const nodeElement = document.querySelector(`[data-id="${node.id}"]`);
				if (nodeElement) {
					nodeElement.classList.add('search-dimmed');
				}
			}
		});

		const nodeId = matchingNodeIds[currentMatchIndex];
		const node = workingNodes.find((n) => n.id === nodeId);
		if (node && isFinitePosition(node.position) && setViewport) {
			setViewport(
				{ x: -node.position.x + 400, y: -node.position.y + 300, zoom: 1 },
				{ duration: 300 }
			);

			// Add highlight to current node after a short delay to ensure it's rendered
			setTimeout(() => {
				const nodeElement = document.querySelector(`[data-id="${nodeId}"]`);
				if (nodeElement) {
					nodeElement.classList.add('search-highlighted');
				}
			}, 100);
		}
	}

	function nextMatch() {
		if (matchingNodeIds.length === 0) return;
		currentMatchIndex = (currentMatchIndex + 1) % matchingNodeIds.length;
		navigateToCurrentMatch();
	}

	function previousMatch() {
		if (matchingNodeIds.length === 0) return;
		currentMatchIndex = (currentMatchIndex - 1 + matchingNodeIds.length) % matchingNodeIds.length;
		navigateToCurrentMatch();
	}

	// Handle selection changes
	function handleSelectionChange(event: any) {
		if (event?.nodes) {
			selectedNodes = event.nodes;
		}
	}

	// Convert all selected nodes to Done status
	async function convertSelectedToDone() {
		if (selectedNodesWithStatus.length === 0) return;

		for (const node of selectedNodesWithStatus) {
			const updatedNodeData = {
				...(node.data.nodeData as Record<string, unknown>),
				status: 'Done'
			};

			await nodesService.updateNode(node.id, {
				data: {
					...node.data,
					nodeData: updatedNodeData
				}
			});
		}

		// Trigger project update if there's a handler
		if (onProjectUpdate) {
			onProjectUpdate();
		}
	}

	function updateWorkingNodes() {
		workingNodes = buildProjectCanvasNodes(projects, canvasNodes, workingNodes);
	}

	onMount(() => {
		nodesService = createNodesService('project-canvas', 'project-canvas');
		const disconnect = connectCanvas(async () => nodesService, {
			nodes: (nodes) => {
				canvasNodes = nodes;
				mounted = true;
				updateWorkingNodes();
			},
			edges: (edges) => {
				canvasEdges = edges;
			},
			error: (error) => {
				canvasError = 'Could not load the canvas. Please reload to try again.';
				console.error('Failed to load project canvas:', error);
			}
		});
		return () => {
			mounted = false;
			disconnect();
			clearTimeout(viewportSaveTimeout);
		};
	});

	// Initialize Svelte Flow helpers after SvelteFlow is ready
	function initializeSvelteFlowHelpers() {
		if (!svelteFlowReady) {
			try {
				const svelteFlowHelpers = useSvelteFlow();
				getViewport = svelteFlowHelpers.getViewport;
				setViewport = svelteFlowHelpers.setViewport;
				screenToFlowPosition = svelteFlowHelpers.screenToFlowPosition;
				svelteFlowReady = true;

				// Load viewport position after helpers are initialized
				setTimeout(() => {
					if (mounted) void loadViewportPosition();
				}, 100);
			} catch (error) {
				console.error('Failed to initialize SvelteFlow helpers:', error);
			}
		}
	}

	function handleConnect(connection: Connection) {
		if (!connection.source || !connection.target) return;

		const edge: Edge = {
			id: `edge-${connection.source}-${connection.target}-${Date.now()}`,
			source: connection.source,
			target: connection.target,
			type: 'default',
			style: 'stroke: #d4d4d8; stroke-width: 1px;'
		};

		nodesService.addEdge(edge);
	}

	function handleBeforeDelete({
		nodes: nodesToDelete,
		edges: edgesToDelete
	}: {
		nodes: Node[];
		edges: Edge[];
	}): Promise<boolean> {
		// Prevent node deletion by returning false if any nodes would be deleted
		if (nodesToDelete.length > 0) {
			return Promise.resolve(false); // This should prevent the deletion
		}
		// Allow edge deletion
		return Promise.resolve(true);
	}

	function handleDelete({
		nodes: nodesToDelete,
		edges: edgesToDelete
	}: {
		nodes: Node[];
		edges: Edge[];
	}) {
		// This should only be called for edges now due to onbeforedelete
		edgesToDelete.forEach((edge) => {
			nodesService.deleteEdge(edge.id);
		});
	}

	function handleNodeDragStart(event: any) {
		if (event && event.node) {
			const draggedNodeId = event.node.id;
			const draggedNode = workingNodes.find((node) => node.id === draggedNodeId);
			const otherNodes = workingNodes.filter((node) => node.id !== draggedNodeId);

			if (draggedNode) {
				// Move dragged node to the end of the array (renders on top)
				workingNodes = [...otherNodes, draggedNode];
			}
		}
	}

	async function handleNodeDragStop(event: any) {
		if (!mounted) return;

		try {
			if (event?.targetNode) {
				const draggedNodeId = event.targetNode.id;
				const draggedNode = workingNodes.find((node) => node.id === draggedNodeId);

				if (draggedNode) {
					console.log(
						'ProjectsCanvas: Saving position for node:',
						draggedNodeId,
						draggedNode.position
					);
					// Save only the dragged node - Firebase will set updatedAt for ordering
					await nodesService.saveBatch([draggedNode], []);
					canvasError = null;
				}
			}
		} catch (error) {
			canvasError = 'Could not save this position. Move the node again to retry.';
			console.error('Failed to save node positions:', error);
		}
	}

	async function handleToolbarCreateNode(templateType: string) {
		const position = {
			x: Math.random() * 600 + 200,
			y: Math.random() * 400 + 200
		};

		await createCanvasNode(templateType, position);
	}

	// Check for projects changes
	$effect(() => {
		// Track metadata changes, not just the number of projects. Avoid tracking
		// workingNodes, which this reconciliation replaces.
		projects;
		if (mounted) untrack(updateWorkingNodes);
	});

	const handleNodeEdit = (payload: CanvasPayloads['nodeEdit']) => {
		const { nodeId, nodeData, templateType } = payload;

		// For project nodes, navigate to project
		if (nodeData?.projectSlug) {
			onProjectClick(nodeData.projectSlug);
			return;
		}

		// For other nodes (like post-it notes), show edit panel
		editNodeId = nodeId;
		editNodeData = nodeData;
		editTemplateType = templateType;
		sidebarView = 'inspector';
	};

	const handleNodeDelete = async (payload: CanvasPayloads['nodeDelete']) => {
		const { nodeId } = payload;

		// Don't allow deleting project nodes
		if (nodeId?.startsWith('project-')) {
			alert('Project nodes cannot be deleted as they sync with workspace metadata.');
			return;
		}

		if (nodeId && nodesService) {
			try {
				await nodesService.deleteNode(nodeId);
			} catch (error) {
				console.error('Failed to delete node:', error);
			}
		}
	};

	const handleNodeUpdate = async (payload: CanvasPayloads['nodeUpdate']) => {
		const { nodeId, data } = payload;

		if (nodeId && nodesService && data) {
			try {
				await nodesService.updateNode(nodeId, data);
			} catch (error) {
				console.error('Failed to update node:', error);
			}
		}
	};

	const handleAddStickerEvent = (payload: CanvasPayloads['addSticker']) => {
		void handleAddSticker(payload);
	};

	provideCanvasActions({
		nodeEdit: handleNodeEdit,
		nodeDelete: handleNodeDelete,
		nodeUpdate: handleNodeUpdate,
		addSticker: handleAddStickerEvent,
		nodeTasksOpen: () => {},
		addTask: () => {},
		editTask: () => {}
	});

	async function handleEditPanelSave(nodeId: string, data: any) {
		console.log('ProjectsCanvas.handleEditPanelSave called:', { nodeId, data });
		const result = await editCommand.run(() => nodesService.updateNode(nodeId, data));
		if (!result.ok) return;
	}

	async function handleEditPanelDelete(nodeId: string) {
		if (nodeId.startsWith('project-')) return;
		const result = await editCommand.run(() => nodesService.deleteNode(nodeId));
		if (result.ok && sidebarView === 'inspector') sidebarView = null;
	}

	// ── Canvas drag-and-drop ─────────────────────────────────────────────────

	let canvasDragOver = $state(false);
	let canvasUploading = $state(false);

	function handleCanvasDragOver(e: DragEvent) {
		const types = e.dataTransfer?.types ?? [];
		const isFile = types.includes('Files');
		const isSticker = types.includes('application/borg-sticker');
		if (!isFile && !isSticker) return;
		const target = e.target as HTMLElement;
		if (target.closest('.svelte-flow__node')) return;
		e.preventDefault();
		e.dataTransfer!.dropEffect = 'copy';
		canvasDragOver = true;
	}

	function handleCanvasDragLeave(e: DragEvent) {
		if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as globalThis.Node)) {
			canvasDragOver = false;
		}
	}

	async function handleCanvasDrop(e: DragEvent) {
		e.preventDefault();
		canvasDragOver = false;

		const target = e.target as HTMLElement;
		if (target.closest('.svelte-flow__node')) return;
		if (!nodesService || !screenToFlowPosition) return;

		// ── Sticker drop ──────────────────────────────────────────────────────
		const stickerJson = e.dataTransfer?.getData('application/borg-sticker');
		if (stickerJson) {
			try {
				const stickerData = JSON.parse(stickerJson);
				const dropPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
				const position = { x: dropPos.x - 50, y: dropPos.y - 50 };

				const newNode = await nodesService.addNode('sticker', position);
				if (newNode?.id) {
					await nodesService.updateNode(newNode.id, {
						nodeData: {
							title: stickerData.name,
							stickerUrl: stickerData.stickerUrl,
							category: stickerData.category || '',
							filename: stickerData.filename || '',
							width: 100,
							height: 100,
							rotation: 0
						}
					});
				}
			} catch (err) {
				console.error('ProjectsCanvas sticker drop failed', err);
			}
			return;
		}

		// ── Image file drop ───────────────────────────────────────────────────
		const files = Array.from(e.dataTransfer?.files ?? []).filter((f) =>
			f.type.startsWith('image/')
		);
		if (files.length === 0) return;

		canvasUploading = true;

		for (const file of files) {
			try {
				const dropPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
				const position = { x: dropPos.x - 100, y: dropPos.y - 75 };

				const newNode = await nodesService.addNode('image', position);
				if (!newNode?.id) continue;

				const downloadURL = await imageService.uploadImage(newNode.id, file);

				await nodesService.updateNode(newNode.id, {
					nodeData: { imageUrl: downloadURL }
				});
			} catch (err) {
				console.error('ProjectsCanvas image drop failed', err);
			}
		}

		canvasUploading = false;
	}

	function handleShowStickers() {
		sidebarView = 'stickers';
	}

	async function handleAddSticker(payload: CanvasPayloads['addSticker']) {
		if (!nodesService) return;

		try {
			const stickerData = payload;

			if (stickerData.type === 'sticker') {
				// Create sticker at center of viewport with some randomization
				const position = {
					x: Math.random() * 600 + 200,
					y: Math.random() * 400 + 200
				};

				// First create a basic sticker node using the service
				const baseNode = await nodesService.addNode('sticker', position);

				// Then immediately update it with the sticker-specific data
				const stickerNodeData = {
					title: stickerData.name,
					stickerUrl: stickerData.stickerUrl,
					category: stickerData.category,
					filename: stickerData.filename,
					width: 100,
					height: 100,
					rotation: 0
				};

				await nodesService.updateNode(baseNode.id, {
					nodeData: stickerNodeData
				});
			}
		} catch (error) {
			console.error('Failed to create sticker:', error);
		}
	}

	// Viewport saving with debounce
	let viewportSaveTimeout: ReturnType<typeof setTimeout>;
	const VIEWPORT_SAVE_DELAY = 500; // Save after 500ms of inactivity

	// Functions for viewport position management
	async function saveViewportPosition() {
		if (!getViewport) return; // Not initialized yet

		// Get current user ID
		const currentUser = $authStore.user;
		if (!currentUser) {
			console.log('ProjectsCanvas: No user logged in, cannot save viewport');
			return;
		}

		try {
			const viewportData = readCanvasViewport(getViewport());
			if (!viewportData) return;

			console.log(
				'ProjectsCanvas: Attempting to save viewport position for user:',
				currentUser.uid,
				viewportData
			);

			// Get existing project-canvas project by slug
			const project = await projectsService.getProject('project-canvas');
			console.log('ProjectsCanvas: Existing project data:', project);

			// Get existing viewport positions object, or create new one
			const existingViewportPositions = project?.viewportPositions || {};

			// Update viewport position for current user
			const updatedViewportPositions = {
				...existingViewportPositions,
				[currentUser.uid]: viewportData
			};

			// Save viewport positions
			const result = await projectsService.updateProject('project-canvas', {
				viewportPositions: updatedViewportPositions
			});
			console.log('ProjectsCanvas: Update result:', result);
			console.log(
				'ProjectsCanvas: Saved viewport position for user:',
				currentUser.uid,
				viewportData
			);
		} catch (error) {
			console.error('ProjectsCanvas: Failed to save viewport position:', error);
		}
	}

	async function loadViewportPosition() {
		if (!setViewport) return; // Not initialized yet

		// Get current user ID
		const currentUser = $authStore.user;
		if (!currentUser) {
			console.log('ProjectsCanvas: No user logged in, cannot load viewport');
			return;
		}

		try {
			// Get project-canvas by slug
			const project = await projectsService.getProject('project-canvas');

			console.log('ProjectsCanvas: Loaded project data:', project);

			// Check for user-specific viewport position
			const userViewportPosition = readCanvasViewport(
				project?.viewportPositions?.[currentUser.uid]
			);

			if (userViewportPosition) {
				const { x, y, zoom } = userViewportPosition;
				// Use setTimeout to ensure SvelteFlow is fully mounted
				setTimeout(() => {
					if (!mounted) return;
					setViewport({ x, y, zoom }, { duration: 0 });
					console.log(
						'ProjectsCanvas: Restored viewport position for user:',
						currentUser.uid,
						userViewportPosition
					);
				}, 0);
			} else {
				console.log('ProjectsCanvas: No saved viewport position found for user:', currentUser.uid);
			}
		} catch (error) {
			console.error('ProjectsCanvas: Failed to load viewport position:', error);
		}
	}

	function debouncedSaveViewport() {
		clearTimeout(viewportSaveTimeout);
		viewportSaveTimeout = setTimeout(() => {
			saveViewportPosition();
		}, VIEWPORT_SAVE_DELAY);
	}

	// Handle viewport move events
	function handleViewportChange() {
		// Initialize helpers if not ready
		if (!svelteFlowReady) {
			initializeSvelteFlowHelpers();
		}
		// Save position when user moves the viewport (debounced)
		debouncedSaveViewport();
	}
</script>

<SvelteFlowProvider>
	<div class="flex h-full w-full bg-zinc-950">
		<!-- Canvas -->
		<div class="relative flex-1">
			{#if canvasError}<div
					role="alert"
					class="absolute top-16 left-3 z-50 rounded border border-red-300 bg-white p-3 text-sm text-red-800"
				>
					{canvasError}
				</div>{/if}
			<!-- Floating Toolbar -->
			<Toolbar
				view="projects"
				onCreateNode={handleToolbarCreateNode}
				onShowStickers={handleShowStickers}
				{onCreateProject}
			/>

			<!-- Search Box + View Toggle -->
			<div class="absolute top-4 right-4 z-20 flex flex-col items-end gap-2">
				<!-- View toggle -->
				<div class="flex w-52 rounded border border-zinc-200 bg-white p-0.5 shadow-sm">
					<button
						onclick={() => (viewMode = 'canvas')}
						class="flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-sm transition-colors {viewMode ===
						'canvas'
							? 'bg-zinc-100 font-medium text-zinc-800'
							: 'text-zinc-500 hover:text-zinc-700'}"
					>
						<Network class="h-3.5 w-3.5" />
						Canvas
					</button>
					<button
						onclick={() => (viewMode = 'list')}
						class="flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-sm transition-colors {viewMode ===
						'list'
							? 'bg-zinc-100 font-medium text-zinc-800'
							: 'text-zinc-500 hover:text-zinc-700'}"
					>
						<Grid class="h-3.5 w-3.5" />
						List
					</button>
				</div>
				<!-- Search -->
				<div class="flex items-center gap-1.5">
					<div class="relative">
						<Search class="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
						<input
							type="text"
							bind:value={searchQuery}
							oninput={updateMatchingNodes}
							onkeydown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									if (e.shiftKey) {
										previousMatch();
									} else {
										nextMatch();
									}
								}
							}}
							placeholder="Search nodes..."
							class="w-52 rounded border border-zinc-200 bg-white py-1.5 pr-3 pl-8 text-sm text-black placeholder-zinc-400 shadow-sm focus:border-zinc-400 focus:outline-none"
						/>
					</div>
					{#if matchingNodeIds.length > 0}
						<div
							class="flex items-center gap-1 rounded border border-zinc-200 bg-white px-2 py-1.5 shadow-sm"
						>
							<span class="text-xs text-zinc-600">
								{currentMatchIndex + 1} / {matchingNodeIds.length}
							</span>
						</div>
						<button
							onclick={previousMatch}
							class="rounded border border-zinc-200 bg-white p-1.5 text-zinc-600 shadow-sm hover:bg-zinc-50"
							title="Previous (Shift+Enter)"
							aria-label="Previous match"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<polyline points="15 18 9 12 15 6"></polyline>
							</svg>
						</button>
						<button
							onclick={nextMatch}
							class="rounded border border-zinc-200 bg-white p-1.5 text-zinc-600 shadow-sm hover:bg-zinc-50"
							title="Next (Enter)"
							aria-label="Next match"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<polyline points="9 18 15 12 9 6"></polyline>
							</svg>
						</button>
					{/if}
				</div>
			</div>

			<div
				class="relative h-full w-full"
				ondragover={handleCanvasDragOver}
				ondragleave={handleCanvasDragLeave}
				ondrop={handleCanvasDrop}
				role="region"
				aria-label="Projects canvas"
			>
				{#if canvasDragOver || canvasUploading}
					<div
						class="pointer-events-none absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed border-white/60 bg-black/30"
					>
						<div
							class="flex flex-col items-center gap-2 text-sm font-medium text-white drop-shadow"
						>
							{#if canvasUploading}
								<div
									class="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"
								></div>
								<span>Uploading...</span>
							{:else}
								<span>Drop to add to canvas</span>
							{/if}
						</div>
					</div>
				{/if}

				<SvelteFlow
					onpanecontextmenu={openCreationMenu}
					onnodecontextmenu={openStatusMenu}
					class="h-full w-full bg-black"
					bind:nodes={workingNodes}
					bind:edges={canvasEdges}
					{nodeTypes}
					defaultEdgeOptions={{ style: 'stroke: #d4d4d8; stroke-width: 1px;' }}
					onconnect={handleConnect}
					onbeforedelete={handleBeforeDelete}
					ondelete={handleDelete}
					onnodedragstart={handleNodeDragStart}
					onnodedragstop={handleNodeDragStop}
					oninit={initializeSvelteFlowHelpers}
					onmoveend={handleViewportChange}
					onselectionchange={handleSelectionChange}
					nodesDraggable={true}
					nodesConnectable={true}
					elevateNodesOnSelect={true}
					minZoom={MIN_CANVAS_ZOOM}
					maxZoom={MAX_CANVAS_ZOOM}
					deleteKey={['Delete', 'Backspace']}
					panOnDrag={false}
					panOnScroll={true}
					panOnScrollSpeed={1}
					zoomOnScroll={false}
					zoomOnPinch={true}
				>
					{#if creationMenu}
						{#key creationMenu}
							<NodeCreationMenu
								{onCreateProject}
								position={creationMenu}
								view="projects"
								onCreate={createFromMenu}
								onClose={() => (creationMenu = null)}
							/>
						{/key}
					{/if}
					{#if statusMenu && statusProject}
						{#key statusMenu}
							{@const projectId = statusMenu.projectId}
							<NodeStatusMenu
								position={statusMenu}
								done={statusProject.status === 'Done'}
								onChange={(done) => setProjectDone(projectId, done)}
								onClose={() => (statusMenu = null)}
							/>
						{/key}
					{/if}
					<Background />
					<Controls />
					<Panel position="bottom-right">
						<button
							onclick={() => (showMinimap = !showMinimap)}
							class="rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-600 transition-colors hover:bg-zinc-50"
						>
							{showMinimap ? 'Hide' : 'Show'} Map
						</button>
					</Panel>
					{#if showMinimap}
						<MiniMap class="border border-zinc-200" style="margin-bottom: 54px" />
					{/if}
				</SvelteFlow>
			</div>
		</div>

		<!-- One sidebar hosts either the inspector or sticker picker. -->
		{#if sidebarView}
			<aside
				aria-label="Canvas sidebar"
				class="flex h-full min-h-0 w-80 max-w-[85vw] shrink-0 flex-col overflow-hidden border-l border-zinc-200 bg-white"
			>
				<div class="flex h-11 shrink-0 items-center justify-between border-b border-zinc-200 px-4">
					<span class="font-sans text-xs font-semibold text-zinc-900"
						>{sidebarView === 'stickers' ? 'Stickers' : 'Node properties'}</span
					>
					<button
						onclick={() => (sidebarView = null)}
						aria-label="Close sidebar"
						class="rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100">Close</button
					>
				</div>
				{#if sidebarView === 'stickers'}
					<StickerPanel onClose={() => (sidebarView = null)} />
				{:else}
					<EditPanel
						error={$editCommand.error}
						nodeId={editNodeId}
						nodeData={editNodeData}
						templateType={editTemplateType}
						onSave={handleEditPanelSave}
						onDelete={handleEditPanelDelete}
					/>
				{/if}
			</aside>
		{/if}
	</div>
</SvelteFlowProvider>
