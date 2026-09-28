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
	type DocumentData
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { buildNodeUpdate } from './nodeUpdates';
import type { CanvasNode as Node, CanvasEdge as Edge, NodeUpdate } from '../../types/canvas';
import type { INodesRepository } from '../interfaces/INodesRepository';

export class FirebaseNodesRepository implements INodesRepository {
	constructor(
		private db: Firestore,
		private projectId: string,
		private projectSlug?: string
	) {}

	async createNode(
		templateType: string,
		position: Node['position'],
		nodeDataFields: Record<string, unknown>,
		createdBy: string
	): Promise<Node> {
		// Save to Firestore first to get the real document ID
		const nodeDoc = {
			type: 'universal',
			position: { ...position },
			templateType: templateType,
			nodeData: nodeDataFields,
			...(this.projectSlug && { projectSlug: this.projectSlug }),
			status: nodeDataFields.status || null,
			createdAt: new Date(),
			updatedAt: new Date(),
			createdBy
		};

		const docRef = await addDoc(collection(this.db, 'projects', this.projectId, 'nodes'), nodeDoc);

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

	async updateNode(nodeId: string, updates: NodeUpdate, userId?: string): Promise<boolean> {
		try {
			const nodeRef = doc(this.db, 'projects', this.projectId, 'nodes', nodeId);

			await updateDoc(nodeRef, {
				...buildNodeUpdate(updates),
				updatedAt: new Date(),
				...(userId && { lastEditBy: userId, lastEditAt: new Date() })
			});

			return true;
		} catch (error) {
			console.error('Failed to update node:', error);
			return false;
		}
	}

	async deleteNode(nodeId: string): Promise<boolean> {
		try {
			// Delete from Firestore
			const nodeRef = doc(this.db, 'projects', this.projectId, 'nodes', nodeId);

			// Don't update local state here - the Firebase subscription will handle node removal
			// But we do need to clean up connected edges

			// Delete connected edges from Firestore
			const edgesCollection = collection(this.db, 'projects', this.projectId, 'edges');
			const edgesSnapshot = await getDocs(edgesCollection);
			const batch = writeBatch(this.db);
			batch.delete(nodeRef);

			edgesSnapshot.docs.forEach((edgeDoc) => {
				const edgeData = edgeDoc.data();
				if (edgeData.source === nodeId || edgeData.target === nodeId) {
					batch.delete(edgeDoc.ref);
				}
			});

			await batch.commit();

			return true;
		} catch (error) {
			console.error('Failed to delete node:', error);
			return false;
		}
	}

	async getNodes(): Promise<Node[]> {
		const snapshot = await getDocs(collection(this.db, 'projects', this.projectId, 'nodes'));
		return snapshot.docs.flatMap((doc) => {
			const node = this.toNode(doc.id, doc.data());
			return node ? [node] : [];
		});
	}

	async addEdge(edgeData: Edge): Promise<Edge> {
		// Save to Firestore
		const edgeDoc = {
			...edgeData,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		};

		await addDoc(collection(this.db, 'projects', this.projectId, 'edges'), edgeDoc);

		// Don't update local state here - the Firebase subscription will handle it
		// This prevents duplicate entries when the subscription receives the new edge

		return edgeData;
	}

	async deleteEdge(edgeId: string): Promise<boolean> {
		try {
			// Find and delete from Firestore
			const edgesCollection = collection(this.db, 'projects', this.projectId, 'edges');
			const snapshot = await getDocs(edgesCollection);

			const edgeDoc = snapshot.docs.find((doc) => doc.id === edgeId);
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
			const edgesCollection = collection(this.db, 'projects', this.projectId, 'edges');
			const snapshot = await getDocs(edgesCollection);
			return snapshot.docs.map(
				(doc) =>
					({
						...doc.data(),
						id: doc.id // Use the Firestore document ID
					}) as Edge
			);
		} catch (error) {
			console.error('Failed to get edges:', error);
			throw error;
		}
	}

	async saveBatch(nodes: Node[], edges: Edge[]): Promise<void> {
		if (nodes.length === 0 && edges.length === 0) return;
		const batch = writeBatch(this.db);
		const updatedAt = new Date();
		for (const node of nodes) {
			const nodeRef = doc(this.db, 'projects', this.projectId, 'nodes', node.id);
			const positionUpdate = {
				position: node.position,
				updatedAt
			};
			if (this.projectId === 'project-canvas' && node.type === 'projectCanvas') {
				// Portfolio cards are derived from projects, so their first drag creates
				// a position record. Store a valid node shape for subsequent subscriptions.
				batch.set(
					nodeRef,
					{
						...positionUpdate,
						type: 'universal',
						templateType: 'project',
						nodeData: { projectId: node.id.replace(/^project-/, '') }
					},
					{ merge: true }
				);
			} else {
				batch.update(nodeRef, positionUpdate);
			}
		}
		for (const edge of edges) {
			batch.update(doc(this.db, 'projects', this.projectId, 'edges', edge.id), {
				source: edge.source,
				target: edge.target,
				type: edge.type ?? 'default',
				style: edge.style ?? '',
				updatedAt
			});
		}
		// Updates fail for deleted records instead of recreating incomplete nodes.
		// Let callers retain their pending edits and report/retry failed writes.
		await batch.commit();
	}

	subscribeToNodes(
		callback: (nodes: Node[]) => void,
		onError?: (error: Error) => void
	): () => void {
		const nodes = collection(this.db, 'projects', this.projectId, 'nodes');
		return onSnapshot(
			query(nodes, orderBy('updatedAt', 'asc')),
			(snapshot) => {
				callback(
					snapshot.docs.flatMap((doc) => {
						const node = this.toNode(doc.id, doc.data());
						return node ? [node] : [];
					})
				);
			},
			onError
		);
	}

	subscribeToEdges(
		callback: (edges: Edge[]) => void,
		onError?: (error: Error) => void
	): () => void {
		const edges = collection(this.db, 'projects', this.projectId, 'edges');
		return onSnapshot(
			query(edges, orderBy('updatedAt', 'desc')),
			(snapshot) => {
				callback(snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }) as Edge));
			},
			onError
		);
	}

	private toNode(id: string, data: DocumentData): Node | null {
		// Older portfolio cards stored only a position. Read those records without
		// requiring a migration; subsequent moves write the complete marker shape.
		if (this.projectId === 'project-canvas' && id.startsWith('project-')) {
			data = {
				...data,
				type: 'universal',
				templateType: 'project',
				nodeData: { projectId: id.slice('project-'.length) }
			};
		}
		if (!this.validateNodeData(id, data)) return null;
		return {
			id,
			type: data.type,
			position: data.position,
			data: {
				id,
				templateType: data.templateType,
				nodeData: data.nodeData,
				projectSlug: data.projectSlug
			},
			updatedAt: data.updatedAt,
			createdAt: data.createdAt
		} as Node;
	}

	private validateNodeData(nodeId: string, data: DocumentData): boolean {
		// Check for required fields
		if (!data) {
			console.warn(`Node ${nodeId}: No data found`);
			return false;
		}

		// Check for required position data
		if (
			!data.position ||
			typeof data.position.x !== 'number' ||
			typeof data.position.y !== 'number'
		) {
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
			console.warn(
				`Node ${nodeId}: Invalid or missing nodeData - this is likely a blank node`,
				data.nodeData
			);
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
}
