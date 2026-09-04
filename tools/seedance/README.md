# Seedance local toolchain

This is a project-local, vanilla Node.js integration for Volcengine Ark's Seedance video API. It does not change the website runtime and does not install React, shadcn, components, or third-party packages.

## API flow

- `generate.mjs` sends one `POST /api/v3/contents/generations/tasks` request (CreateContentsGenerationsTasks).
- `status.mjs` reads one task with `GET /api/v3/contents/generations/tasks/:id` (GetContentsGenerationsTask). `--watch` polls only the existing task.
- `download.mjs` downloads a successful `video_url` into `assets/generated/transitions/` by default.

The scripts make no automatic generation retry and never batch candidate generations. A second generation requires a new explicit command.

## Safe local configuration

Copy `.env.example` to `.env` and set `ARK_API_KEY` plus an enabled current `SEEDANCE_MODEL_ID` (a model ID or Ark endpoint ID). `.env` is ignored by Git. The scripts do not print the key.

This project has no package.json or Node runtime on the normal shell PATH, so use the bundled Node executable supplied by Codex, or any local Node.js 18+ installation. No dependency is required; the scripts use the built-in `fetch` available in modern Node.

## Commands

```bash
node tools/seedance/generate.mjs --prompt "..."
node tools/seedance/status.mjs <task-id> --watch --output assets/generated/transitions/ltpo-cave-entry-v01.mp4
node tools/seedance/download.mjs --url "<video_url>" --output assets/generated/transitions/ltpo-cave-entry-v01.mp4
```

Reference inputs are prepared with `--image-url`, `--video-url`, and `--audio-url` (repeatable). A local file path is not uploaded automatically; provide a URL accepted by Ark when reference media is needed.

## No-cost validation

With no `ARK_API_KEY`, any command exits normally with:

```text
Seedance configured — ARK_API_KEY required.
```

This is intentional and does not create a generation task. Syntax validation can run without credentials:

```bash
node --check tools/seedance/config.mjs
node --check tools/seedance/generate.mjs
node --check tools/seedance/status.mjs
node --check tools/seedance/download.mjs
```
