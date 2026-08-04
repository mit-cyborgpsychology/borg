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
- `pnpm check` - Run Svelte type checking
- `pnpm check:watch` - Run Svelte type checking in watch mode

### Firebase Emulator (for testing)
- `docker-compose up` - Start Firebase emulators via Docker
- Access Firebase UI at http://localhost:4000
- Emulator ports: Auth (9099), Firestore (8080), Storage (9199)

## Architecture Overview

### Service Architecture Pattern
All data is stored in Firebase — there is no local-storage mode. No-arg services
(Projects, Tasks, People, Sticker, User, Outline) are shared singletons exported
from `src/lib/services/instances.ts` and imported directly wherever needed.
Services that require constructor arguments (Nodes — takes a project ID and
state callbacks; Timeline — takes an optional project ID) are constructed
directly at each call site with `new FirebaseXService(...)`, since they can't
be shared singletons.

For canvas-scoped live data (currently: a project's tasks), components read
from a `ProjectStore` (`src/lib/stores/ProjectStore.svelte.ts`) provided via
Svelte context (`src/lib/stores/projectStoreContext.ts`) rather than opening
their own Firestore subscription — this keeps read/listener volume constant
per open project regardless of how many canvas nodes are rendered.

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
- No-arg services as shared singletons (`src/lib/services/instances.ts`); constructor-arg services instantiated directly at each call site
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