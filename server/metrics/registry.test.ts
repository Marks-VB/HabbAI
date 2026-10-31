import { describe, expect, it } from 'vitest';
import { escapeLabel, MAX_SERIES_PER_FAMILY, MetricsRegistry } from './registry';

describe('MetricsRegistry', () => {
  it('renderiza contador e gauge no formato de texto do Prometheus', () => {
    const r = new MetricsRegistry();
    const c = r.counter('habblaud_testes_total', 'Testes executados.');
    const g = r.gauge('habblaud_tamanho', 'Tamanho agora.');
    c.inc();
    c.inc({}, 2);
    g.set(7);
    expect(r.render()).toBe(
      '# HELP habblaud_tamanho Tamanho agora.\n# TYPE habblaud_tamanho gauge\nhabblaud_tamanho 7\n' +
        '# HELP habblaud_testes_total Testes executados.\n# TYPE habblaud_testes_total counter\nhabblaud_testes_total 3\n',
    );
  });

  it('rotula as séries em ordem declarada e escapa o valor do rótulo', () => {
    const r = new MetricsRegistry();
    const c = r.counter('habblaud_requisicoes_total', 'Requisições.', ['rota', 'status']);
    c.inc({ rota: '/api/agents/:id', status: '200' });
    c.inc({ rota: '/api/agents/:id', status: '200' });
    c.inc({ rota: '/a"b\\c\nd', status: '404' });
    const text = r.render();
    expect(text).toContain('habblaud_requisicoes_total{rota="/api/agents/:id",status="200"} 2');
    expect(text).toContain('habblaud_requisicoes_total{rota="/a\\"b\\\\c\\nd",status="404"} 1');
    expect(escapeLabel('a"b\\c\nd')).toBe('a\\"b\\\\c\\nd');
  });

  it('o gauge substitui o valor e o contador ignora incremento negativo', () => {
    const r = new MetricsRegistry();
    const g = r.gauge('habblaud_clientes', 'Clientes.');
    g.set(3);
    g.set(0);
    g.add(2);
    g.add(-1);
    const c = r.counter('habblaud_eventos_total', 'Eventos.');
    c.inc({}, 5);
    c.inc({}, -3);
    const text = r.render();
    expect(text).toContain('habblaud_clientes 1');
    expect(text).toContain('habblaud_eventos_total 5');
  });

  it('limita a cardinalidade por família e conta o que foi descartado', () => {
    const r = new MetricsRegistry();
    const c = r.counter('habblaud_cardinalidade_total', 'Muitos rótulos.', ['id']);
    for (let i = 0; i < MAX_SERIES_PER_FAMILY + 25; i++) c.inc({ id: `id-${i}` });
    const text = r.render();
    expect(text.match(/^habblaud_cardinalidade_total\{/gm)).toHaveLength(MAX_SERIES_PER_FAMILY);
    expect(text).toContain(`habblaud_metrics_series_dropped_total{metric="habblaud_cardinalidade_total"} 25`);
    expect(text).toContain('# TYPE habblaud_metrics_series_dropped_total counter');
    // O nome reservado não entra em names().
    expect(r.names()).toEqual(['habblaud_cardinalidade_total']);
  });

  it('a mesma família devolvida de novo soma no mesmo lugar; tipo ou rótulos diferentes falham', () => {
    const r = new MetricsRegistry();
    r.counter('habblaud_x_total', 'X.')!.inc({}, 2);
    r.counter('habblaud_x_total', 'X.', [])!.inc();
    expect(r.render()).toContain('habblaud_x_total 3');
    expect(() => r.gauge('habblaud_x_total', 'X.')).toThrow(/já é counter/);
    expect(() => r.counter('habblaud_x_total', 'X.', ['fonte'])).toThrow(/outros rótulos/);
    expect(() => r.counter('habblaud_metrics_series_dropped_total', 'Reservado.')).toThrow(/reservado/);
  });

  it('sem métricas o texto é vazio', () => {
    expect(new MetricsRegistry().render()).toBe('');
  });
});
