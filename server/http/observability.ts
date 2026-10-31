// Rotas de observabilidade do processo: GET /healthz e GET /metrics.
//
// As duas passam pelo guard.ts como as demais (Host/Origin), mas ficam fora de /api: quem monitora um
// container não precisa saber a estrutura da API. /healthz não pede login e devolve só agregados (é o que
// um `docker healthcheck` consulta); /metrics é somente leitura local, como as rotas sensíveis — pela rede
// (ou pela porta remota) responde 403 — e pode ser desligado com HABBLAUD_METRICS=0 (404, como se não
// existisse).
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SourceInfo } from '../../shared/types';
import type { Office } from '../model/office';
import { countProviders, healthReport } from '../metrics/health';
import type { HabblaudMetrics } from '../metrics/habblaud';
import { sendJson } from './app';
import { isLoopbackHost } from './guard';
import type { Hub } from './sse';
import { tr } from '../../shared/i18n';

export interface ObservabilityDeps {
  metrics: HabblaudMetrics;
  office: Pick<Office, 'list'>;
  hub: Pick<Hub, 'size'>;
  /** Entradas por conta (SourceInfo), como em /api/health. */
  sources: () => SourceInfo[];
  /** Fontes ligadas (SourceSet.all().length); sem isto conta as ferramentas distintas de sources(). */
  sourceCount?: () => number;
  version: string;
  /** Início do processo (uptime). */
  startedAt: number;
  /** false = HABBLAUD_METRICS=0: /metrics responde 404. A contagem continua (é barata e local). */
  metricsEnabled?: boolean;
  /** Requisição pela porta remota (http/remote.ts): /metrics nunca é servido por ela, nem com Host local. */
  isRemote?: (req: IncomingMessage) => boolean;
  now?: () => number;
}

/** Handler de /healthz e /metrics: devolve true quando atendeu, false para o resto. */
export function createObservabilityHandler(deps: ObservabilityDeps): (req: IncomingMessage, res: ServerResponse, url: URL) => boolean {
  const now = deps.now ?? Date.now;
  const sourceCount = () => (deps.sourceCount ? deps.sourceCount() : countProviders(deps.sources()));

  return (req, res, url) => {
    const path = url.pathname;
    if (path !== '/healthz' && path !== '/metrics') return false;
    const method = req.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      res.setHeader('Allow', 'GET');
      sendJson(res, 405, { error: tr('método não permitido') });
      return true;
    }

    if (path === '/healthz') {
      const report = healthReport({
        office: deps.office,
        hub: deps.hub,
        sources: deps.sources,
        sourceCount,
        version: deps.version,
        startedAt: deps.startedAt,
        metrics: deps.metrics,
        now,
      });
      // 503 num container degradado: o healthcheck do Docker e o `curl -f` enxergam a falha sem ler o corpo.
      sendJson(res, report.status === 'ok' ? 200 : 503, report.body);
      return true;
    }

    req.resume();
    if (deps.metricsEnabled === false) {
      sendJson(res, 404, { error: tr('rota desconhecida') });
      return true;
    }
    // Só o próprio computador: métricas de uso não saem pela rede nem pela porta remota.
    if (deps.isRemote?.(req) || !isLoopbackHost(req.headers.host)) {
      sendJson(res, 403, { error: tr('as métricas só são servidas pelo próprio computador (http://localhost)') });
      return true;
    }

    const at = now();
    deps.metrics.sample({
      uptimeSeconds: Math.max(0, (at - deps.startedAt) / 1000),
      sessions: deps.office.list().length,
      sources: sourceCount(),
      sseClients: deps.hub.size,
      now: at,
    });
    const text = deps.metrics.registry.render();
    res.writeHead(200, {
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      'Content-Length': Buffer.byteLength(text),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
    });
    res.end(text);
    return true;
  };
}
