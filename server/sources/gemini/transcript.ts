// Parser e decodificador das sessões do Gemini CLI (@google/gemini-cli).
// Monitora os arquivos em ~/.gemini/tmp/<project_hash>/chats/ e eventos dos hooks.
import type { Activity, ActivityKind, AgentStatus } from '../../../shared/types';
import { truncate } from '../../../shared/activity';

export interface GeminiLineResult {
  prompt?: string;
  activities: Activity[];
  status?: AgentStatus;
  waitingFor?: string;
  title?: string;
  cwd?: string;
}

export function geminiToolKind(name: string): ActivityKind {
  switch (name) {
    case 'read_file':
    case 'view_file':
      return 'read';
    case 'replace':
    case 'edit':
      return 'edit';
    case 'write_file':
    case 'write':
      return 'write';
    case 'run_shell_command':
    case 'bash':
      return 'run';
    case 'google_web_search':
    case 'web_fetch':
      return 'web';
    default:
      return 'other';
  }
}

export function geminiToolIcon(kind: ActivityKind): string {
  switch (kind) {
    case 'read':
      return '📄';
    case 'edit':
      return '✏️';
    case 'write':
      return '📝';
    case 'run':
      return '⚙️';
    case 'web':
      return '🌐';
    default:
      return '⚡';
  }
}

export function parseGeminiChat(content: string, lineAt: number = Date.now()): GeminiLineResult {
  const res: GeminiLineResult = {
    activities: [],
  };

  try {
    const data = JSON.parse(content);
    const messages = Array.isArray(data.messages) ? data.messages : Array.isArray(data) ? data : [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (!msg) continue;

      if (msg.role === 'user' && typeof msg.content === 'string') {
        const text = msg.content.trim();
        res.prompt = text;
        res.title = truncate(text.replace(/\r?\n/g, ' '), 80);
        res.status = 'working';
      } else if (msg.role === 'model' || msg.role === 'assistant') {
        res.status = 'idle';
        const parts = Array.isArray(msg.parts) ? msg.parts : typeof msg.content === 'string' ? [{ text: msg.content }] : [];
        for (const p of parts) {
          if (p.functionCall) {
            const name = p.functionCall.name || 'tool';
            const kind = geminiToolKind(name);
            const args = p.functionCall.args ? JSON.stringify(p.functionCall.args) : undefined;
            res.activities.push({
              id: `gem-${i}-${name}`,
              kind,
              icon: geminiToolIcon(kind),
              text: name,
              detail: args ? truncate(args, 200) : undefined,
              tool: name,
              at: lineAt,
            });
            res.status = 'working';
          }
        }
      }
    }
  } catch {
    // se for JSONL ou texto incremental
  }

  return res;
}
