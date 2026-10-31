import { describe, expect, it } from 'vitest';
import { routeOf } from './routes';

describe('routeOf', () => {
  it('mantém as rotas fixas e as duas de observabilidade', () => {
    expect(routeOf('/api/stream')).toBe('/api/stream');
    expect(routeOf('/api/snapshot')).toBe('/api/snapshot');
    expect(routeOf('/api/health')).toBe('/api/health');
    expect(routeOf('/api/spawn/folders')).toBe('/api/spawn/folders');
    expect(routeOf('/healthz')).toBe('/healthz');
    expect(routeOf('/metrics')).toBe('/metrics');
    expect(routeOf('/api')).toBe('/api');
  });

  it('agrupa os parâmetros em vez de usar o caminho cru', () => {
    expect(routeOf('/api/agents/abc')).toBe('/api/agents/:id');
    expect(routeOf('/api/agents/abc/terminal')).toBe('/api/agents/:id/terminal');
    expect(routeOf('/api/agents/abc/character')).toBe('/api/agents/:id/character');
    expect(routeOf('/api/agents/abc/takeover')).toBe('/api/agents/:id/:action');
    expect(routeOf('/api/sessions/conta/sess-1/terminal')).toBe('/api/sessions/:account/:sessionId/terminal');
    expect(routeOf('/api/deliveries/file/abc123')).toBe('/api/deliveries/file/:id');
    expect(routeOf('/api/spawn/pedido-1')).toBe('/api/spawn/:id');
    expect(routeOf('/api/dictation/pedido-1')).toBe('/api/dictation/:id');
    expect(routeOf('/api/timeline/2026-10-31')).toBe('/api/timeline/:day');
    expect(routeOf('/api/stats/2026-10-31')).toBe('/api/stats/:day');
    expect(routeOf('/api/permissions/abc/wait')).toBe('/api/permissions/*');
    expect(routeOf('/api/host/files/poll')).toBe('/api/host/*');
    expect(routeOf('/api/codex/bridge/poll')).toBe('/api/codex/*');
  });

  it('o que não é previsto cai num rótulo fixo (cardinalidade limitada)', () => {
    expect(routeOf('/api/qualquer-coisa-nova')).toBe('/api/*');
    expect(routeOf('/api/agents/a/b/c/d')).toBe('/api/*');
    expect(routeOf('/')).toBe('static');
    expect(routeOf('/bundle/main-abc123.js')).toBe('static');
    expect(routeOf('/qualquer/pagina?x=1')).toBe('static');
  });

  it('ignora a barra final (menos na raiz)', () => {
    expect(routeOf('/api/stream/')).toBe('/api/stream');
    expect(routeOf('/api/agents/abc/')).toBe('/api/agents/:id');
    expect(routeOf('/')).toBe('static');
  });
});
