import { describe, expect, it } from 'vitest';
import { parseGeminiChat } from './transcript';
import { createGeminiTerminalParser } from './terminal';

describe('Gemini transcript & terminal parser', () => {
  it('parseGeminiChat processa mensagens e chamadas de ferramenta', () => {
    const chatJson = JSON.stringify({
      messages: [
        {
          role: 'user',
          content: 'Liste os arquivos do projeto',
        },
        {
          role: 'model',
          parts: [
            {
              functionCall: {
                name: 'run_shell_command',
                args: { command: 'dir' },
              },
            },
          ],
        },
      ],
    });

    const parsed = parseGeminiChat(chatJson);
    expect(parsed.prompt).toBe('Liste os arquivos do projeto');
    expect(parsed.status).toBe('working');
    expect(parsed.activities).toHaveLength(1);
    expect(parsed.activities[0]).toMatchObject({
      kind: 'run',
      tool: 'run_shell_command',
      text: 'run_shell_command',
    });
  });

  it('createGeminiTerminalParser converte chats em TerminalEntries', () => {
    const parser = createGeminiTerminalParser();

    const userEntry = parser.push(
      JSON.stringify({
        role: 'user',
        content: 'Olá Gemini',
      })
    );
    expect(userEntry).toHaveLength(1);
    expect(userEntry[0]).toMatchObject({
      kind: 'user',
      text: 'Olá Gemini',
    });

    const modelEntry = parser.push(
      JSON.stringify({
        role: 'model',
        content: 'Estou analisando seu código.',
        parts: [
          {
            functionCall: {
              name: 'read_file',
              args: { path: 'package.json' },
            },
          },
        ],
      })
    );
    expect(modelEntry.map((e) => e.kind)).toEqual(['assistant', 'tool']);
    expect(modelEntry[0]).toMatchObject({
      kind: 'assistant',
      text: 'Estou analisando seu código.',
    });
    expect(modelEntry[1]).toMatchObject({
      kind: 'tool',
      tool: 'read_file',
    });
  });
});
