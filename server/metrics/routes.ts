// Agrupamento de rotas para o rótulo `route` das métricas HTTP.
//
// O caminho cru nunca vira rótulo: `/api/agents/abc/terminal` são todos `/api/agents/:id/terminal` e o que
// não estiver previsto cai em `/api/*` (ou `static`). Assim a cardinalidade fica limitada ao número de rotas
// do servidor, e não ao número de agentes, sessões ou arquivos pedidos.

/** Caminhos exatos que viram um rótulo próprio. */
const EXACT = new Set([
  '/api',
  '/api/stream',
  '/api/snapshot',
  '/api/health',
  '/api/access',
  '/api/mod/summary',
  '/api/mod/inbox',
  '/api/mod/inbox/ack',
  '/api/agents/events',
  '/api/codex/events',
  '/api/demo',
  '/api/updates',
  '/api/updates/check',
  '/api/spawn',
  '/api/spawn/folders',
  '/api/spawn/attachments',
  '/api/dictation',
  '/api/deliveries',
  '/api/rooms/rename',
  '/api/permissions',
  '/api/messages',
  '/api/pty',
  '/api/stats',
  '/api/stats/days',
  '/api/timeline/days',
  '/healthz',
  '/metrics',
]);

/** Rotas com parâmetro no caminho, na ordem em que são testadas (as mais específicas primeiro). */
const PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^\/api\/agents\/[^/]+\/terminal$/, '/api/agents/:id/terminal'],
  [/^\/api\/agents\/[^/]+\/character$/, '/api/agents/:id/character'],
  [/^\/api\/agents\/[^/]+\/(?:stop|takeover)$/, '/api/agents/:id/:action'],
  [/^\/api\/agents\/[^/]+$/, '/api/agents/:id'],
  [/^\/api\/sessions\/recent$/, '/api/sessions/recent'],
  [/^\/api\/sessions\/[^/]+\/[^/]+\/terminal$/, '/api/sessions/:account/:sessionId/terminal'],
  [/^\/api\/sessions\/[^/]+\/[^/]+\/stream$/, '/api/sessions/:account/:sessionId/stream'],
  [/^\/api\/stats\/days$/, '/api/stats/days'],
  [/^\/api\/stats\/[^/]+$/, '/api/stats/:day'],
  [/^\/api\/timeline\/days$/, '/api/timeline/days'],
  [/^\/api\/timeline\/[^/]+$/, '/api/timeline/:day'],
  [/^\/api\/deliveries\/file\/[^/]+$/, '/api/deliveries/file/:id'],
  [/^\/api\/spawn\/[^/]+$/, '/api/spawn/:id'],
  [/^\/api\/dictation\/[^/]+$/, '/api/dictation/:id'],
  [/^\/api\/permissions(?:\/.*)?$/, '/api/permissions/*'],
  [/^\/api\/messages(?:\/.*)?$/, '/api/messages/*'],
  [/^\/api\/mod\/inbox(?:\/.*)?$/, '/api/mod/inbox/*'],
  [/^\/api\/host\/.*$/, '/api/host/*'],
  [/^\/api\/codex\/.*$/, '/api/codex/*'],
  [/^\/api\/world(?:\/.*)?$/, '/api/world/*'],
];

/** Rota de um caminho de requisição, para o rótulo `route` (nunca o caminho cru). */
export function routeOf(pathname: string): string {
  // Barra final não muda a rota (exceto na raiz).
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.replace(/\/+$/, '') : pathname;
  if (EXACT.has(path)) return path;
  if (path === '/api' || !path.startsWith('/api/')) return path === '/api' ? '/api' : 'static';
  for (const [re, label] of PATTERNS) if (re.test(path)) return label;
  return '/api/*';
}
