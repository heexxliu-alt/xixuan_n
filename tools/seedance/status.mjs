#!/usr/bin/env node
import process from 'node:process';
import { ARK_API_KEY, arkRequest, requireApiKey, sleep, taskStatus, videoUrl } from './config.mjs';

function parseArgs(argv) {
  const args = { watch: false, interval: 5000, timeout: 900000 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--watch') { args.watch = true; continue; }
    if (!arg.startsWith('--') && !args.id) { args.id = arg; continue; }
    const value = argv[++i];
    if (!value) throw new Error(`Missing value for ${arg}`);
    if (arg === '--interval') args.interval = Number(value);
    else if (arg === '--timeout') args.timeout = Number(value);
    else if (arg === '--output') args.output = value;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!args.id) throw new Error('Provide a task ID.');
  return args;
}

export async function runStatus(id, options = {}) {
  const started = Date.now();
  let latest;
  do {
    latest = await arkRequest(`/contents/generations/tasks/${encodeURIComponent(id)}`, { method: 'GET' });
    const status = taskStatus(latest);
    console.log(JSON.stringify({ taskId: id, status, videoUrl: videoUrl(latest) || undefined }, null, 2));
    if (!options.watch || ['succeeded', 'failed', 'expired', 'cancelled'].includes(String(status).toLowerCase())) break;
    if (Date.now() - started >= (options.timeout || 900000)) throw new Error('Polling timeout reached.');
    await sleep(options.interval || 5000);
  } while (true);
  if (options.downloadPath && videoUrl(latest)) {
    const { downloadVideo } = await import('./download.mjs');
    await downloadVideo(videoUrl(latest), options.downloadPath);
  }
  return latest;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!ARK_API_KEY) { requireApiKey(); return; }
  await runStatus(args.id, args);
}

main().catch((error) => { console.error(`Seedance status failed: ${error.message}`); process.exitCode = 1; });
