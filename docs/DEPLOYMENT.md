# Deployment

MonetaFox Reborn is an offline-first PWA built with Vite + React 19. The
production build is a static bundle (`dist/`) that can be hosted on any static
host; this repo ships a GitHub Pages deployment workflow.

## Build locally

```sh
corepack pnpm install
corepack pnpm run build
```

Output lands in `dist/`. The build runs `tsc -b` (typecheck) and `vite build`,
emitting hashed JS/CSS, `index.html`, `manifest.webmanifest`, and the
Workbox service worker (`sw.js`).

Preview the production build locally (served at `/`, so no base path needed):

```sh
corepack pnpm preview
```

## GitHub Pages deploy

The **Deploy** workflow (`.github/workflows/deploy.yml`) runs on every push to
`main` and on manual dispatch. It:

1. Builds the app with `VITE_BASE_PATH=/MonetaFoxReborn/` so all asset URLs and
   the PWA manifest are rooted under the project path.
2. Copies `dist/index.html` → `dist/404.html` so client-route refreshes fall
   back to the app shell (GitHub Pages serves `404.html` for unknown paths).
3. Uploads `dist/` via `actions/upload-pages-artifact`.
4. Publishes via `actions/deploy-pages`.

The job uses the official GitHub Pages OIDC flow and requires the workflow
permissions `pages: write` and `id-token: write` (already set in the file).

### One-time repo setup

1. **Settings → Pages → Build and deployment → Source**: choose
   **GitHub Actions** (not "Deploy from a branch"). The deploy workflow
   publishes the site; you do not configure a branch.
2. Ensure workflows are enabled for the repo (Settings → Actions → General).
3. After the first successful run, the site lives at
   `https://<owner>.github.io/MonetaFoxReborn/`.

### Base path note

A project Pages site is served under `/<repo>/` rather than `/`. Vite's `base`
option rewrites every asset URL (`<script src>`, `<link href>`, the manifest,
the service worker, icons) to that prefix, so the build is portable. The value
is read from the `VITE_BASE_PATH` env var in `vite.config.ts`:

```ts
const base = process.env.VITE_BASE_PATH ?? '/';
```

- Local dev / `pnpm preview` / the CI build job: unset → `/` (own origin).
- Pages deploy: `VITE_BASE_PATH=/MonetaFoxReborn/`.

`vite-plugin-pwa` derives the manifest `scope`, `start_url`, and the SW
registration path from `base`, so the PWA installs and updates correctly under
the project path with no extra manifest edits. (The explicit `scope: '/'` /
`start_url: '/'` that would force the SW to the root domain were removed in
Phase 13 precisely so the project-path deploy works.)

### SPA fallback (`404.html`)

`public/404.html` mirrors `index.html` so that, in dev, an unknown path still
boots the app. For the production Pages deploy the workflow overwrites
`dist/404.html` with the **built** `dist/index.html` — this is important
because the built `index.html` references the hashed asset bundles, whereas the
`public/` source references `/src/main.tsx`. The result: a refresh on
`/MonetaFoxReborn/transactions` returns the app shell, the React Router reads
`window.location`, and the right view renders.

## PWA update mechanism

The app registers the Workbox service worker via `vite-plugin-pwa` in
`prompt` mode (`registerType: 'prompt'` in `vite.config.ts`). There is **no
silent update** — when a new version is downloaded, the
`src/components/pwa/PwaUpdatePrompt.tsx` banner appears at the bottom of the
screen:

> A new version is available. [Later] [Reload]

Clicking **Reload** calls `updateServiceWorker(true)`, which activates the new
SW and reloads the page so the user is on the new build. **Later** dismisses
the banner for the lifetime of the current tab (the SW activates on the next
full reload). This satisfies the spec requirement that new versions prompt the
user to reload rather than swapping the app underneath them.

## Verifying a deploy

- `dist/manifest.webmanifest` exists and references icons under the base path.
- `dist/sw.js` exists, is non-empty, and contains `workbox`/`precache`.
- `dist/index.html` and `dist/404.html` are byte-identical.
- After deploy, visiting `https://<owner>.github.io/MonetaFoxReborn/` loads
  the app, and refreshing a deep link (e.g. `/accounts`) still works.
