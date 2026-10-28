// "Meu dia" para fora do escritório: os números do dia em CSV (planilha) e em resumo de texto (retro, relatório,
// mensagem). Funções puras, sem DOM: os testes ficam em ui/daystats-export.test.ts e quem baixa/copia é o painel
// (ui/daystats.ts).
//
// Por que uma linha por projeto e outra por conta (e não por agente): o DayStats (shared/daystats.ts) soma o tempo
// por projeto (`rooms`) e por conta (`accounts`); cada sessão e subagente entra somado nesses dois recortes, sem um
// registro próprio no protocolo. Uma linha por agente teria que inventar tempos que a API não tem, então o CSV
// repete os recortes que o painel já mostra, com a coluna "Tipo" dizendo de qual deles é cada linha.
//
// Formato do CSV (o Excel em pt-BR abre sem ajuste):
// - separador de campos ";";
// - decimal com vírgula ("4,5213" em Custo): o público é pt-BR e o Excel em português espera a vírgula. Por isso o
//   separador é ";": com "," nos decimais, a vírgula não pode separar campos;
// - BOM UTF-8 ("\uFEFF") no começo: sem ele o Excel lê o arquivo como latin-1 e estraga os acentos;
// - CRLF entre as linhas (o que o Excel grava e espera);
// - aspas duplas quando o campo tem ",", ";", aspas ou quebra de linha, com as aspas internas dobradas (por causa
//   da regra, um decimal com vírgula sai entre aspas: "4,5213" — o Excel entende igual);
// - tempos em minutos inteiros, arredondados: somam direto na planilha (um "12 s" vira 0 em vez de inflar o dia);
// - tokens e custo ficam vazios quando não houve nada, em vez de um zero que parece gasto medido.
import { TIMED_STATUSES, totalMs, type DayStats, type StatsTotals, type StatusMs } from '../../../shared/daystats';
import { tr } from '../../../shared/i18n';
import { formatAgentTime, highlights, isEmptyDay } from './daystats-model';
import { formatClock, formatInt, formatTokens } from './format';

/** Um recorte do dia (projeto, conta ou o total) com as mesmas colunas. */
export interface ExportRow {
  /** "Projeto", "Conta" ou "Total". */
  tipo: string;
  /** Nome do projeto/conta (vazio na linha do total). */
  nome: string;
  sessions: number;
  subagents: number;
  ms: StatusMs;
  tasksDone: number;
  tokensIn: number;
  tokensOut: number;
  costUSD: number;
}

/** Cabeçalho do CSV, na ordem das colunas (a mesma em toda exportação). */
export function csvHeader(): string[] {
  return [
    tr('Tipo'),
    tr('Nome'),
    tr('Sessões'),
    tr('Subagentes'),
    tr('Esperando você (min)'),
    tr('Trabalhando (min)'),
    tr('Ocioso (min)'),
    tr('Esperando o shell (min)'),
    tr('Total (min)'),
    tr('Tarefas concluídas'),
    tr('Tokens de entrada'),
    tr('Tokens de saída'),
    tr('Custo (US$)'),
  ];
}

/**
 * Escapa um campo: aspas duplas quando tem separador, vírgula, aspas ou quebra de linha (aspas dobradas). Um nome que
 * começa com "=", "+", "-" ou "@" viraria fórmula no Excel/Sheets: ganha um apóstrofo na frente e continua texto.
 */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",;\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Inteiro não negativo (sessões, tokens, contagens). */
function csvInt(v: number): string {
  return String(Math.max(0, Math.round(Number.isFinite(v) ? v : 0)));
}

/** Decimal com vírgula e sem separador de milhar: 4.5213 -> "4,5213", 2 -> "2". */
function csvDecimal(v: number): string {
  const fixed = (Math.round((Number.isFinite(v) ? v : 0) * 10_000) / 10_000).toFixed(4);
  return fixed.replace(/0+$/, '').replace(/\.$/, '').replace('.', ',');
}

/** Minutos inteiros de cada status, na ordem do cabeçalho, mais o total (a soma das colunas, para fechar na conta). */
function csvMinutes(ms: StatusMs): number[] {
  const mins = TIMED_STATUSES.map((s) => Math.max(0, Math.round((Number.isFinite(ms[s]) ? ms[s] : 0) / 60_000)));
  mins.push(mins.reduce((n, m) => n + m, 0));
  return mins;
}

function rowCells(row: ExportRow): string[] {
  const tokensIn = row.tokensIn > 0 ? csvInt(row.tokensIn) : '';
  const tokensOut = row.tokensOut > 0 ? csvInt(row.tokensOut) : '';
  return [
    row.tipo,
    row.nome,
    csvInt(row.sessions),
    csvInt(row.subagents),
    ...csvMinutes(row.ms).map(csvInt),
    csvInt(row.tasksDone),
    tokensIn,
    tokensOut,
    row.costUSD > 0 ? csvDecimal(row.costUSD) : '',
  ];
}

/**
 * CSV completo (com BOM e CRLF no fim de cada linha, inclusive a última). Sem linhas, sai só o cabeçalho.
 */
export function toCsv(rows: readonly ExportRow[]): string {
  const lines = [csvHeader(), ...rows.map(rowCells)].map((cells) => cells.map(csvCell).join(';'));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

function fromTotals(totals: StatsTotals): Omit<ExportRow, 'tipo' | 'nome'> {
  const c = totals.counts;
  return {
    sessions: totals.sessions,
    subagents: totals.subagents,
    ms: { ...totals.ms },
    tasksDone: c.tasksDone,
    tokensIn: c.tokensIn,
    tokensOut: c.tokensOut,
    costUSD: c.costUSD,
  };
}

/** Recortes do dia: cada projeto, cada conta e o total. Dia vazio não gera linha nenhuma. */
export function buildRows(stats: DayStats): ExportRow[] {
  if (isEmptyDay(stats)) return [];
  const rows: ExportRow[] = [];
  for (const r of stats.rooms) {
    if (totalMs(r.ms) > 0 || r.counts.tokensIn + r.counts.tokensOut > 0) {
      rows.push({ tipo: tr('Projeto'), nome: r.name, ...fromTotals(r) });
    }
  }
  for (const a of stats.accounts) {
    if (totalMs(a.ms) > 0 || a.counts.tokensIn + a.counts.tokensOut > 0) {
      rows.push({ tipo: tr('Conta'), nome: a.name, ...fromTotals(a) });
    }
  }
  rows.push({ tipo: tr('Total'), nome: '', ...fromTotals(stats.totals) });
  return rows;
}

/** CSV do dia (o que o botão "Exportar CSV" baixa). */
export function buildCsv(stats: DayStats): string {
  return toCsv(buildRows(stats));
}

/** "1 tarefa concluída", "3 tarefas concluídas". */
function plural(n: number, one: string, many: string): string {
  return `${formatInt(n)} ${n === 1 ? one : many}`;
}

/** Uma linha do resumo por recorte: "loja: 2 h no total · 12 min esperando você · 3 tarefas concluídas". */
function rowLine(name: string, totals: StatsTotals): string {
  const c = totals.counts;
  const parts = [
    tr('{0} no total', [formatAgentTime(totalMs(totals.ms))]),
    tr('{0} esperando você', [formatAgentTime(totals.ms.waiting)]),
  ];
  if (c.tasksDone > 0) parts.push(plural(c.tasksDone, tr('tarefa concluída'), tr('tarefas concluídas')));
  if (totals.subagents > 0) parts.push(plural(totals.subagents, tr('subagente'), tr('subagentes')));
  if (c.tokensIn + c.tokensOut > 0) parts.push(tr('{0} tokens', [formatTokens(c.tokensIn + c.tokensOut)]));
  return `- ${name}: ${parts.join(' · ')}`;
}

/**
 * Resumo em texto puro (para colar numa retro ou num relatório), no idioma ativo. Sem linha em branco e sem linha
 * vazia: o texto que vai para a área de transferência é só o que tem conteúdo.
 */
export function toSummary(stats: DayStats): string {
  const lines = [tr('Meu dia — {0} ({1})', [stats.day, stats.tz])];
  if (isEmptyDay(stats)) {
    lines.push(tr('Nada registrado neste dia.'));
    return lines.join('\n');
  }
  const hl = highlights(stats, (t) => formatClock(t, false));
  lines.push(tr('Esperando você: {0} · {1}', [hl.waiting, hl.waits]));
  if (hl.wall) lines.push(hl.wall);
  if (hl.longest) lines.push(tr('Maior espera: {0}', [hl.longest]));
  lines.push(tr('Trabalhando: {0}', [hl.working]));
  lines.push(tr('Sessões: {0} · {1}', [hl.sessions, hl.subagents]));
  lines.push(tr('Pedidos: {0} · {1}', [hl.prompts, hl.activity]));
  lines.push(tr('Tokens: {0} ({1})', [hl.tokens, hl.tokensDetail]));
  lines.push(tr('Custo: {0}', [hl.cost]));
  const rooms = stats.rooms.filter((r) => totalMs(r.ms) > 0 || r.counts.tokensIn + r.counts.tokensOut > 0);
  if (rooms.length) {
    lines.push(tr('Por projeto:'));
    for (const r of rooms) lines.push(rowLine(r.name, r));
  }
  const accounts = stats.accounts.filter((a) => totalMs(a.ms) > 0 || a.counts.tokensIn + a.counts.tokensOut > 0);
  if (accounts.length) {
    lines.push(tr('Por conta:'));
    for (const a of accounts) lines.push(rowLine(a.name, a));
  }
  return lines.join('\n');
}

/**
 * "habblaud-meu-dia-AAAA-MM-DD.csv" com a data no fuso de quem baixa (não em UTC): às 22h de 26/10 em São Paulo o
 * arquivo não pode se chamar 27/10.
 */
export function csvFileName(date: Date | number = Date.now()): string {
  const d = date instanceof Date ? date : new Date(date);
  const at = Number.isNaN(d.getTime()) ? new Date() : d;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `habblaud-meu-dia-${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}.csv`;
}
