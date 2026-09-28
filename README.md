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

### References library

The References tab displays a central UMAP map with a paper sidebar. Dots are colored
by embedding-based K-means topics, with cached LLM labels. Click a topic label
or choose a topic in the sidebar to filter papers without moving the dots. The map uses
coordinates precomputed by Python after each saved paper via an ingestion hook;
there is no polling. New papers join the nearest saved topic. K-means and topic
labels refresh only at total paper counts divisible by 10 (40, 50, 60, ...). Browser visits and filters never fit UMAP.
Configure private `RESEARCH_MAP_URL` and `RESEARCH_MAP_TOKEN` alongside Grist; see
[worker setup](deploy/research-map/README.md). The sidebar works if the map is unavailable.

The References tab reads the lab's shared papers from Grist, with text search,
source filters, saved-date/title sorting, summaries, and paper/PDF links.
Set `GRIST_API_URL` (including `/api`), `GRIST_API_KEY`,
`GRIST_RESEARCH_DOC_ID`, and optionally `GRIST_RESEARCH_TABLE_ID` (`Table1` by
default) in the server environment. For deployment, configure these in the
Cloudflare environment as well; the API key must remain a secret without a
`VITE_` prefix. The browser receives paper fields only.

`GET /api/research` requires a Firebase ID token and checks the caller's
`users/{uid}.isApproved` record before reading Grist. Vite development with a
`demo-*` project validates emulator accounts on port 9099 and checks approval
through the Firestore emulator on port 8080. Production always verifies signed
Firebase tokens. The tab displays saved dates, not publication dates.

With a local emulator-backed dev server and the research settings configured,
run `BORG_TEST_URL=http://127.0.0.1:5181 node tests/browser/research.mjs`.
This checks the live research library and access controls, then simulates error
and empty states in the browser. It creates test users only in `demo-borg` and
does not write to Grist.

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
