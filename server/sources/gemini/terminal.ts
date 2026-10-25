// Parser de terminal para o Gemini CLI: converte as mensagens em blocos de TerminalEntry.
import type { TerminalEntry } from '../../../shared/types';
import type { TerminalParser } from '../terminal';

export function createGeminiTerminalParser(): TerminalParser {
  let seq = 0;

  return {
    push(line: string): TerminalEntry[] {
      if (!line.trim()) return [];
      const out: TerminalEntry[] = [];
      const lineAt = Date.now();

      try {
        const data = JSON.parse(line);
        if (data.role === 'user' && typeof data.content === 'string') {
          out.push({
            kind: 'user',
            id: `gem-user-${++seq}`,
            at: lineAt,
            text: data.content,
          });
        } else if (data.role === 'model') {
          if (typeof data.content === 'string') {
            out.push({
              kind: 'assistant',
              id: `gem-asst-${++seq}`,
              at: lineAt,
              text: data.content,
            });
          }
          if (Array.isArray(data.parts)) {
            for (const p of data.parts) {
              if (p.functionCall) {
                out.push({
                  kind: 'tool',
                  id: `gem-tool-${++seq}`,
                  at: lineAt,
                  tool: p.functionCall.name || 'tool',
                  title: p.functionCall.name || 'tool',
                  input: p.functionCall.args ? JSON.stringify(p.functionCall.args) : undefined,
                  inputKind: 'json',
                });
              }
            }
          }
        }
      } catch {
        // ignora
      }

      return out;
    },
  };
}
