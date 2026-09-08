import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
const ENV_PATH = process.env.SEEDANCE_ENV_FILE || path.join(REPO_ROOT, '.env');

function loadLocalEnv(filePath = ENV_PATH) {
  if (!fs.existsSync(filePath)) return;

  const source = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;

    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

loadLocalEnv();

export const ARK_API_BASE_URL = (process.env.ARK_API_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, '');
export const ARK_API_KEY = process.env.ARK_API_KEY || '';
export const SEEDANCE_MODEL_ID = process.env.SEEDANCE_MODEL_ID || process.env.ARK_MODEL_ID || '';
export const SEEDANCE_OUTPUT_DIR = process.env.SEEDANCE_OUTPUT_DIR || 'assets/generated/transitions';

export function printKeyRequired() {
  console.log('Seedance configured — ARK_API_KEY required.');
}

export function requireApiKey() {
  if (!ARK_API_KEY) {
    printKeyRequired();
    process.exit(0);
  }
  return ARK_API_KEY;
}

export function requireModel(model = SEEDANCE_MODEL_ID) {
  if (!model) {
    throw new Error('SEEDANCE_MODEL_ID is required. Set it to an enabled Seedance model ID or Ark endpoint ID.');
  }
  return model;
}

export function apiUrl(requestPath) {
  return `${ARK_API_BASE_URL}/${String(requestPath).replace(/^\//, '')}`;
}

export function authHeaders() {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${ARK_API_KEY}`,
  };
}

export async function arkRequest(requestPath, options = {}) {
  const response = await fetch(apiUrl(requestPath), {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    const detail = body?.error?.message || body?.message || body?.raw || response.statusText;
    throw new Error(`Ark API ${response.status}: ${detail}`);
  }
  return body;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function taskStatus(body) {
  return body?.status || body?.data?.status || body?.Result?.status || body?.Result?.Status || 'unknown';
}

export function taskId(body) {
  return body?.id || body?.data?.id || body?.Result?.id || body?.Result?.Id || '';
}

export function videoUrl(body) {
  const output = body?.content?.find?.((item) => item?.type === 'video_url');
  return body?.video_url || body?.videoUrl || body?.data?.video_url || body?.data?.videoUrl || output?.video_url?.url || output?.url || '';
}
