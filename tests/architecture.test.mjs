import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

async function files(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const nested = await Promise.all(
		entries.map((entry) =>
			entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]
		)
	);
	return nested.flat().filter((file) => /\.(ts|svelte)$/.test(file));
}

async function checkImports(directories, forbidden) {
	const violations = [];
	for (const directory of directories)
		for (const file of await files(directory)) {
			const source = await readFile(file, 'utf8');
			const imports = [...source.matchAll(/(?:from\s+|import\s*\()['"]([^'"]+)['"]/g)].map(
				(match) => match[1]
			);
			for (const imported of imports)
				if (forbidden.test(imported)) violations.push(`${file}: ${imported}`);
		}
	assert.deepEqual(violations, []);
}

test('components depend on application contracts, not Firebase or concrete adapters', async () => {
	await checkImports(['src/lib/components'], /(^firebase\/|\/firebase\/|\/services\/instances$)/);
});

test('services never import UI state, Svelte, or the application composition', async () => {
	await checkImports(
		['src/lib/services'],
		/(^svelte(?:\/|$)|\/stores\/|\/components\/|\/app\/|(?:^|\/)instances$)/
	);
});

test('feature state and shared state never depend on Firebase implementations', async () => {
	await checkImports(
		['src/lib/features', 'src/lib/state', 'src/lib/stores'],
		/(^firebase\/|\/firebase\/|\/createAppServices$)/
	);
});

test('canvas communication is scoped through context rather than document events', async () => {
	for (const file of await files('src/lib/components')) {
		const source = await readFile(file, 'utf8');
		assert.doesNotMatch(
			source,
			/new CustomEvent\(['"](?:nodeEdit|nodeUpdate|nodeDelete|nodeTasksOpen|addTask|addSticker)/,
			file
		);
	}
});
