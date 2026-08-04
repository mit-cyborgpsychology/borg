import { 
	collection, 
	doc, 
	addDoc, 
	updateDoc, 
	deleteDoc, 
	getDocs, 
	onSnapshot,
	writeBatch,
	query,
	orderBy,
	type Unsubscribe 
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import type { Node, Edge } from '@xyflow/svelte';
import type { INodesService } from '../interfaces/INodesService';
import { getTemplate } from '../../templates';
import { get } from 'svelte/store';
import { authStore } from '../../stores/authStore';
import { projectsService, taskService } from '../instances';

export class FirebaseNodesService implements INodesService {
	private projectId: string;
	private setNodes: (nodes: Node[]) => void;
	private getNodesCallback: () => Node[];
	private setEdges: (edges: Edge[]) => void;
	private getEdgesCallback: () => Edge[];
	private projectSlug?: string;
	private isUpdatingPositions = false;

	constructor(
		projectId: string,
		setNodes: (nodes: Node[]) => void,
		getNodes: () => Node[],
		setEdges: (edges: Edge[]) => void,
		getEdges: () => Edge[],
		projectSlug?: string
	) {
		this.projectId = projectId;
		this.setNodes = setNodes;
		this.getNodesCallback = getNodes;
		this.setEdges = setEdges;
		this.getEdgesCallback = getEdges;
		this.projectSlug = projectSlug;
	}

	async addNode(templateType: string, position: { x: number; y: number }): Promise<Node> {
		const template = getTemplate(templateType);
		
		// Validate template
		if (!template) {
			console.error(`Invalid template type: ${templateType}`);
			throw new Error(`Invalid template type: ${templateType}`);
		}
		
		if (!template.fields) {
			console.warn(`Template ${templateType} has no fields, using defaults`);
		}

		// Initialize default data based on template
		const nodeDataFields: Record<string, any> = {};
		
		// Ensure at least a title field exists for all nodes
		nodeDataFields.title = '';
		
		if (template.fields && template.fields.length > 0) {
			template.fields.forEach((field) => {
				if (field.type === 'tags') {
					nodeDataFields[field.id] = [];
				} else if (field.type === 'select' && templateType === 'note') {
					// Set defaults for note sizing - current behavior is small size
					if (field.id === 'size') {
						nodeDataFields[field.id] = 'Small';
					} else {
						nodeDataFields[field.id] = '';
					}
				} else {
					nodeDataFields[field.id] = '';
				}
			});
		}

		// Set countdown mode to true by default for time nodes
		if (templateType === 'time') {
			nodeDataFields.countdownMode = true;
		}
		
		// Validate required data before saving
		if (!nodeDataFields || Object.keys(nodeDataFields).length === 0) {
			console.error(`No nodeData fields initialized for template: ${templateType}`);
			throw new Error(`Failed to initialize nodeData for template: ${templateType}`);
		}
		
		if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
			console.error(`Invalid position data:`, position);
			throw new Error(`Invalid position data provided`);
		}

		// Save to Firestore first to get the real document ID
		const nodeDoc = {
			type: 'universal',
			position: { ...position },
			templateType: templateType,
			nodeData: nodeDataFields,
			projectSlug: this.projectSlug,
			status: nodeDataFields.status || null,
			createdAt: new Date(),
			updatedAt: new Date(),
			createdBy: get(authStore).user?.uid || 'anonymous'
		};

		const docRef = await addDoc(collection(db, 'projects', this.projectId, 'nodes'), nodeDoc);

		// Create the node with the Firestore-generated ID
		const newNode: Node = {
			id: docRef.id,
			type: 'universal',
			position: { ...position },
			data: {
				id: docRef.id,
				templateType: templateType,
				nodeData: nodeDataFields,
				projectSlug: this.projectSlug
			}
		};

		// Don't update local state here - the Firebase subscription will handle it
		// This prevents duplicate entries when the subscription receives the new node

		return newNode;
	}

	async updateNode(nodeId: string, updates: any, userId?: string): Promise<boolean> {
		try {
			console.log('FirebaseNodesService.updateNode called:', { nodeId, updates, userId });
			
			const nodeRef = doc(db, 'projects', this.projectId, 'nodes', nodeId);
			
			// Convert Node data structure to Firestore structure
			const firestoreUpdates: any = {};
			
			if (updates.position) {
				firestoreUpdates.position = updates.position;
			}
			
			// Handle direct nodeData updates (from EditPanel)
			if (updates.nodeData) {
				firestoreUpdates.nodeData = updates.nodeData;
				// Update denormalized status field
				if (updates.nodeData.status) {
					firestoreUpdates.status = updates.nodeData.status;
				}
			}
			
			// Handle nested data structure updates (from other sources)
			if (updates.data) {
				if (updates.data.templateType) {
					firestoreUpdates.templateType = updates.data.templateType;
				}
				if (updates.data.nodeData) {
					firestoreUpdates.nodeData = updates.data.nodeData;
					// Update denormalized status field
					if (updates.data.nodeData.status) {
						firestoreUpdates.status = updates.data.nodeData.status;
					}
				}
				if (updates.data.projectSlug) {
					firestoreUpdates.projectSlug = updates.data.projectSlug;
				}
			}

			// Filter out undefined values recursively
			const filteredUpdates = this.filterUndefinedValues(firestoreUpdates);
			
			console.log('Firestore updates:', filteredUpdates);

			await updateDoc(nodeRef, {
				...filteredUpdates,
				updatedAt: new Date(),
				...(userId && { lastEditBy: userId, lastEditAt: new Date() })
			});

			console.log('Node updated successfully in Firestore');

			// Invalidate relevant caches when node status changes
			const statusChanged = updates.nodeData?.status || updates.data?.nodeData?.status;
			if (statusChanged && this.projectSlug) {
				try {
					if (projectsService.invalidateStatusCache) {
						projectsService.invalidateStatusCache(this.projectSlug);
					}
				} catch (error) {
					console.warn('Failed to invalidate status cache:', error);
				}
			}

			// Note: We don't update local state here because the subscription will handle it
			// The subscription in Canvas will receive the updated data and update the nodes

			return true;
		} catch (error) {
			console.error('Failed to update node:', error);
			return false;
		}
	}

	async deleteNode(nodeId: string): Promise<boolean> {
		try {
			// Delete from Firestore
			const nodeRef = doc(db, 'projects', this.projectId, 'nodes', nodeId);
			await deleteDoc(nodeRef);

			// Don't update local state here - the Firebase subscription will handle node removal
			// But we do need to clean up connected edges

			// Delete connected edges from Firestore
			const edgesCollection = collection(db, 'projects', this.projectId, 'edges');
			const edgesSnapshot = await getDocs(edgesCollection);
			const batch = writeBatch(db);

			edgesSnapshot.docs.forEach((edgeDoc) => {
				const edgeData = edgeDoc.data();
				if (edgeData.source === nodeId || edgeData.target === nodeId) {
					batch.delete(edgeDoc.ref);
				}
			});

			await batch.commit();

			// Clean up associated tasks
			try {
				const nodeTasks = await taskService.getNodeTasks(nodeId, this.projectSlug);
				
				// Delete all tasks associated with this node
				const deletePromises = nodeTasks.map(task => 
					taskService.deleteTask(nodeId, task.id, this.projectSlug)
				);
				await Promise.all(deletePromises);
				
				console.log(`Deleted ${nodeTasks.length} tasks associated with node ${nodeId}`);
			} catch (error) {
				console.warn('Failed to delete tasks when deleting node:', error);
			}

			return true;
		} catch (error) {
			console.error('Failed to delete node:', error);
			return false;
		}
	}

	async getNodes(): Promise<Node[]> {
		try {
			const nodesCollection = collection(db, 'projects', this.projectId, 'nodes');
			const snapshot = await getDocs(nodesCollection);
			return snapshot.docs.map(doc => {
				const data = doc.data();
				return {
					id: doc.id, // Use the Firestore document ID
					type: data.type,
					position: data.position,
					data: {
						id: doc.id,
						templateType: data.templateType,
						nodeData: data.nodeData,
						projectSlug: data.projectSlug
					}
				} as Node;
			});
		} catch (error) {
			console.error('Failed to get nodes:', error);
			return [];
		}
	}

	async addEdge(edgeData: Edge): Promise<Edge> {
		// Save to Firestore
		const edgeDoc = {
			...edgeData,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		};

		await addDoc(collection(db, 'projects', this.projectId, 'edges'), edgeDoc);

		// Don't update local state here - the Firebase subscription will handle it
		// This prevents duplicate entries when the subscription receives the new edge

		return edgeData;
	}

	async deleteEdge(edgeId: string): Promise<boolean> {
		try {
			// Find and delete from Firestore
			const edgesCollection = collection(db, 'projects', this.projectId, 'edges');
			const snapshot = await getDocs(edgesCollection);
			
			const edgeDoc = snapshot.docs.find(doc => doc.id === edgeId);
			if (edgeDoc) {
				await deleteDoc(edgeDoc.ref);
			}

			// Don't update local state here - the Firebase subscription will handle edge removal

			return true;
		} catch (error) {
			console.error('Failed to delete edge:', error);
			return false;
		}
	}

	async getEdges(): Promise<Edge[]> {
		try {
			const edgesCollection = collection(db, 'projects', this.projectId, 'edges');
			const snapshot = await getDocs(edgesCollection);
			return snapshot.docs.map(doc => ({
				...doc.data(),
				id: doc.id // Use the Firestore document ID
			} as Edge));
		} catch (error) {
			console.error('Failed to get edges:', error);
			return [];
		}
	}

	async saveBatch(nodes: Node[], edges: Edge[]): Promise<void> {
		try {
			console.log('FirebaseNodesService.saveBatch called with', nodes.length, 'nodes and', edges.length, 'edges');
			console.log('Project ID:', this.projectId);
			
			// Flag for logging purposes - no longer preventing subscription updates
			this.isUpdatingPositions = true;
			
			const batch = writeBatch(db);

			// Update existing nodes (especially positions)
			for (const node of nodes) {
				if (!node.id || !node.position) {
					console.warn('Skipping node with invalid ID or position:', { id: node.id, position: node.position });
					continue;
				}
				
				console.log('Updating node in batch:', node.id, 'position:', node.position);
				console.log('Document path:', `projects/${this.projectId}/nodes/${node.id}`);
				
				// Reference the existing document by its ID
				const nodeRef = doc(db, 'projects', this.projectId, 'nodes', node.id);
				
				// Use set with merge to update position - more robust than update
				batch.set(nodeRef, {
					position: node.position,
					updatedAt: new Date()
				}, { merge: true });
				console.log('Added position update to batch for node:', node.id);
			}

			// Update existing edges
			edges.forEach(edge => {
				if (edge.id) {
					console.log('Updating edge in batch:', edge.id);
					
					// Reference the existing document by its ID
					const edgeRef = doc(db, 'projects', this.projectId, 'edges', edge.id);
					
					// Use set with merge to update edge - more robust than update
					batch.set(edgeRef, {
						source: edge.source,
						target: edge.target,
						type: edge.type,
						style: edge.style,
						updatedAt: new Date()
					}, { merge: true });
				}
			});

			await batch.commit();
			console.log('Batch save completed successfully - positions should be updated in Firestore');
			
			// Clear the flag after a delay to allow Firestore to propagate changes
			setTimeout(() => {
				this.isUpdatingPositions = false;
			}, 1000);
		} catch (error) {
			console.error('Failed to save batch - positions not updated in Firestore:', error);
			console.error('Error details:', {
				projectId: this.projectId,
				nodeCount: nodes.length,
				edgeCount: edges.length,
				error: error instanceof Error ? error.message : String(error)
			});
			this.isUpdatingPositions = false;
		}
	}

	async saveBatchOptimized(nodes: Node[], edges: Edge[], previousNodes?: Node[], previousEdges?: Edge[]): Promise<void> {
		try {
			console.log('FirebaseNodesService.saveBatchOptimized called with:', {
				currentNodes: nodes.length,
				previousNodes: previousNodes?.length || 0,
				nodeIds: nodes.map(n => ({ id: n.id, position: n.position, templateType: n.data?.templateType }))
			});
			
			const changedNodes = this.getChangedNodes(nodes, previousNodes || []);
			const changedEdges = this.getChangedEdges(edges, previousEdges || []);
			
			console.log('Changed nodes detected:', changedNodes.map(n => ({ 
				id: n.id, 
				position: n.position, 
				templateType: n.data?.templateType 
			})));
			
			if (changedNodes.length === 0 && changedEdges.length === 0) {
				console.log('No changes detected, skipping batch update');
				return;
			}

			console.log('FirebaseNodesService.saveBatchOptimized: updating', changedNodes.length, 'nodes and', changedEdges.length, 'edges');
			
			this.isUpdatingPositions = true;
			const batch = writeBatch(db);

			// Update only changed nodes
			for (const node of changedNodes) {
				if (!node.id || !node.position) {
					console.warn('Skipping node with invalid ID or position:', { id: node.id, position: node.position });
					continue;
				}
				
				const nodeRef = doc(db, 'projects', this.projectId, 'nodes', node.id);
				
				batch.set(nodeRef, {
					position: node.position,
					updatedAt: new Date()
				}, { merge: true });
			}

			// Update only changed edges
			for (const edge of changedEdges) {
				if (edge.id) {
					const edgeRef = doc(db, 'projects', this.projectId, 'edges', edge.id);
					batch.set(edgeRef, {
						source: edge.source,
						target: edge.target,
						type: edge.type,
						style: edge.style,
						updatedAt: new Date()
					}, { merge: true });
				}
			}

			await batch.commit();
			console.log('Optimized batch save completed successfully');
			
			setTimeout(() => {
				this.isUpdatingPositions = false;
			}, 1000);
		} catch (error) {
			console.error('Failed to save optimized batch:', error);
			this.isUpdatingPositions = false;
		}
	}

	private getChangedNodes(currentNodes: Node[], previousNodes: Node[]): Node[] {
		const previousNodeMap = new Map(previousNodes.map(node => [node.id, node]));
		
		return currentNodes.filter(currentNode => {
			const previousNode = previousNodeMap.get(currentNode.id);
			if (!previousNode) {
				// New node
				return true;
			}
			
			// Check if position changed (main concern for batch updates)
			const positionChanged = 
				currentNode.position.x !== previousNode.position.x ||
				currentNode.position.y !== previousNode.position.y;
			
			return positionChanged;
		});
	}

	private getChangedEdges(currentEdges: Edge[], previousEdges: Edge[]): Edge[] {
		const previousEdgeMap = new Map(previousEdges.map(edge => [edge.id, edge]));
		
		return currentEdges.filter(currentEdge => {
			const previousEdge = previousEdgeMap.get(currentEdge.id);
			if (!previousEdge) {
				// New edge
				return true;
			}
			
			// Check if edge properties changed
			const edgeChanged = 
				currentEdge.source !== previousEdge.source ||
				currentEdge.target !== previousEdge.target ||
				currentEdge.type !== previousEdge.type;
			
			return edgeChanged;
		});
	}

	// Helper method to recursively filter out undefined values
	private filterUndefinedValues(obj: any): any {
		if (obj === null || typeof obj !== 'object') {
			return obj;
		}

		if (Array.isArray(obj)) {
			return obj.map(item => this.filterUndefinedValues(item));
		}

		const filtered: any = {};
		for (const [key, value] of Object.entries(obj)) {
			if (value !== undefined) {
				filtered[key] = this.filterUndefinedValues(value);
			}
		}
		return filtered;
	}

	subscribeToNodes(callback: (nodes: Node[]) => void): () => void {
		console.log('Setting up Firebase nodes subscription for project:', this.projectId);
		
		const nodesCollection = collection(db, 'projects', this.projectId, 'nodes');
		// Order by updatedAt ascending (older/less recently updated nodes first, so newer ones render on top)
		const q = query(nodesCollection, orderBy('updatedAt', 'asc'));

		const unsubscribe = onSnapshot(q, (snapshot) => {
			console.log('Firebase nodes subscription received update:', snapshot.docs.length, 'nodes');
			
			// Skip subscription updates while we're updating positions to prevent conflicts
			if (this.isUpdatingPositions) {
				console.log('Skipping subscription update - positions are being saved');
				return;
			}
			
			const validNodes: Node[] = [];
			const invalidNodes: Array<{ id: string; data: any }> = [];
			
			const nodes = snapshot.docs.map(doc => {
				const data = doc.data();
				
				// Validate node data before processing
				const isValid = this.validateNodeData(doc.id, data);
				if (!isValid) {
					invalidNodes.push({ id: doc.id, data });
					return null;
				}
				
				const node = {
					id: doc.id, // Use the Firestore document ID
					type: data.type,
					position: data.position,
					data: {
						id: doc.id,
						templateType: data.templateType,
						nodeData: data.nodeData,
						projectSlug: data.projectSlug
					},
					// Include metadata for sorting purposes
					updatedAt: data.updatedAt,
					createdAt: data.createdAt
				} as Node & { updatedAt: any, createdAt: any };
				
				console.log('Mapped valid node:', node);
				validNodes.push(node);
				return node;
			}).filter(node => node !== null);
			
			// Log invalid nodes for debugging
			if (invalidNodes.length > 0) {
				console.warn('Found invalid nodes (filtered out):', invalidNodes);
				
				// Optionally auto-cleanup invalid nodes (commented out for safety)
				// this.cleanupInvalidNodes(invalidNodes);
			}
			
			// Nodes are already ordered by updatedAt from Firestore query
			// Older nodes come first (render behind), newer/recently updated nodes come last (render on top)
			callback(nodes);
		}, (error) => {
			console.error('Firebase nodes subscription error:', error);
		});

		return unsubscribe;
	}

	subscribeToEdges(callback: (edges: Edge[]) => void): () => void {
		const edgesCollection = collection(db, 'projects', this.projectId, 'edges');
		const q = query(edgesCollection, orderBy('updatedAt', 'desc'));

		const unsubscribe = onSnapshot(q, (snapshot) => {
			const edges = snapshot.docs.map(doc => ({
				...doc.data(),
				id: doc.id // Use the Firestore document ID
			} as Edge));
			
			// Only call the callback - don't update local state directly
			// The Canvas component will handle state updates through the callback
			callback(edges);
		});

		return unsubscribe;
	}

	getStatusCounts(): { todo: number; doing: number; done: number } {
		const nodes = this.getNodesCallback();
		const counts = { todo: 0, doing: 0, done: 0 };
		
		nodes.forEach(node => {
			const nodeData = node.data?.nodeData as Record<string, unknown> | undefined;
			const status = nodeData?.status;
			if (status === 'To Do') {
				counts.todo++;
			} else if (status === 'Doing') {
				counts.doing++;
			} else if (status === 'Done') {
				counts.done++;
			}
		});
		
		return counts;
	}

	private validateNodeData(nodeId: string, data: any): boolean {
		// Check for required fields
		if (!data) {
			console.warn(`Node ${nodeId}: No data found`);
			return false;
		}

		// Check for required position data
		if (!data.position || typeof data.position.x !== 'number' || typeof data.position.y !== 'number') {
			console.warn(`Node ${nodeId}: Invalid or missing position data`, data.position);
			return false;
		}

		// Check for templateType
		if (!data.templateType || typeof data.templateType !== 'string') {
			console.warn(`Node ${nodeId}: Invalid or missing templateType`, data.templateType);
			return false;
		}

		// Check for nodeData - this is critical as blank nodes typically have missing nodeData
		if (!data.nodeData || typeof data.nodeData !== 'object') {
			console.warn(`Node ${nodeId}: Invalid or missing nodeData - this is likely a blank node`, data.nodeData);
			return false;
		}

		// Additional check for completely empty nodeData
		if (Object.keys(data.nodeData).length === 0) {
			console.warn(`Node ${nodeId}: Empty nodeData object - this is likely a blank node`);
			return false;
		}

		// Check for basic node type
		if (!data.type || data.type !== 'universal') {
			console.warn(`Node ${nodeId}: Invalid node type`, data.type);
			return false;
		}

		return true;
	}

	// Optional cleanup method for invalid nodes (commented out in subscription for safety)
	private async cleanupInvalidNodes(invalidNodes: Array<{ id: string; data: any }>): Promise<void> {
		console.log(`Starting cleanup of ${invalidNodes.length} invalid nodes`);
		
		for (const invalidNode of invalidNodes) {
			try {
				console.log(`Cleaning up invalid node: ${invalidNode.id}`, invalidNode.data);
				await this.deleteNode(invalidNode.id);
				console.log(`Successfully cleaned up invalid node: ${invalidNode.id}`);
			} catch (error) {
				console.error(`Failed to cleanup invalid node ${invalidNode.id}:`, error);
			}
		}
	}
}