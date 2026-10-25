import { describe, expect, it } from 'vitest';
import { parseAntigravityLine } from './transcript';
import { createAntigravityTerminalParser } from './terminal';

describe('Antigravity transcript & terminal parser', () => {
  it('parseAntigravityLine extrai atividades e ferramentas', () => {
    const userLine = JSON.stringify({
      step_index: 0,
      type: 'USER_INPUT',
      content: 'Corrija o bug no servidor',
    });
    const parsedUser = parseAntigravityLine(userLine);
    expect(parsedUser).toBeDefined();
    expect(parsedUser?.type).toBe('USER_INPUT');
    expect(parsedUser?.prompt).toBe('Corrija o bug no servidor');
    expect(parsedUser?.activities[0]?.kind).toBe('prompt');

    const toolLine = JSON.stringify({
      step_index: 1,
      type: 'PLANNER_RESPONSE',
      tool_calls: [
        {
          name: 'run_command',
          args: { CommandLine: 'npm test' },
        },
      ],
    });
    const parsedTool = parseAntigravityLine(toolLine);
    expect(parsedTool?.activities[0]?.kind).toBe('run');
    expect(parsedTool?.activities[0]?.tool).toBe('run_command');
    expect(parsedTool?.activities[0]?.detail).toBe('npm test');

    const subagentLine = JSON.stringify({
      step_index: 2,
      type: 'PLANNER_RESPONSE',
      tool_calls: [
        {
          name: 'invoke_subagent',
          args: { Role: 'Tester', Prompt: 'Run the tests' },
        },
      ],
    });
    const parsedSubagent = parseAntigravityLine(subagentLine);
    expect(parsedSubagent?.activities[0]?.kind).toBe('delegate');
    expect(parsedSubagent?.toolStarts[0]?.name).toBe('invoke_subagent');
  });

  it('createAntigravityTerminalParser converte eventos em TerminalEntries', () => {
    const parser = createAntigravityTerminalParser();

    const userEntries = parser.push(
      JSON.stringify({
        step_index: 0,
        type: 'USER_INPUT',
        content: 'Olá Antigravity',
      })
    );
    expect(userEntries).toHaveLength(1);
    expect(userEntries[0]).toMatchObject({
      kind: 'user',
      text: 'Olá Antigravity',
    });

    const thinkingEntries = parser.push(
      JSON.stringify({
        step_index: 1,
        type: 'PLANNER_RESPONSE',
        thinking: 'Pensando...',
      })
    );
    expect(thinkingEntries).toHaveLength(1);
    expect(thinkingEntries[0]).toMatchObject({
      kind: 'thinking',
      text: 'Pensando...',
    });

    const toolEntries = parser.push(
      JSON.stringify({
        step_index: 2,
        type: 'PLANNER_RESPONSE',
        content: 'Vou rodar os testes agora.',
        tool_calls: [
          {
            id: 'call_1',
            name: 'run_command',
            args: { CommandLine: 'npm test' },
          },
        ],
      })
    );
    expect(toolEntries.map((e) => e.kind)).toEqual(['assistant', 'tool']);
    expect(toolEntries[0]).toMatchObject({
      kind: 'assistant',
      text: 'Vou rodar os testes agora.',
    });
    expect(toolEntries[1]).toMatchObject({
      kind: 'tool',
      tool: 'run_command',
      input: 'npm test',
      inputKind: 'command',
    });

    const resultEntries = parser.push(
      JSON.stringify({
        step_index: 3,
        type: 'EXECUTION_RESULT',
        call_id: 'call_1',
        content: 'Tests passed: 10/10',
      })
    );
    expect(resultEntries).toHaveLength(1);
    expect(resultEntries[0]).toMatchObject({
      kind: 'result',
      toolUseId: 'call_1',
      text: 'Tests passed: 10/10',
    });
  });
});
