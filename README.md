# Borg

A visual project management and knowledge organization platform built with SvelteKit. Borg combines canvas-based project visualization with traditional task management, creating a collaborative workspace where teams can organize projects, tasks, timelines, and knowledge in an interconnected visual interface.

## Features

### 🎨 Visual Canvas Interface

- **Project Canvas**: Individual project workspaces with rich node-based content
- **Project Portfolio**: Overview canvas showing all projects with summary information
- **Universal Nodes**: Support for notes (Post-It style), images, iframes, and stickers
- **Drag & Drop**: Intuitive visual organization with @xyflow/svelte

### 📋 Task Management

- **Node-Centric Tasks**: Tasks attached to specific canvas elements
- **Person Assignment**: Assign tasks to team members with profile integration
- **Due Dates**: Track deadlines with overdue detection
- **Status Tracking**: Active/resolved task states with reactivation capability
- **Hierarchical Views**: Organize tasks by Project → Node → Task structure

### 👥 Collaboration

- **People Management**: Team member profiles and contact information
- **Project Collaboration**: Multi-user access with member/collaborator roles
- **Real-time Updates**: Live synchronization when using Firebase backend
- **Timeline Events**: Track project milestones and important dates

## Getting Started

### Prerequisites

- Node.js 22.18 or newer (the test runner uses native TypeScript support)
- pnpm

### Installation

```bash
# Install dependencies
pnpm install

# Set up environment
cp .env.example .env
```

### Development

```bash
# Run Firebase emulators (Docker must be running)
docker compose up -d

# Start app against the local emulators
VITE_FIREBASE_PROJECT_ID=demo-borg pnpm dev
```

When using Firebase emulators, the fake Google Sign-In dialog will let you create fake accounts and sign in with any email address. Use an email starting with "admin" (e.g., `admin@example.com`) to automatically get admin permissions.

### Building

```bash
# Create production build
pnpm build

# Preview production build
pnpm preview
```

## Code Quality

```bash
# Type checking
pnpm check

# Regression tests
pnpm test

# Linting and formatting
pnpm lint
pnpm format
```

Application dataflow and ownership rules are documented in [ARCHITECTURE.md](ARCHITECTURE.md).
Services are composed once per root layout and accessed through typed Svelte context.
Feature state coordinates queries, while Firebase adapters handle persistence.
The regression suite covers dataflow boundaries, stale responses, authentication races,
subscription cleanup, and canvas persistence without Firebase credentials or emulators.

### Local browser regression test

Start Docker and the emulator, then run a separate development server:

```bash
docker compose up -d
VITE_FIREBASE_PROJECT_ID=demo-borg VITE_FIREBASE_API_KEY=demo-key pnpm dev --host 127.0.0.1 --port 5179
```

In another terminal, run `pnpm test:browser`. The test uses installed Google Chrome
on macOS; otherwise run `pnpm exec playwright install chromium` first or provide
`BROWSER_EXECUTABLE_PATH`. It creates uniquely named test accounts and projects in
`demo-borg`, blocks external traffic, and verifies rejected writes, form retry,
authenticated tabs, canvas creation, and persistence after reload. It never clears
existing emulator data. Outline and production presence are outside this local test.
