import { createResource } from './resource.ts';

export type CommandResult<T> = { ok: true; value: T } | { ok: false };

/** One mutation at a time per feature. Failures stay visible and never imply success. */
export function createCommand(options: { queue?: boolean } = {}) {
	const state = createResource<void>(undefined);
	let running = false;
	let disposed = false;
	let tail: Promise<unknown> = Promise.resolve();
	async function execute<T>(operation: () => Promise<T>): Promise<CommandResult<T>> {
		if (running || disposed) return { ok: false };
		running = true;
		let result: CommandResult<T> = { ok: false };
		try {
			await state.load(async () => {
				const value = await operation();
				// Compatibility with legacy boolean mutation contracts.
				if (value === false || value === null)
					throw new Error('The operation could not be completed');
				result = { ok: true, value };
			});
			return disposed ? { ok: false } : result;
		} finally {
			running = false;
		}
	}
	return {
		subscribe: state.subscribe,
		run<T>(operation: () => Promise<T>): Promise<CommandResult<T>> {
			if (!options.queue) return execute(operation);
			const next = tail.then(() => execute(operation));
			tail = next;
			return next;
		},
		dispose() {
			disposed = true;
			state.dispose();
		}
	};
}
