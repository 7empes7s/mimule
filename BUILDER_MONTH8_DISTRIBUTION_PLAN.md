# Builder Platform Month 8 — Distribution v1: Single-Binary Portable Edition

Last updated: 2026-05-16 UTC
Owner: Marouane Defili
Target app: `/opt/opencode-control-surface/`
Parent plan: `/root/BUILDER_PLATFORM_12_MONTH_PLAN.md` (Month 8)
Related: `/root/BUILDER_MONTH7_MULTITENANCY_PLAN.md`

---

## Theme

**Compile the platform. Ship it as a binary. Install in 60 seconds on any Ubuntu/Debian box.** This is the prerequisite for design-partner demos. Without a clean install story we have nothing to put in front of customers.

---

## Context for the Agent

The control surface lives at `/opt/opencode-control-surface/`.

Key existing modules (do not break these):
- `server/db/dashboard.ts` — uses `bun:sqlite` (NOT better-sqlite3) — compatible with `bun build --compile`
- `server/index.ts` — main server entrypoint; will become the compile target
- `app/App.tsx` — add `/install` and `/about` routes
- `app/components/DashSidebar.tsx` — add About nav entry
- `server/api/router.ts` — add version/update-check endpoints

**No new npm/bun packages.** Use only what's already in `package.json`.

Pre-existing baseline (never regress):
- `bun run check 2>&1 | grep "error TS" | wc -l` → 0
- `bun test server/db/ server/api/ server/tenancy/ server/orchestrator/ 2>&1 | grep -E "pass|fail" | tail -3` → 135+ pass
- Build: `bun run build` clean with known large-chunk warning only

After edits: `systemctl restart control-surface && sleep 3 && curl -s http://127.0.0.1:3000/health`

PASS_RESULT.json is mandatory — write it before exit.

---

## Phase 1 — Version System

- [x] Add `server/version.ts`:
  - Export `VERSION = "0.8.0"` (semver, bump each month)
  - Export `BUILD_COMMIT` — reads from `process.env.BUILD_COMMIT ?? "dev"`
  - Export `BUILD_TIME` — reads from `process.env.BUILD_TIME ?? new Date().toISOString()`
  - Export `getVersionInfo(): VersionInfo` — returns `{ version, commit, buildTime, nodeEnv, platform: process.platform, arch: process.arch }`
- [x] Expose `GET /api/version` (no auth) returning `getVersionInfo()` — add to `server/api/router.ts`
- [x] Update `GET /health` to include `version` field from `getVersionInfo()`
- [x] Write `server/version.test.ts`: version matches semver pattern; `getVersionInfo()` has all required fields
- [x] Run typecheck + tests + build

## Phase 2 — Compile Pipeline

- [x] Add `build:binary` script to `package.json`:
  ```
  "build:binary": "bun run build && BUILD_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo dev) BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) bun build --compile --target=bun-linux-x64 --outfile=dist/tib-builder server/main.ts"
  ```
  Note: `server/main.ts` is the entry point — create it if it doesn't exist (it should just re-export from `server/index.ts`)
- [x] Create `server/main.ts` if missing: imports and calls `startServer()` from `server/index.ts`; also serves the pre-built `dist/` static assets from `process.env.STATIC_DIR ?? "./dist"` if the path exists
- [x] Add `build:docker` script: `"build:docker": "docker build -t tib-builder:latest ."`
- [x] Verify `bun run build:binary` produces `dist/tib-builder` binary under 150MB (target <80MB)
  - If `bun build --compile` fails due to native module issues, fall back: write a `dist/tib-builder` shell wrapper that sets env vars and runs `bun server/main.ts` from the install dir — document the limitation clearly
- [x] Add `scripts/` dir check: `dist/tib-builder --version` prints the version string
- [x] Run typecheck + tests + `bun run build:binary`

## Phase 3 — Installer Artifacts

- [x] Create `installer/` directory with:
  - `install.sh` — bash installer script:
    - Detects OS (Ubuntu/Debian only; exits with message on others)
    - Installs Bun if not present (`curl -fsSL https://bun.sh/install | bash`)
    - Downloads `tib-builder` binary to `/usr/local/bin/tib-builder` (placeholder download URL: `https://releases.tib-builder.dev/latest/tib-builder-linux-x64`)
    - Creates `/var/lib/tib-builder/` data directory
    - Writes `/etc/tib-builder/config.yaml` with default config (port 3000, data_dir, operator_token placeholder)
    - Writes and enables `tib-builder.service` systemd unit
    - Prints "Dashboard reachable at http://localhost:3000 — open to complete setup"
  - `systemd/tib-builder.service` — systemd unit file:
    ```
    [Unit]
    Description=TIB Builder Platform
    After=network.target
    [Service]
    Type=simple
    ExecStart=/usr/local/bin/tib-builder
    EnvironmentFile=-/etc/tib-builder/config.env
    WorkingDirectory=/var/lib/tib-builder
    Restart=always
    RestartSec=5
    [Install]
    WantedBy=multi-user.target
    ```
  - `docker/Dockerfile`:
    ```
    FROM oven/bun:1 AS builder
    WORKDIR /app
    COPY package.json bun.lockb ./
    RUN bun install --frozen-lockfile
    COPY . .
    RUN bun run build

    FROM oven/bun:1-slim
    WORKDIR /app
    COPY --from=builder /app/dist ./dist
    COPY --from=builder /app/server ./server
    COPY --from=builder /app/package.json .
    COPY --from=builder /app/bun.lockb .
    RUN bun install --frozen-lockfile --production
    ENV NODE_ENV=production PORT=3000
    EXPOSE 3000
    CMD ["bun", "server/main.ts"]
    ```
  - `docker/compose.yaml`:
    ```yaml
    services:
      tib-builder:
        build: ../..
        ports: ["3000:3000"]
        volumes:
          - tib-data:/var/lib/tib-builder
        environment:
          DATA_DIR: /var/lib/tib-builder
          OPERATOR_TOKEN: changeme
    volumes:
      tib-data:
    ```
  - `README.md` — 3-section install guide: Quick Install (curl), Docker, Air-Gapped
- [x] Run typecheck + build (installer files are static — just verify `bun run build` still passes)

## Phase 4 — Update Check + About API

- [x] Add `server/updater.ts`:
  - `checkForUpdate(): Promise<UpdateInfo | null>` — GETs `https://releases.tib-builder.dev/latest/version.json` (with 5s timeout); if fetch fails or returns non-200, returns `null` (never throws); compares to `VERSION`; returns `{ latestVersion, releaseUrl, changelog }` if newer, `null` if current or unreachable
  - `getCachedUpdateInfo()` — caches last check result for 24h in memory; returns cached or calls `checkForUpdate()`; first call is lazy (on first `/api/version` hit)
- [x] Add `updateAvailable` field to `GET /api/version` response (uses `getCachedUpdateInfo()` — non-blocking, returns `null` if not yet checked)
- [x] Add `POST /api/update-check` (operator-auth) — forces a fresh update check and returns result
- [x] Write `server/updater.test.ts`: mock fetch returning newer version → returns update info; mock fetch timeout → returns null; same version → returns null
- [x] Run typecheck + tests + build

## Phase 5 — Installation Wizard + About Page

- [x] Create `app/routes/AboutPage.tsx`:
  - "About TIB Builder" header
  - Version info card: version badge, build commit (monospace), build time, platform/arch
  - "Update Available" banner if `updateAvailable` is non-null: shows latest version + "View Release" link
  - "Check for Updates" button → calls `POST /api/update-check` → refreshes display
  - Install paths section: binary path (from `import.meta.env`), data dir, config file
  - Runtime stats: uptime (from `GET /api/home`), memory usage, SQLite path
- [x] Create `app/routes/InstallWizardPage.tsx`:
  - Step 1 — Operator Token: input for token, saves to `PATCH /api/operator-state` (key: `operator_token_set`, value: `"true"`)
  - Step 2 — Model Provider: select OpenRouter / LiteLLM / Ollama; input for API key or base URL; test connection via `POST /api/gateway/test` if available, otherwise skip
  - Step 3 — First Project: detect local repo via `POST /api/projects/detect`; confirm or manually enter; saves via `POST /api/projects`
  - Step 4 — Done: shows checkmarks, links to `/builder` and `/projects`
  - Wizard state stored in `localStorage` as `installWizardStep`; completed state stored as `installWizardDone = "true"`; completed wizard redirects to `/` automatically
  - Show "Setup" link in sidebar only if `installWizardDone` is not set
- [x] Add `/about` route to `app/App.tsx`
- [x] Add `/install` route to `app/App.tsx`
- [x] Add `About` nav entry to `app/components/DashSidebar.tsx` (bottom section, `Info` icon)
- [x] Add `Setup` nav entry that shows only when `installWizardDone !== "true"` in localStorage
- [x] Run typecheck + build + restart + verify `/about` and `/install` load

## Phase 6 — Exit Criteria Validation

- [x] `GET /api/version` → 200, includes `version: "0.8.0"`, `platform`, `arch`
- [x] `GET /health` → includes `version` field
- [x] `bun run build:binary` → produces `dist/tib-builder`; `dist/tib-builder --version` prints version (or binary wrapper works)
- [x] `installer/install.sh` exists and is valid bash (`bash -n installer/install.sh`)
- [x] `installer/docker/Dockerfile` exists
- [x] `/about` loads in browser, shows version info
- [x] `/install` loads in browser, shows wizard steps
- [x] About nav entry visible in sidebar
- [x] Full test suite: `bun test server/db/ server/api/ server/tenancy/ server/orchestrator/ 2>&1 | grep -E "pass|fail"` → 135+ pass
- [x] Typecheck: 0 errors
- [x] Build: clean

---

## Exit Criteria

- `bun run check` → 0 errors
- `bun test server/db/ server/api/ server/tenancy/ server/orchestrator/` → 135+ pass
- `bun run build` → clean
- `bun run build:binary` → produces `dist/tib-builder`
- `GET /api/version` → 200 with version, platform, arch
- `GET /health` → includes version field
- `bash -n installer/install.sh` → valid bash syntax
- `/about` route loads in browser
- `/install` wizard route loads in browser

---

## Notes for the Agent

- **Never touch `/opt/newsbites`, `/opt/mimoun`, `/opt/paperclip`** — those are live services.
- **No new npm/bun packages** — use built-in Bun APIs only.
- **No API keys in code**.
- Pre-existing TS errors: 0 — do NOT introduce any.
- The DB uses `bun:sqlite` (not better-sqlite3) — `bun build --compile` should work without native module issues.
- If `bun build --compile` produces a binary that crashes at startup (e.g. missing file descriptor for SQLite), fall back to a shell wrapper script at `dist/tib-builder` that does: `exec bun "$(dirname "$0")/../server/main.ts" "$@"`. Document the fallback clearly in `installer/README.md`.
- The `install.sh` download URL (`https://releases.tib-builder.dev/...`) is a placeholder — it does not need to resolve. The script is for the distribution artifact, not a live test.
- `POST /api/gateway/test` may not exist yet — the wizard Step 2 should skip connection test gracefully if 404.
- Operator token: `Brighton13`. Gateway at LiteLLM `:4000`.
- After any schema change: restart service and verify `GET /health` returns `{"ok":true}`.


<!-- Builder run br_71ae2: success at 2026-05-16T17:04:50.168Z — details: /opt/ai-vault/builder/2026-05-16-bw_f2fcb-br_71ae2.md -->