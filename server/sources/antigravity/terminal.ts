// Parser de terminal para o Antigravity: transforma as linhas do transcript.jsonl em blocos do leitor de terminal do HabbAI.
import type { TerminalEntry } from '../../../shared/types';
import type { TerminalParser } from '../terminal';
import { parseAntigravityLine } from './transcript';

export function createAntigravityTerminalParser(): TerminalParser {
  let seq = 0;

  return {
    push(line: string): TerminalEntry[] {
      const parsed = parseAntigravityLine(line);
      if (!parsed) return [];

      const out: TerminalEntry[] = [];
      const lineAt = Date.now();

      if (parsed.type === 'USER_INPUT' && parsed.prompt) {
        out.push({
          kind: 'user',
          id: `ag-user-${parsed.stepIndex}-${++seq}`,
          at: lineAt,
          text: parsed.prompt,
        });
      } else if (parsed.type === 'PLANNER_RESPONSE') {
        try {
          const raw = JSON.parse(line);
          if (typeof raw.thinking === 'string' && raw.thinking.trim()) {
            out.push({
              kind: 'thinking',
              id: `ag-think-${parsed.stepIndex}-${++seq}`,
              at: lineAt,
              text: raw.thinking.trim(),
            });
          }
          if (typeof raw.content === 'string' && raw.content.trim()) {
            out.push({
              kind: 'assistant',
              id: `ag-asst-${parsed.stepIndex}-${++seq}`,
              at: lineAt,
              text: raw.content.trim(),
            });
          }
        } catch {
          // ignora
        }
        for (const act of parsed.activities) {
          out.push({
            kind: 'tool',
            id: act.id,
            at: act.at,
            tool: act.tool ?? 'tool',
            title: act.text,
            input: act.detail,
            inputKind: act.kind === 'run' ? 'command' : 'text',
          });
        }
      } else if (parsed.type === 'GENERIC' || parsed.type === 'EXECUTION_RESULT') {
        try {
          const raw = JSON.parse(line);
          const content = typeof raw.content === 'string' ? raw.content : '';
          const callId = typeof raw.call_id === 'string' ? raw.call_id : `ag-${parsed.stepIndex}`;
          if (content) {
            out.push({
              kind: 'result',
              id: `ag-res-${parsed.stepIndex}-${++seq}`,
              at: lineAt,
              toolUseId: callId,
              text: content.slice(0, 4000),
            });
          }
        } catch {
          // ignora
        }
      }

      return out;
    },
  };
}
