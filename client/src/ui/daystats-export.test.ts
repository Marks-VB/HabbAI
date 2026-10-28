import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccountDayStats, DayStats, RoomDayStats, StatusMs } from '../../../shared/daystats';
import { buildCsv, buildRows, csvFileName, csvHeader, toCsv, toSummary, type ExportRow } from './daystats-export';

const MIN = 60_000;
const H = 60 * MIN;
const ms = (p: Partial<StatusMs> = {}): StatusMs => ({ waiting: 0, working: 0, idle: 0, shell: 0, ...p });
const counts = (p: Partial<DayStats['totals']['counts']> = {}) => ({ prompts: 0, toolCalls: 0, tasksDone: 0, tokensIn: 0, tokensOut: 0, costUSD: 0, ...p });
const totals = (p: Partial<RoomDayStats> = {}) => ({ ms: ms(), counts: counts(), sessions: 0, subagents: 0, waits: 0, longestWaitMs: 0, ...p });

const row = (p: Partial<ExportRow> = {}): ExportRow => ({
  tipo: 'Projeto',
  nome: 'loja',
  sessions: 1,
  subagents: 0,
  ms: ms(),
  tasksDone: 0,
  tokensIn: 0,
  tokensOut: 0,
  costUSD: 0,
  ...p,
});

const room = (id: string, name: string, p: Partial<RoomDayStats> = {}): RoomDayStats => ({ id, name, ...totals(p) });
const account = (id: string, p: Partial<AccountDayStats> = {}): AccountDayStats => ({ id, name: id, short: 'X', color: '#8b98b3', ...totals(p) });

const stats = (p: Partial<DayStats> = {}): DayStats => ({
  day: '2026-10-27',
  tz: 'America/Sao_Paulo',
  start: 0,
  end: 0,
  totals: { ...totals({ ms: ms({ waiting: 48 * MIN, working: 5 * H + 20 * MIN }), sessions: 3, subagents: 1, waits: 4, counts: counts({ prompts: 12, toolCalls: 300, tasksDone: 1, tokensIn: 2_000_000, tokensOut: 50_000 }) }), waitWallMs: 35 * MIN },
  rooms: [],
  accounts: [],
  hours: [],
  waits: [],
  ...p,
});

/** Linhas do CSV sem o BOM e sem o CRLF do fim. */
const csvLines = (csv: string): string[] => csv.slice(1).replace(/\r\n$/, '').split('\r\n');

describe('toCsv', () => {
  it('começa com BOM UTF-8 e usa CRLF em todas as linhas', () => {
    const csv = toCsv([row()]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv.split('\r\n').length).toBe(3);
    expect(csv).not.toContain('\n\n');
  });

  it('mantém a ordem estável das colunas, com o cabeçalho em português', () => {
    const head = csvLines(toCsv([]))[0].split(';');
    expect(head).toEqual([
      'Tipo',
      'Nome',
      'Sessões',
      'Subagentes',
      'Esperando você (min)',
      'Trabalhando (min)',
      'Ocioso (min)',
      'Esperando o shell (min)',
      'Total (min)',
      'Tarefas concluídas',
      'Tokens de entrada',
      'Tokens de saída',
      'Custo (US$)',
    ]);
    expect(csvHeader()).toEqual(head);
    // Cada linha tem exatamente uma célula por coluna.
    const cells = csvLines(toCsv([row({ tokensIn: 10 })]))[1].split(';');
    expect(cells.length).toBe(head.length);
  });

  it('põe aspas em vírgula, aspas, ponto e vírgula e quebra de linha (aspas dobradas)', () => {
    const csv = toCsv([row({ nome: 'loja, centro' }), row({ nome: 'diz "oi"' }), row({ nome: 'a;b' }), row({ nome: 'duas\nlinhas' })]);
    expect(csv).toContain(';"loja, centro";');
    expect(csv).toContain(';"diz ""oi""";');
    expect(csv).toContain(';"a;b";');
    expect(csv).toContain(';"duas\nlinhas";');
  });

  it('nome que começa com = não vira fórmula na planilha', () => {
    expect(csvLines(toCsv([row({ nome: '=soma(a1)' })]))[1].split(';')[1]).toBe("'=soma(a1)");
  });

  it('tempos em minutos inteiros, vírgula no decimal e vazio no que não houve', () => {
    const csv = toCsv([row({ ms: ms({ waiting: 90_000, working: 2 * H + 30_000 }), tasksDone: 2, tokensIn: 1_500, costUSD: 4.5213 })]);
    const cells = csvLines(csv)[1].split(';');
    expect(cells.slice(4, 10)).toEqual(['2', '121', '0', '0', '123', '2']);
    expect(cells[10]).toBe('1500');
    // Sem tokens de saída: célula vazia, não um zero.
    expect(cells[11]).toBe('');
    expect(cells[12]).toBe('"4,5213"');
    // Sem custo: célula vazia.
    expect(csvLines(toCsv([row()]))[1].split(';')[12]).toBe('');
  });
});

describe('buildRows e buildCsv', () => {
  it('um recorte por projeto, um por conta e o total no fim', () => {
    const day = stats({
      rooms: [
        room('/p/loja', 'loja', { ms: ms({ waiting: 10 * MIN, working: H }), counts: counts({ tasksDone: 2, tokensIn: 1_000 }) }),
        room('/p/vazio', 'vazio'),
      ],
      accounts: [account('ana', { name: 'Ana', ms: ms({ working: 2 * H }), sessions: 2 })],
    });
    const rows = buildRows(day);
    expect(rows.map((r) => [r.tipo, r.nome])).toEqual([
      ['Projeto', 'loja'],
      ['Conta', 'Ana'],
      ['Total', ''],
    ]);
    const lines = csvLines(buildCsv(day));
    expect(lines.length).toBe(4);
    expect(lines[1].startsWith('Projeto;loja;')).toBe(true);
    expect(lines[3].startsWith('Total;;')).toBe(true);
  });

  it('projeto sem tokens e sem custo deixa as células vazias', () => {
    const day = stats({ rooms: [room('/p/loja', 'loja', { ms: ms({ working: 30 * MIN }) })] });
    const cells = csvLines(buildCsv(day))[1].split(';');
    expect(cells.slice(10, 13)).toEqual(['', '', '']);
    expect(cells[5]).toBe('30');
  });

  it('dia vazio: só o cabeçalho, sem linha de total', () => {
    const empty = stats({ totals: { ...totals(), waitWallMs: 0 }, waits: [] });
    expect(buildRows(empty)).toEqual([]);
    const csv = buildCsv(empty);
    expect(csv).toBe(`\uFEFF${csvHeader().join(';')}\r\n`);
  });
});

describe('toSummary', () => {
  it('resume o dia e os recortes, sem linha vazia', () => {
    const day = stats({
      rooms: [room('/p/loja', 'loja', { ms: ms({ waiting: 12 * MIN, working: H }), counts: counts({ tasksDone: 1, tokensIn: 1_200_000 }) })],
      accounts: [account('ana', { name: 'Ana', ms: ms({ working: 2 * H }), sessions: 2, subagents: 1, counts: counts({ tokensOut: 30_000, costUSD: 4.5 }) })],
    });
    const text = toSummary(day);
    const lines = text.split('\n');
    expect(lines[0]).toBe('Meu dia — 2026-10-27 (America/Sao_Paulo)');
    expect(lines.some((l) => l.trim() === '')).toBe(false);
    expect(text).toContain('Esperando você: 48 min · 4 esperas');
    expect(text).toContain('Trabalhando: 5 h 20 min');
    expect(text).toContain('Sessões: 3 · 1 subagente');
    expect(text).toContain('Por projeto:');
    expect(text).toContain('- loja: 1 h 12 min no total · 12 min esperando você · 1 tarefa concluída · 1,2 M tokens');
    expect(text).toContain('- Ana: 2 h no total · 0 s esperando você · 1 subagente · 30 k tokens');
    expect(text.endsWith('\n')).toBe(false);
  });

  it('dia vazio diz que não há nada, sem linha em branco', () => {
    const text = toSummary(stats({ totals: { ...totals(), waitWallMs: 0 }, waits: [] }));
    expect(text).toBe('Meu dia — 2026-10-27 (America/Sao_Paulo)\nNada registrado neste dia.');
    expect(text.split('\n').every((l) => l.length > 0)).toBe(true);
  });
});

describe('csvFileName', () => {
  afterEach(() => vi.useRealTimers());

  it('usa a data local (não UTC) do momento do download', () => {
    // Meio-dia local: mesmo em fusos extremos a data local é a mesma do calendário pedido.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 27, 12, 0, 0));
    expect(csvFileName()).toBe('habblaud-meu-dia-2026-10-27.csv');
  });

  it('usa a data do dia mostrado, com zero à esquerda', () => {
    expect(csvFileName(new Date(2026, 0, 5, 9, 30))).toBe('habblaud-meu-dia-2026-01-05.csv');
  });
});
