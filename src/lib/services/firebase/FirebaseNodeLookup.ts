import { doc, getDoc, type Firestore } from 'firebase/firestore';

export function createNodeLookup(db: Firestore) {
	return async (projectId: string, nodeId: string) => {
		const snapshot = await getDoc(doc(db, 'projects', projectId, 'nodes', nodeId));
		if (!snapshot.exists()) return null;
		const data = snapshot.data();
		return {
			nodeData: (data.nodeData ?? {}) as Record<string, unknown>,
			templateType: String(data.templateType ?? '')
		};
	};
}
