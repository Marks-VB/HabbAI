import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import { DEGRADED_AFTER_ERRORS, HabblaudMetrics } from './habblaud';

/** Resposta mínima: só o que o httpRequest() lê (status, headersSent, finish/close). */
function fakeResponse(status = 200, headersSent = true): ServerResponse & EventEmitter {
  const res = new EventEmitter() as unknown as ServerResponse & EventEmitter;
  Object.assign(res, { statusCode: status, headersSent });
  return res;
}

function fakeRequest(): IncomingMessage & EventEmitter {
  return new EventEmitter() as unknown as IncomingMessage & EventEmitter;
}

describe('HabblaudMetrics', () => {
  it('conta eventos e guarda o instante e a idade do último', () => {
    let now = 1_000_000;
    const m = new HabblaudMetrics(() => now);
    expect(m.lastEventAt).toBeUndefined();
    expect(m.lastEventAgeSeconds()).toBeUndefined();
    m.eventEmitted(now);
    now += 4_500;
    expect(m.lastEventAt).toBe(1_000_000);
    expect(m.lastEventAgeSeconds()).toBe(4.5);
    expect(m.registry.render()).toContain('habblaud_events_total 1');
  });

  it('degrada a fonte depois de falhas seguidas e volta ao normal num ciclo bom', () => {
    const m = new HabblaudMetrics(() => 0);
    for (let i = 1; i < DEGRADED_AFTER_ERRORS; i++) {
      m.sourceError('claude');
      expect(m.degraded()).toBe(false);
    }
    m.sourceError('claude');
    expect(m.degraded()).toBe(true);
    expect(m.failingSources()).toEqual(['claude']);
    expect(m.registry.render()).toContain(`habblaud_source_errors_total{source="claude"} ${DEGRADED_AFTER_ERRORS}`);

    // Uma falha isolada noutra fonte não a degrada, mas aparece no contador.
    m.sourceError('codex');
    m.sourceOk('codex');
    expect(m.failingSources()).toEqual(['claude']);

    m.sourceOk('claude');
    expect(m.degraded()).toBe(false);
    // O contador não zera (é um contador); a sequência sim.
    expect(m.registry.render()).toContain(`habblaud_source_errors_total{source="claude"} ${DEGRADED_AFTER_ERRORS}`);
  });

  it('conta erros por subsistema', () => {
    const m = new HabblaudMetrics(() => 0);
    m.error('http');
    m.error('office');
    m.error('office');
    const text = m.registry.render();
    expect(text).toContain('habblaud_errors_total{source="http"} 1');
    expect(text).toContain('habblaud_errors_total{source="office"} 2');
  });

  it('conta requisições por rota agrupada e status, uma vez por resposta', () => {
    const m = new HabblaudMetrics(() => 0);
    const res = fakeResponse(200);
    m.httpRequest(fakeRequest(), res, '/api/agents/abc/terminal');
    res.emit('finish');
    res.emit('close'); // não conta de novo
    const other = fakeResponse(503);
    m.httpRequest(fakeRequest(), other, '/api/health');
    other.emit('finish');
    const text = m.registry.render();
    expect(text).toContain('habblaud_http_requests_total{route="/api/agents/:id/terminal",status="200"} 1');
    expect(text).toContain('habblaud_http_requests_total{route="/api/health",status="503"} 1');
    expect(text).not.toContain('abc');
  });

  it('status 0 quando a conexão caiu antes da resposta', () => {
    const m = new HabblaudMetrics(() => 0);
    const res = fakeResponse(200, false);
    m.httpRequest(fakeRequest(), res, '/metrics');
    res.emit('close');
    expect(m.registry.render()).toContain('habblaud_http_requests_total{route="/metrics",status="0"} 1');
  });

  it('sample() atualiza os gauges do estado vivo', () => {
    let now = 10_000;
    const m = new HabblaudMetrics(() => now);
    m.eventEmitted(now);
    now += 2_000;
    m.sample({ uptimeSeconds: 12.5, sessions: 4, sources: 6, sseClients: 2, now });
    const text = m.registry.render();
    expect(text).toContain('habblaud_uptime_seconds 12.5');
    expect(text).toContain('habblaud_sessions 4');
    expect(text).toContain('habblaud_sources 6');
    expect(text).toContain('habblaud_sse_clients 2');
    expect(text).toContain('habblaud_last_event_age_seconds 2');
    expect(text).toContain('habblaud_last_event_timestamp_seconds 10');
    expect(text).toContain('habblaud_degraded 0');
  });
});
