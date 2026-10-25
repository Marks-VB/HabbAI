#!/usr/bin/env node
// Hook do Habblaud para o Antigravity (CLI e IDE/Desktop).
// Registrado em ~/.gemini/config/hooks.json para SessionStart, PreToolUse, PostToolUse e Stop.
import { readFileSync } from 'node:fs';

const DEFAULT_PORT = 4747;
const EVENT_TIMEOUT_MS = 1500;
const WAIT_MS = 25000;

function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', () => resolve(''));
  });
}

async function call(base, path, body, timeoutMs) {
  try {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return await res.json();
  } catch {
    return null;
  }
}

export async function run() {
  const raw = await readStdin();
  if (!raw.trim()) return undefined;

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return undefined;
  }

  // Descobre qual evento está rodando pela flag --hook-event ou campo no payload
  let eventName = input.hook_event_name || input.event;
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--hook-event' && process.argv[i + 1]) {
      eventName = process.argv[i + 1];
      break;
    }
  }

  const payload = { ...input, event: eventName };
  const port = Number(process.env.HABBLAUD_PORT) || DEFAULT_PORT;
  const base = `http://127.0.0.1:${port}`;

  await call(
    base,
    '/api/agents/events',
    {
      provider: 'antigravity',
      account: input.transcriptPath?.includes('antigravity-cli') ? '.antigravity-cli' : '.antigravity',
      event: payload,
    },
    EVENT_TIMEOUT_MS,
  );

  return undefined;
}

run().then((out) => {
  if (out) process.stdout.write(JSON.stringify(out) + '\n');
  process.exit(0);
}).catch(() => process.exit(0));
