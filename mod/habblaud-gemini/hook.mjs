#!/usr/bin/env node
// Hook do Habblaud para o Google Gemini CLI (@google/gemini-cli)
// Suporta eventos: SessionStart, SessionEnd, BeforeAgent, AfterAgent, BeforeTool, AfterTool.
// No BeforeTool, registra a permissão no Habblaud e aguarda decisão allow/deny.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

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

  const port = Number(process.env.HABBLAUD_PORT) || DEFAULT_PORT;
  const base = `http://127.0.0.1:${port}`;
  const eventName = input.hook_event_name || input.event || 'BeforeTool';

  // 1. Notifica o Habblaud sobre o evento
  await call(
    base,
    '/api/agents/events',
    {
      provider: 'gemini',
      account: '.gemini',
      event: input,
    },
    EVENT_TIMEOUT_MS,
  );

  // 2. Se for BeforeTool, valida permissão se Habblaud estiver conectado
  if (eventName === 'BeforeTool') {
    const tool = input.tool_name || input.tool || 'tool';
    const reg = await call(
      base,
      '/api/permissions',
      {
        provider: 'gemini',
        account: '.gemini',
        session_id: input.session_id || 'gemini-session',
        tool_name: tool,
        tool_input: input.tool_input || {},
        timeout_ms: WAIT_MS,
      },
      2000,
    );

    if (reg && reg.id) {
      const start = Date.now();
      while (Date.now() - start < WAIT_MS) {
        try {
          const waitRes = await fetch(`${base}/api/permissions/${encodeURIComponent(reg.id)}/wait?timeout=5`, {
            signal: AbortSignal.timeout(6000),
          });
          const ans = await waitRes.json();
          if (ans.status === 'decided') {
            if (ans.behavior === 'allow') return { decision: 'allow' };
            if (ans.behavior === 'deny') return { decision: 'deny', reason: ans.message || 'Recusado pelo usuário no Habblaud' };
          }
        } catch {
          break;
        }
      }
    }
  }

  return undefined;
}

run().then((out) => {
  if (out) process.stdout.write(JSON.stringify(out) + '\n');
  process.exit(0);
}).catch(() => process.exit(0));
