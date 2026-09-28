# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development

- `pnpm dev` - Start development server (uses pnpm, not npm)
- `pnpm build` - Build production version
- `pnpm preview` - Preview production build

### Code Quality

- `pnpm lint` - Run prettier check and eslint
- `pnpm format` - Format code with prettier
- `pnpm test` - Run regression and architecture tests
- `pnpm check` - Run Svelte type checking
- `pnpm check:watch` - Run Svelte type checking in watch mode

### Firebase Emulator (for testing)

- `docker-compose up` - Start Firebase emulators via Docker
- Access Firebase UI at http://localhost:4000
- Emulator ports: Auth (9099), Firestore (8080), Storage (9199)

## Architecture Overview

### Service Architecture Pattern

Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing application dataflow.
`src/lib/app/createAppServices.ts` is the composition root: it constructs adapters,
injects dependencies, and creates session-scoped state. The root layout provides
services through typed Svelte context; components call `getAppServices()` during
initialization. Do not reintroduce global service instances or instantiate Firebase
adapters in components.

Feature factories in `src/lib/features/` coordinate queries and joins through
service interfaces. `src/lib/state/resource.ts` provides loading/error state,
latest-request-wins behavior, and subscription disposal. UI owns presentation
state; adapters own SDK calls and serialization. Services must not import Svelte
stores or component state. Asynchronous service operations always return Promises.

For canvas-scoped live tasks, use the injected `ProjectStore` via project context
rather than opening a listener per node. `connectCanvas` owns subscription lifetime;
`CanvasPersistence` owns pending geometry, serial writes, and retries.
`NodeService` coordinates node operations; `FirebaseNodesRepository` handles storage.

Run `pnpm test` (Node 22.18+) for regression and architecture checks. Tests can run
without Firebase credentials or emulators; they do not replace integration testing.

### Key Service Interfaces

All services implement interfaces in `src/lib/services/interfaces/`:

- `IProjectsService` - Project management
- `ITaskService` - Task management with hierarchical support
- `IPeopleService` - People/contact management
- `ITimelineService` - Timeline events
- `INodesService` - Canvas node management (uses @xyflow/svelte)
- `IStickerService` - Sticker/image management
- `IUserService` - User profile management

### Firebase Configuration

- Firebase config in `src/lib/firebase/config.ts`
- Auto-connects to emulators when project ID starts with 'demo-'
- Emulator setup via Docker with `firebase.emulator.docker.json`

### Authentication

- Firebase Auth integration via `authStore` (Svelte store)
- User approval system with member/collaborator roles
- Authentication wrapper in `+layout.svelte`

### Frontend Stack

- **SvelteKit 5** with TypeScript
- **TailwindCSS 4** for styling
- **@xyflow/svelte** for canvas/flow diagrams
- **Lucide Svelte** for icons

### Component Structure

- `src/lib/components/` - Reusable components
- `src/lib/components/UniversalNode/` - Canvas node types (Note, Sticker, Image, Iframe)
- `src/lib/components/browser/` - Tab-based browser interface components
- `src/lib/components/fields/` - Dynamic form field system
- `src/lib/components/tasks/` - Task management UI

### Key Patterns

- One composition root with explicit dependencies and typed application context
- Interface-based design for service abstractions (`src/lib/services/interfaces/`)
- Svelte stores for state management (`authStore` for auth, `ProjectStore` for canvas-scoped live data via context)
- Dynamic field rendering system for extensible forms
- Canvas-based project visualization with node system

### Environment Variables

- Firebase config variables (API keys, project ID, etc.)
- Use `demo-` prefix in project ID to enable emulator mode

### Development Notes

- Uses pnpm package manager
- Firebase emulator setup supports full development workflow
- Authentication required for all data access
