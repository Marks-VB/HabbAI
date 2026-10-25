// Parser e decodificador das linhas de transcript.jsonl do Antigravity (CLI e Desktop/IDE).
// O Antigravity grava steps enumerados ("step_index"), onde cada turno é iniciado com USER_INPUT,
// processado em PLANNER_RESPONSE (com tool_calls e thinking) e concluído ou aguardando resposta humana.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Activity, ActivityKind, AgentStatus, AskQuestion, TaskItem } from '../../../shared/types';
import { truncate } from '../../../shared/activity';
import { tr } from '../../../shared/i18n';

export interface AntigravityToolCall {
  name: string;
  args?: Record<string, unknown>;
  toolUseId: string;
}

export interface AntigravityLineResult {
  stepIndex: number;
  type: string;
  prompt?: string;
  activities: Activity[];
  toolStarts: AntigravityToolCall[];
  toolEnds: string[];
  status?: AgentStatus;
  waitingFor?: string;
  questions?: AskQuestion[];
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  cwd?: string;
  title?: string;
}

export function toolKind(name: string): ActivityKind {
  switch (name) {
    case 'read_file':
    case 'view_file':
    case 'view_file_outline':
    case 'view_code_item':
      return 'read';
    case 'edit_file':
    case 'replace_file_content':
    case 'multi_replace_file_content':
      return 'edit';
    case 'write_file':
    case 'write_to_file':
      return 'write';
    case 'run_command':
    case 'send_command_input':
      return 'run';
    case 'grep_search':
    case 'find_by_name':
    case 'list_dir':
      return 'search';
    case 'search_web':
    case 'read_url_content':
      return 'web';
    case 'invoke_subagent':
      return 'delegate';
    case 'ask_question':
    case 'ask_permission':
      return 'ask';
    default:
      return 'other';
  }
}

export function toolIcon(kind: ActivityKind): string {
  switch (kind) {
    case 'read':
      return '📄';
    case 'edit':
      return '✏️';
    case 'write':
      return '📝';
    case 'run':
      return '⚙️';
    case 'search':
      return '🔍';
    case 'web':
      return '🌐';
    case 'delegate':
      return '🤝';
    case 'ask':
      return '❓';
    default:
      return '⚡';
  }
}

function cleanArg(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let s = raw.trim();
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) s = s.slice(1, -1);
  return s;
}

export function findProjectRoot(candidate: string): string | undefined {
  if (!candidate) return undefined;
  const p = cleanArg(candidate);
  if (!p || (!p.includes('/') && !p.includes('\\'))) return undefined;
  let cur = p;
  try {
    if (/\.[a-zA-Z0-9_-]+$/.test(cur)) {
      cur = dirname(cur);
    }
  } catch {
    return undefined;
  }
  let dir = cur;
  while (dir && dir !== dirname(dir)) {
    try {
      if (
        existsSync(join(dir, '.git')) ||
        existsSync(join(dir, 'package.json')) ||
        existsSync(join(dir, 'Cargo.toml')) ||
        existsSync(join(dir, 'go.mod')) ||
        existsSync(join(dir, 'pyproject.toml'))
      ) {
        return dir;
      }
    } catch {
      break;
    }
    dir = dirname(dir);
  }
  return cur;
}

export function extractTarget(args?: Record<string, unknown>): string {
  if (!args) return '';
  const candidate =
    args.AbsolutePath ??
    args.Path ??
    args.TargetFile ??
    args.DirectoryPath ??
    args.CommandLine ??
    args.query ??
    args.SearchPath;
  return cleanArg(candidate);
}

export function parseAntigravityLine(raw: string, lineAt: number = Date.now()): AntigravityLineResult | undefined {
  if (!raw.trim()) return undefined;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!obj || typeof obj !== 'object') return undefined;

  const stepIndex = typeof obj.step_index === 'number' ? obj.step_index : 0;
  const type = typeof obj.type === 'string' ? obj.type : '';
  const createdAt = typeof obj.created_at === 'string' ? Date.parse(obj.created_at) || lineAt : lineAt;

  const res: AntigravityLineResult = {
    stepIndex,
    type,
    activities: [],
    toolStarts: [],
    toolEnds: [],
  };

  if (typeof obj.input_tokens === 'number') res.tokensIn = obj.input_tokens + (typeof obj.cache_read_tokens === 'number' ? obj.cache_read_tokens : 0);
  if (typeof obj.output_tokens === 'number') res.tokensOut = obj.output_tokens;

  if (type === 'USER_INPUT') {
    const content = typeof obj.content === 'string' ? obj.content : '';
    const matchCwd = /Command Working Directory:\s*([^\r\n<]+)/i.exec(content);
    if (matchCwd) res.cwd = matchCwd[1].trim();
    const matchWs = /Active Workspaces:\s*(?:\r?\n\s*-\s*|\s+-\s*)([^\r\n<]+)/i.exec(content);
    if (matchWs && !res.cwd) res.cwd = matchWs[1].trim();
    const matchReq = /<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/.exec(content);
    const userText = matchReq ? matchReq[1].trim() : content.trim();
    if (userText) {
      res.prompt = userText;
      res.title = truncate(userText.replace(/\r?\n/g, ' '), 80);
      res.status = 'working';
      res.activities.push({
        id: `ag-prompt-${stepIndex}`,
        kind: 'prompt',
        icon: '💬',
        text: tr('Recebeu instrução'),
        detail: truncate(userText, 300),
        at: createdAt,
      });
    }
    return res;
  }

  if (type === 'PLANNER_RESPONSE') {
    res.status = 'working';
    const calls = Array.isArray(obj.tool_calls) ? obj.tool_calls : [];
    calls.forEach((tc, i) => {
      if (!tc || typeof tc !== 'object') return;
      const tcObj = tc as Record<string, unknown>;
      const name = typeof tcObj.name === 'string' ? tcObj.name : '?';
      const args = tcObj.args && typeof tcObj.args === 'object' ? (tcObj.args as Record<string, unknown>) : undefined;
      const target = extractTarget(args);
      const toolUseId = `ag-${stepIndex + 1 + i}`;
      const kind = toolKind(name);

      res.toolStarts.push({ name, args, toolUseId });

      if (!res.cwd && args) {
        const candidate = args.DirectoryPath ?? args.AbsolutePath ?? args.Path ?? args.TargetFile;
        if (typeof candidate === 'string') {
          const root = findProjectRoot(candidate);
          if (root) res.cwd = root;
        }
      }

      if (name === 'ask_permission' || name === 'ask_question') {
        res.status = 'waiting';
        res.waitingFor = tr('aguardando aprovação ou resposta');
      }

      res.activities.push({
        id: toolUseId,
        kind,
        icon: toolIcon(kind),
        text: target ? `${name}: ${truncate(target, 40)}` : name,
        detail: target ? truncate(target, 300) : undefined,
        tool: name,
        at: createdAt,
      });
    });

    if (typeof obj.input_tokens === 'number') {
      res.tokensIn = obj.input_tokens + (typeof obj.cache_read_tokens === 'number' ? obj.cache_read_tokens : 0);
    }
    if (typeof obj.output_tokens === 'number') {
      res.tokensOut = obj.output_tokens;
    }
    if (typeof obj.model === 'string') {
      res.model = obj.model;
    }

    if (calls.length === 0) {
      res.status = 'idle';
    }
    return res;
  }

  if (type !== 'USER_INPUT' && type !== 'CONVERSATION_HISTORY' && stepIndex > 0) {
    res.toolEnds.push(`ag-${stepIndex}`);
  }

  return res;
}

export function parseMarkdownTasks(markdown: string): TaskItem[] {
  if (!markdown) return [];
  const lines = markdown.split(/\r?\n/);
  const tasks: TaskItem[] = [];
  let id = 1;
  for (const line of lines) {
    const match = /^\s*-\s*\[([ xX])\]\s*(.+)$/.exec(line);
    if (match) {
      const isDone = match[1].toLowerCase() === 'x';
      tasks.push({
        id: String(id++),
        title: truncate(match[2].trim(), 120),
        status: isDone ? 'completed' : 'pending',
      });
    }
  }
  return tasks;
}
