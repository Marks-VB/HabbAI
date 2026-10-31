// Métricas do Habblaud: o registro (registry.ts) mais o estado que as rotas /healthz e /metrics reportam.
//
// Instrumentação (toda local e só com agregados — nada de caminhos de projeto, prompts, tokens ou ids):
// - HTTP: uma contagem por requisição em `habblaud_http_requests_total{route,status}` (a rota é agrupada
//   por routes.ts, nunca a URL crua);
// - SSE (http/sse.ts): clientes conectados e eventos transmitidos (`habblaud_events_total`);
// - fontes de agentes (sources/watcher.ts): falhas por fonte em `habblaud_source_errors_total{source}`;
// - erros inesperados por subsistema em `habblaud_errors_total{source}` (http, office...).
//
// Limiar de degradação: uma fonte que falha DEGRADED_AFTER_ERRORS ciclos SEGUIDOS de leitura deixa o
// /healthz em 'degraded'. Um ciclo bom zera a sequência (não é uma média nem uma janela deslizante).
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Counter, Gauge, MetricsRegistry } from './registry';
import { routeOf } from './routes';

/** Falhas seguidas no ciclo de leitura de uma fonte a partir das quais o /healthz responde 'degraded'. */
export const DEGRADED_AFTER_ERRORS = 3;

interface SourceState {
  /** Falhas seguidas (zera num ciclo bom). */
  consecutive: number;
  lastErrorAt?: number;
}

/** O que o Hub de SSE precisa (evita o acoplamento de http/sse.ts com o registro inteiro). */
export interface SseMetrics {
  /** Clientes SSE conectados agora (gauge). */
  sseClients(count: number): void;
  /** Um evento (snapshot/feed/notice) foi transmitido agora. */
  eventEmitted(at?: number): void;
}

/** O que uma fonte de agentes precisa para reportar o próprio ciclo de leitura. */
export interface SourceMetrics {
  sourceError(source: string, at?: number): void;
  sourceOk(source: string): void;
}

/**
 * Métricas do processo. Uma instância por servidor (criada em server/index.ts) e injetada no Hub, nas fontes
 * e no handler HTTP; os testes criam a própria. `now` é injetável para o uptime e a idade do último evento.
 */
export class HabblaudMetrics implements SseMetrics, SourceMetrics {
  readonly registry = new MetricsRegistry();
  /** Eventos SSE transmitidos (snapshot, feed e notice, um por transmissão). */
  readonly eventsTotal: Counter = this.registry.counter('habblaud_events_total', 'Eventos SSE transmitidos (snapshot, feed e notice).');
  /** Erros inesperados por subsistema ('http', 'office'...). */
  readonly errorsTotal: Counter = this.registry.counter('habblaud_errors_total', 'Erros inesperados por subsistema.', ['source']);
  /** Falhas no ciclo de leitura de cada fonte de agentes. */
  readonly sourceErrorsTotal: Counter = this.registry.counter('habblaud_source_errors_total', 'Falhas no ciclo de leitura de cada fonte de agentes.', ['source']);
  /** Requisições HTTP por rota agrupada e status (0 = conexão encerrada antes da resposta). */
  readonly httpRequestsTotal: Counter = this.registry.counter('habblaud_http_requests_total', 'Requisições HTTP por rota agrupada e status.', ['route', 'status']);

  /** Clientes SSE conectados agora. */
  readonly sseClientsGauge: Gauge = this.registry.gauge('habblaud_sse_clients', 'Clientes SSE conectados agora.');
  /** Agentes/sessões conhecidos pelo escritório. */
  readonly sessionsGauge: Gauge = this.registry.gauge('habblaud_sessions', 'Sessões conhecidas pelo escritório.');
  /** Fontes de agentes ligadas (uma por ferramenta). */
  readonly sourcesGauge: Gauge = this.registry.gauge('habblaud_sources', 'Fontes de agentes ligadas.');
  /** Segundos desde o início do processo. */
  readonly uptimeGauge: Gauge = this.registry.gauge('habblaud_uptime_seconds', 'Segundos desde o início do processo.');
  /** Idade do último evento SSE emitido (ausente enquanto nenhum evento saiu). */
  readonly lastEventAgeGauge: Gauge = this.registry.gauge('habblaud_last_event_age_seconds', 'Segundos desde o último evento SSE emitido.');
  /** Instante do último evento SSE emitido (epoch em segundos; 0 = nenhum ainda). */
  readonly lastEventTimestampGauge: Gauge = this.registry.gauge('habblaud_last_event_timestamp_seconds', 'Instante do último evento SSE emitido (epoch em segundos).');
  /** 1 quando o /healthz responderia 'degraded'. */
  readonly degradedGauge: Gauge = this.registry.gauge('habblaud_degraded', "1 quando alguma fonte falha repetidamente (o /healthz responde 'degraded').");

  /** @param now relógio injetável (testes); padrão Date.now. */
  constructor(private readonly now: () => number = Date.now) {
    // Contador sem rótulo aparece em 0 desde o início (alerta e gráfico têm uma linha de base).
    this.eventsTotal.init();
  }

  private readonly sourceStates = new Map<string, SourceState>();
  private lastEvent: number | undefined;

  /** Instante do último evento SSE emitido, ou undefined se nenhum saiu ainda. */
  get lastEventAt(): number | undefined {
    return this.lastEvent;
  }

  /** Idade do último evento em segundos (arredondada a 1 casa), ou undefined se nenhum saiu ainda. */
  lastEventAgeSeconds(now = this.now()): number | undefined {
    if (this.lastEvent === undefined) return undefined;
    return Math.max(0, Math.round(((now - this.lastEvent) / 1000) * 10) / 10);
  }

  eventEmitted(at = this.now()): void {
    this.lastEvent = at;
    this.eventsTotal.inc();
  }

  sseClients(count: number): void {
    this.sseClientsGauge.set(Math.max(0, count));
  }

  /** Erro inesperado de um subsistema (não é falha de fonte: use sourceError). */
  error(source: string): void {
    this.errorsTotal.inc({ source });
  }

  sourceError(source: string, at = this.now()): void {
    const state = this.sourceStates.get(source) ?? { consecutive: 0 };
    state.consecutive++;
    state.lastErrorAt = at;
    this.sourceStates.set(source, state);
    this.sourceErrorsTotal.inc({ source });
  }

  /** Ciclo de leitura concluído sem falhar: a sequência de erros da fonte zera. */
  sourceOk(source: string): void {
    const state = this.sourceStates.get(source);
    if (state) state.consecutive = 0;
  }

  /** Fontes que falharam DEGRADED_AFTER_ERRORS ciclos seguidos (ordem alfabética). */
  failingSources(): string[] {
    return [...this.sourceStates.entries()]
      .filter(([, s]) => s.consecutive >= DEGRADED_AFTER_ERRORS)
      .map(([source]) => source)
      .sort();
  }

  /** O servidor está degradado (alguma fonte falhando repetidamente)? */
  degraded(): boolean {
    return this.failingSources().length > 0;
  }

  /**
   * Conta a requisição quando ela termina (fim da resposta ou conexão encerrada), com o status já definido.
   * O stream SSE só entra na conta quando o cliente desconecta — é o momento em que a resposta termina.
   */
  httpRequest(req: IncomingMessage, res: ServerResponse, pathname: string): void {
    const route = routeOf(pathname);
    let counted = false;
    const count = () => {
      if (counted) return;
      counted = true;
      const status = res.headersSent ? String(res.statusCode) : '0';
      this.httpRequestsTotal.inc({ route, status });
    };
    res.once('finish', count);
    res.once('close', count);
    req.once('error', count);
  }

  /** Atualiza os gauges que dependem do estado vivo; chamado antes de renderizar o /metrics. */
  sample(state: { uptimeSeconds: number; sessions: number; sources: number; sseClients: number; now?: number }): void {
    const now = state.now ?? this.now();
    this.uptimeGauge.set(state.uptimeSeconds);
    this.sessionsGauge.set(state.sessions);
    this.sourcesGauge.set(state.sources);
    this.sseClients(state.sseClients);
    this.degradedGauge.set(this.degraded() ? 1 : 0);
    this.lastEventTimestampGauge.set(this.lastEvent === undefined ? 0 : this.lastEvent / 1000);
    const age = this.lastEventAgeSeconds(now);
    if (age !== undefined) this.lastEventAgeGauge.set(age);
  }
}

/** Uma instância nova (o servidor guarda uma; os testes usam a própria). */
export function createMetrics(now?: () => number): HabblaudMetrics {
  return new HabblaudMetrics(now);
}
