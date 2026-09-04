#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { ARK_API_KEY, SEEDANCE_OUTPUT_DIR, requireApiKey, videoUrl } from './config.mjs';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = argv[++i];
    if (!value) throw new Error(`Missing value for ${arg}`);
    if (arg === '--url') args.url = value;
    else if (arg === '--task-json') args.taskJson = value;
    else if (arg === '--output') args.output = value;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!args.url && !args.taskJson) throw new Error('Provide --url or --task-json.');
  return args;
}

export async function downloadVideo(url, output = '') {
  if (!url) throw new Error('No video URL found in task response.');
  const target = output || path.join(SEEDANCE_OUTPUT_DIR, `seedance-${new Date().toISOString().replaceAll(/[-:.TZ]/g, '').slice(0, 14)}.mp4`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Video download failed: ${response.status} ${response.statusText}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(target, buffer);
  console.log(JSON.stringify({ output: target, bytes: buffer.length }, null, 2));
  return target;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!ARK_API_KEY) { requireApiKey(); return; }
  let url = args.url;
  if (args.taskJson) {
    const body = JSON.parse(await fs.readFile(args.taskJson, 'utf8'));
    url = videoUrl(body);
  }
  await downloadVideo(url, args.output);
}

main().catch((error) => { console.error(`Seedance download failed: ${error.message}`); process.exitCode = 1; });
