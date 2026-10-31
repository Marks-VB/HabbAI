// Ícones da interface sem DOM: o SVG gerado (dimensões, pixels agrupados, paleta) e o megafone da ordem geral,
// que entrou nesta rodada. A escolha de ícone por ferramenta fica em shared/activity (describeTool), já testada lá.
import { describe, expect, it } from 'vitest';
import { ICONS, pixelIcon, scenarioIcon, themeIcon } from './icons';

describe('pixelIcon', () => {
  it('gera SVG nítido com o tamanho do mapa (2 px de tela por pixel por padrão)', () => {
    const svg = pixelIcon([
      '##.',
      '#..',
    ]);
    expect(svg).toContain('class="ui-px-icon"');
    expect(svg).toContain('width="6" height="4" viewBox="0 0 3 2"');
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).toContain('focusable="false"');
    // Pixels consecutivos da mesma linha viram um único retângulo.
    expect(svg).toContain('<path fill="currentColor" d="M0 0h2v1h-2zM0 1h1v1h-1z"/>');
  });

  it('aceita paleta própria, escala 1 e ignora cores sem pixels', () => {
    const svg = pixelIcon(['#x'], { '#': '#fff', x: '#000', o: '#f00' }, 'ui-pequeno', 1);
    expect(svg).toContain('class="ui-pequeno"');
    expect(svg).toContain('width="2" height="1"');
    expect(svg).toContain('<path fill="#fff" d="M0 0h1v1h-1z"/>');
    expect(svg).toContain('<path fill="#000" d="M1 0h1v1h-1z"/>');
    expect(svg).not.toContain('#f00');
  });

  it('linhas de tamanhos diferentes usam a maior como largura', () => {
    expect(pixelIcon(['#', '####', '#'])).toContain('width="8" height="6" viewBox="0 0 4 3"');
  });
});

describe('ICONS', () => {
  it('o megafone da ordem geral (broadcast) tem o tamanho do mapa e é diferente dos vizinhos', () => {
    expect(ICONS.broadcast).toMatch(/^<svg class="ui-px-icon" width="20" height="18" viewBox="0 0 10 9"/);
    expect(ICONS.broadcast).not.toBe(ICONS.office);
    expect(ICONS.broadcast).not.toBe(ICONS.city);
    // O mapa tem 9 linhas de 10 colunas: cada uma com pelo menos um pixel.
    const paths = ICONS.broadcast.match(/<path /g) ?? [];
    expect(paths).toHaveLength(1);
  });

  it('themeIcon/scenarioIcon devolvem o ícone do tema ou vazio', () => {
    expect(themeIcon('christmas')).toMatch(/^<svg /);
    expect(themeIcon('nao-existe')).toBe('');
    expect(scenarioIcon('city')).toMatch(/^<svg /);
    expect(scenarioIcon('nao-existe')).toBe('');
  });
});
