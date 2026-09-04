#!/usr/bin/env node
import process from 'node:process';
import { ARK_API_KEY, SEEDANCE_MODEL_ID, arkRequest, requireApiKey, requireModel } from './config.mjs';

function usage() {
  console.log(`Usage: node tools/seedance/generate.mjs --prompt "..." [options]

Options:
  --model <id>             Seedance model ID or Ark endpoint ID (or SEEDANCE_MODEL_ID)
  --image-url <url>        Reference image URL (repeatable)
  --video-url <url>        Reference video URL (repeatable)
  --audio-url <url>        Reference audio URL (repeatable)
  --duration <seconds>     Integer duration, for example 5
  --ratio <ratio>          16:9, 4:3, 1:1, 3:4, 9:16, 21:9, or adaptive
  --resolution <value>     480p, 720p, or 1080p where supported
  --generate-audio         Ask Seedance 2.x to generate synchronized audio
  --watermark              Include a watermark (default is false)
  --wait                   Poll until completion (does not retry generation)
  --output <filename>      With --wait, download the result to this path
`);
}

function parseArgs(argv) {
  const args = { imageUrls: [], videoUrls: [], audioUrls: [], watermark: false, wait: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') { usage(); process.exit(0); }
    if (arg === '--generate-audio' || arg === '--watermark' || arg === '--wait') { args[arg.slice(2).replaceAll('-', '')] = true; continue; }
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
    if (arg === '--prompt') args.prompt = value;
    else if (arg === '--model') args.model = value;
    else if (arg === '--image-url') args.imageUrls.push(value);
    else if (arg === '--video-url') args.videoUrls.push(value);
    else if (arg === '--audio-url') args.audioUrls.push(value);
    else if (arg === '--duration') args.duration = Number(value);
    else if (arg === '--ratio') args.ratio = value;
    else if (arg === '--resolution') args.resolution = value;
    else if (arg === '--output') args.output = value;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return args;
}

function buildContent(args) {
  const content = [];
  if (args.prompt) content.push({ type: 'text', text: args.prompt });
  for (const url of args.imageUrls) content.push({ type: 'image_url', image_url: { url }, role: 'reference_image' });
  for (const url of args.videoUrls) content.push({ type: 'video_url', video_url: { url }, role: 'reference_video' });
  for (const url of args.audioUrls) content.push({ type: 'audio_url', audio_url: { url }, role: 'reference_audio' });
  if (!content.length) throw new Error('Provide at least --prompt or a reference URL.');
  return content;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!ARK_API_KEY) { requireApiKey(); return; }
  const model = requireModel(args.model || SEEDANCE_MODEL_ID);
  const body = { model, content: buildContent(args), watermark: Boolean(args.watermark) };
  if (Number.isInteger(args.duration)) body.duration = args.duration;
  if (args.ratio) body.ratio = args.ratio;
  if (args.resolution) body.resolution = args.resolution;
  if (args.generateaudio) body.generate_audio = true;

  // Exactly one generation request. No automatic retry or candidate batching.
  const result = await arkRequest('/contents/generations/tasks', { method: 'POST', body: JSON.stringify(body) });
  const id = result?.id || result?.data?.id || result?.Result?.id || '';
  console.log(JSON.stringify({ taskId: id, model, status: result?.status || 'queued' }, null, 2));
  if (args.wait && id) {
    const { runStatus } = await import('./status.mjs');
    await runStatus(id, { downloadPath: args.output });
  }
}

main().catch((error) => { console.error(`Seedance request failed: ${error.message}`); process.exitCode = 1; });
