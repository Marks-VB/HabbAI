// Relatório do GET /healthz: o que um container (ou um `docker healthcheck`) precisa saber sem abrir a página.
//
// Só agregados: versão, uptime, estado, contagens e quando foi o último evento SSE. Nada de caminhos de
// projeto, prompts, tokens ou ids de sessão. O estado é 'degraded' quando alguma fonte de agentes falhou
// DEGRADED_AFTER_ERRORS ciclos seguidos (ver metrics/habblaud.ts); o handler responde 503 nesse caso.
import type { SourceInfo } from '../../shared/types';
import type { Office } from '../model/office';
import type { Hub } from '../http/sse';
import type { HabblaudMetrics } from './habblaud';

export interface HealthDeps {
  office: Pick<Office, 'list'>;
  hub: Pick<Hub, 'size'>;
  /** Entradas por conta (meta.sources, /api/health). */
  sources: () => SourceInfo[];
  /** Fontes ligadas, quando quem chama sabe (SourceSet); sem isto, conta as ferramentas distintas de sources(). */
  sourceCount?: () => number;
  version: string;
  startedAt: number;
  metrics: HabblaudMetrics;
  now?: () => number;
}

export interface HealthBody {
  ok: boolean;
  status: 'ok' | 'degraded';
  version: string;
  /** Segundos desde o início do processo (inteiro). */
  uptimeSeconds: number;
  /** Fontes de agentes ligadas. */
  sources: number;
  /** Sessões/agentes conhecidos pelo escritório. */
  sessions: number;
  /** Clientes SSE conectados agora. */
  sseClients: number;
  /** Instante do último evento SSE emitido (epoch em ms), ou null enquanto nenhum saiu. */
  lastEventAt: number | null;
  /** Idade do último evento em segundos (1 casa), ou null enquanto nenhum saiu. */
  lastEventAgeSeconds: number | null;
  /** Fontes que falharam repetidamente (vazio quando o estado é 'ok'). */
  degradedSources: string[];
}

export interface HealthReport {
  status: 'ok' | 'degraded';
  body: HealthBody;
}

/** O estado e o corpo do /healthz a partir do estado vivo. */
export function healthReport(deps: HealthDeps): HealthReport {
  const now = (deps.now ?? Date.now)();
  const failing = deps.metrics.failingSources();
  const status = failing.length ? 'degraded' : 'ok';
  const uptimeSeconds = Math.max(0, Math.floor((now - deps.startedAt) / 1000));
  const sources = deps.sourceCount ? deps.sourceCount() : countProviders(deps.sources());
  const age = deps.metrics.lastEventAgeSeconds(now);
  const body: HealthBody = {
    ok: status === 'ok',
    status,
    version: deps.version,
    uptimeSeconds,
    sources,
    sessions: deps.office.list().length,
    sseClients: deps.hub.size,
    lastEventAt: deps.metrics.lastEventAt ?? null,
    lastEventAgeSeconds: age ?? null,
    degradedSources: failing,
  };
  return { status, body };
}

/** Ferramentas distintas nas entradas por conta (sem fonte única, é o que dá para contar). */
export function countProviders(infos: readonly SourceInfo[]): number {
  return new Set(infos.map((i) => i.provider ?? 'claude')).size;
}
