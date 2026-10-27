// Decorações procedurais em pixel art. Mesma escala dos móveis do escritório.
import { PixelBuf } from './core/pixbuf';
import type { BufSprite } from './core/sprite';

export type SeasonalProp = 'tree' | 'gift' | 'pumpkin' | 'ghost' | 'wreath' | 'bat' | 'neon' | 'holo' | 'arcade' | 'tv' | 'pod' | 'console' | 'bloom' | 'vase' | 'maple' | 'leafpot' | 'bonfire' | 'corn';

export function renderSeasonalProp(kind: SeasonalProp): BufSprite {
  const b = new PixelBuf(40, 64);
  const rect = (x: number, y: number, w: number, h: number, c: string) => b.rect(x, y, w, h, c);
  if (kind === 'tree') {
    b.shadow(20, 59, 17, 3, '#252c39', 0.22);
    rect(17, 49, 6, 9, '#80573d');
    for (let row = 0; row < 4; row++) {
      const y = 13 + row * 8;
      const half = 6 + row * 3;
      rect(20 - half, y, half * 2 + 1, 9, '#245644');
      rect(22 - half, y, half * 2 - 4, 6, '#387956');
      rect(22 - half, y + 1, half - 1, 3, '#4d9361');
    }
    b.vline(20, 5, 13, '#ffe0a0');
    b.hline(16, 24, 9, '#ffe0a0');
    rect(18, 7, 5, 5, '#ffc45d');
    for (const [x, y] of [[16, 20], [24, 24], [13, 31], [25, 36], [9, 42], [20, 43], [31, 44]]) {
      rect(x, y, 3, 3, '#e05250');
      b.set(x, y, '#ffb27b');
    }
    for (const [x, y] of [[21, 17], [15, 26], [23, 30], [15, 38], [26, 42], [11, 47]]) {
      rect(x, y, 2, 2, '#ffe8b2');
    }
    rect(3, 52, 10, 8, '#a82d42');
    rect(6, 51, 2, 9, '#e5c17b');
    rect(3, 54, 10, 1, '#e5c17b');
    rect(26, 51, 10, 9, '#e6b357');
    rect(30, 50, 2, 10, '#b33549');
    rect(26, 54, 10, 1, '#b33549');
  } else if (kind === 'gift') {
    b.shadow(20, 59, 9, 2, '#252c39', 0.2);
    rect(11, 49, 17, 11, '#bf3849');
    rect(11, 49, 17, 3, '#e35a58');
    rect(18, 49, 3, 11, '#efd1a0');
    rect(11, 54, 17, 2, '#efd1a0');
    rect(14, 46, 5, 3, '#e8b860');
    rect(21, 46, 5, 3, '#e8b860');
  } else if (kind === 'pumpkin') {
    b.shadow(20, 59, 11, 2, '#252c39', 0.2);
    rect(18, 41, 3, 6, '#557342');
    rect(11, 46, 18, 14, '#c56832');
    rect(8, 49, 24, 8, '#e18b39');
    rect(13, 46, 4, 13, '#f0a647');
    rect(23, 47, 3, 12, '#f0a647');
    rect(12, 50, 4, 3, '#523347');
    rect(24, 50, 4, 3, '#523347');
    rect(17, 56, 7, 2, '#523347');
    b.set(13, 51, '#ffd680');
    b.set(25, 51, '#ffd680');
    b.hline(18, 22, 56, '#ffd680');
  } else if (kind === 'ghost') {
    rect(15, 39, 10, 3, '#e0dae9');
    rect(12, 42, 16, 15, '#e0dae9');
    rect(14, 41, 11, 15, '#fff4ed');
    rect(10, 47, 4, 4, '#e0dae9');
    rect(26, 47, 4, 4, '#e0dae9');
    for (const x of [12, 18, 24]) rect(x, 56, 4, 3, '#e0dae9');
    rect(16, 46, 2, 3, '#574563');
    rect(23, 46, 2, 3, '#574563');
    rect(19, 51, 3, 2, '#574563');
  } else if (kind === 'wreath') {
    rect(12, 39, 16, 4, '#347653');
    rect(10, 43, 5, 10, '#245644');
    rect(25, 43, 5, 10, '#347653');
    rect(13, 53, 15, 4, '#245644');
    for (const [x, y] of [[14, 41], [26, 47], [12, 50], [23, 54]]) rect(x, y, 2, 2, '#e45c58');
    rect(15, 55, 4, 4, '#c93945');
    rect(21, 55, 4, 4, '#c93945');
    rect(19, 54, 2, 4, '#f07368');
  } else if (kind === 'bat') {
    rect(18, 51, 5, 6, '#47344f');
    rect(10, 50, 9, 4, '#47344f');
    rect(22, 50, 9, 4, '#47344f');
    rect(7, 48, 4, 4, '#47344f');
    rect(30, 48, 4, 4, '#47344f');
    rect(13, 53, 3, 3, '#47344f');
    rect(25, 53, 3, 3, '#47344f');
    b.set(19, 52, '#f5b95f');
    b.set(21, 52, '#f5b95f');
  } else if (kind === 'neon') {
    // Letreiro vertical de neon sobre um pé metálico.
    b.shadow(20, 59, 10, 2, '#120c24', 0.28);
    rect(18, 51, 4, 8, '#2a2440');
    rect(13, 58, 14, 2, '#1c1830');
    rect(14, 15, 13, 37, '#241d38');
    rect(16, 17, 9, 33, '#120e22');
    b.vline(15, 17, 49, '#39e6f0');
    b.vline(25, 17, 49, '#ff4fd8');
    b.hline(15, 25, 16, '#39e6f0');
    b.hline(15, 25, 50, '#ff4fd8');
    for (let y = 21; y <= 45; y += 6) {
      rect(17, y, 7, 2, '#39e6f0');
      b.set(18, y, '#c9fbff');
    }
    b.set(24, 21, '#ff4fd8');
    b.set(24, 39, '#ff4fd8');
    rect(15, 12, 11, 3, '#3a2f5c');
    rect(17, 12, 7, 1, '#7a6bb0');
  } else if (kind === 'holo') {
    // Terminal holográfico: projetor no chão e painel flutuante de dados.
    b.shadow(20, 59, 11, 2, '#120c24', 0.28);
    rect(12, 52, 16, 4, '#2a2440');
    rect(15, 48, 10, 4, '#3a2f5c');
    rect(17, 46, 6, 2, '#39e6f0');
    b.vline(20, 44, 46, '#2fb8c9');
    rect(8, 13, 24, 30, '#1c2a44');
    b.hline(8, 31, 13, '#39e6f0');
    b.hline(8, 31, 42, '#39e6f0');
    b.vline(8, 13, 42, '#2fb8c9');
    b.vline(31, 13, 42, '#2fb8c9');
    rect(10, 16, 20, 2, '#39e6f0');
    rect(10, 20, 14, 2, '#7a6bb0');
    rect(10, 24, 18, 2, '#39e6f0');
    rect(10, 28, 10, 2, '#7a6bb0');
    rect(10, 34, 20, 2, '#ff4fd8');
    rect(10, 38, 8, 2, '#39e6f0');
    b.set(29, 38, '#ff4fd8');
    for (const [x, y] of [[7, 12], [32, 12], [7, 43], [32, 43]]) b.set(x, y, '#9df6ff');
  } else if (kind === 'arcade') {
    // Fliperama de madeira com marquise rosa e tela de neon.
    b.shadow(20, 59, 11, 2, '#120c24', 0.26);
    rect(11, 21, 18, 38, '#3b2a4a');
    rect(12, 22, 3, 35, '#5b3f6e');
    rect(12, 21, 16, 6, '#e060a8');
    rect(14, 23, 12, 2, '#ffd6ec');
    rect(13, 29, 14, 12, '#141026');
    rect(15, 31, 10, 8, '#1f6b8a');
    b.hline(15, 24, 34, '#39e6f0');
    b.set(18, 32, '#ffe36e');
    b.set(22, 33, '#ff4fd8');
    rect(12, 42, 16, 4, '#2a2038');
    rect(15, 41, 2, 3, '#e05b4a');
    rect(19, 42, 2, 2, '#39e6f0');
    rect(23, 42, 2, 2, '#ffe36e');
    rect(14, 47, 12, 10, '#4a3358');
    rect(16, 49, 8, 1, '#7a5b8c');
    rect(13, 57, 4, 2, '#241d38');
    rect(23, 57, 4, 2, '#241d38');
  } else if (kind === 'pod') {
    // Cápsula hidropônica: base metálica, redoma de vidro e muda verde iluminada por ciano.
    b.shadow(20, 59, 12, 2, '#0a1120', 0.3);
    rect(9, 47, 22, 11, '#2b3346');
    rect(9, 47, 22, 2, '#465571');
    rect(11, 55, 18, 1, '#1c2333');
    rect(14, 50, 12, 4, '#1c2333');
    b.hline(15, 25, 51, '#7fe3ff');
    // redoma
    rect(12, 21, 16, 27, '#1b3244');
    rect(13, 22, 14, 26, '#20455c');
    rect(15, 24, 10, 22, '#2a5f78');
    b.vline(13, 23, 46, '#3f8ba8');
    b.vline(27, 23, 46, '#8fd6ea');
    // topo e aro
    rect(11, 17, 18, 5, '#4a5a78');
    rect(12, 15, 16, 3, '#5d6f8e');
    b.hline(13, 26, 17, '#7fe3ff');
    b.set(16, 14, '#9df6ff');
    // muda
    b.vline(20, 31, 46, '#3f7a52');
    rect(16, 34, 4, 2, '#4d9a63');
    rect(21, 37, 4, 2, '#4d9a63');
    rect(16, 41, 3, 2, '#3f7a52');
    rect(21, 44, 3, 2, '#4d9a63');
    b.set(15, 33, '#7fd68f');
    b.set(25, 36, '#7fd68f');
    // bolhas
    for (const [x, y] of [[17, 26], [24, 30], [18, 40], [25, 43]]) b.set(x, y, '#bfefff');
  } else if (kind === 'console') {
    // Console de dados: pedestal, tela inclinada com barras e botões.
    b.shadow(20, 59, 10, 2, '#0a1120', 0.28);
    rect(16, 49, 8, 9, '#2b3346');
    rect(13, 56, 14, 2, '#1c2333');
    rect(8, 31, 24, 19, '#2f3b52');
    rect(8, 31, 24, 2, '#4a5a78');
    rect(10, 33, 20, 11, '#12203a');
    rect(12, 35, 9, 2, '#39e6f0');
    rect(12, 38, 13, 2, '#7fd68f');
    rect(12, 41, 6, 2, '#39e6f0');
    b.set(27, 35, '#ff4fd8');
    rect(11, 46, 3, 2, '#39e6f0');
    rect(15, 46, 3, 2, '#ffe36e');
    rect(19, 46, 3, 2, '#ff4fd8');
    rect(23, 46, 4, 2, '#4a5a78');
    b.hline(10, 29, 48, '#1c2333');
  } else if (kind === 'bloom') {
    // Primavera: vaso alto com arbusto florido (flores rosas e brancas).
    b.shadow(20, 59, 12, 3, '#3a2a2a', 0.22);
    rect(13, 50, 14, 9, '#b9714f');
    rect(13, 50, 14, 2, '#d18d67');
    rect(11, 48, 18, 3, '#a9613f');
    b.hline(14, 25, 52, '#8f4d31');
    // galhos
    b.vline(20, 24, 49, '#4f7a43');
    b.vline(15, 30, 44, '#4f7a43');
    b.vline(26, 32, 46, '#3f6a37');
    // folhagem
    for (const [x, y] of [[13, 40], [17, 36], [23, 34], [27, 39], [19, 32], [15, 44], [25, 45], [11, 45], [29, 44], [21, 28]]) {
      rect(x - 2, y - 1, 5, 3, '#4f8a45');
      b.set(x - 1, y - 1, '#6aa956');
    }
    // flores
    for (const [x, y, c] of [[16, 30, '#f28fb0'], [21, 24, '#ffffff'], [27, 33, '#f7b7cc'], [12, 39, '#ffffff'], [24, 29, '#f28fb0'], [19, 37, '#f7b7cc']] as [number, number, string][]) {
      rect(x - 1, y - 1, 3, 3, c);
      b.set(x, y - 2, c);
      b.set(x - 2, y, c);
      b.set(x + 1, y, c);
      b.set(x, y, '#f7d154');
    }
    b.set(30, 26, '#f7b7cc');
    b.set(9, 34, '#ffffff');
  } else if (kind === 'vase') {
    // Primavera: vasinho de vidro com tulipas.
    b.shadow(20, 59, 6, 2, '#3a2a2a', 0.2);
    rect(16, 48, 9, 11, '#cfe3ea');
    rect(17, 49, 7, 9, '#e8f4f8');
    b.vline(16, 48, 58, '#9db9c6');
    b.hline(16, 24, 51, '#9db9c6');
    b.vline(19, 40, 48, '#4f8a45');
    b.vline(23, 44, 48, '#3f6a37');
    b.vline(21, 37, 48, '#4f8a45');
    rect(17, 37, 4, 4, '#e8574a');
    rect(21, 34, 4, 4, '#f2c94c');
    rect(23, 41, 4, 4, '#f08bb0');
    b.set(18, 37, '#ffb0a6');
    b.set(22, 34, '#ffe9a3');
    b.set(24, 41, '#ffc9da');
    b.hline(17, 23, 50, '#b9d3de');
  } else if (kind === 'maple') {
    // Outono: arvorezinha de copa âmbar no vaso.
    b.shadow(20, 59, 11, 3, '#3a2a1a', 0.22);
    rect(14, 51, 12, 8, '#8f5a3a');
    rect(14, 51, 12, 2, '#a8744f');
    b.hline(15, 24, 53, '#6f4227');
    b.vline(20, 27, 52, '#6b4a32');
    b.vline(16, 33, 45, '#6b4a32');
    b.vline(24, 35, 47, '#5b3c25');
    for (const [x, y, c] of [[14, 34, '#d9783c'], [19, 30, '#e0a93e'], [25, 33, '#b85a2c'], [17, 37, '#f0a647'], [22, 38, '#d9783c'], [12, 39, '#e0a93e'], [27, 39, '#b85a2c'], [20, 35, '#f5b95f'], [16, 31, '#f0a647'], [24, 30, '#e0a93e']] as [number, number, string][]) {
      rect(x - 2, y - 2, 5, 4, c);
      b.set(x - 1, y - 2, '#ffce8a');
      b.set(x + 1, y + 1, '#8f4a22');
    }
    // folhas caindo
    b.set(29, 44, '#e0a93e');
    b.set(11, 47, '#d9783c');
    b.set(27, 49, '#b85a2c');
  } else if (kind === 'leafpot') {
    // Outono: cesto de folhas secas com cabinho de canela.
    b.shadow(20, 59, 7, 2, '#3a2a1a', 0.2);
    rect(14, 49, 13, 10, '#9a6a3f');
    rect(14, 49, 13, 2, '#b98a58');
    b.hline(15, 25, 53, '#7a4f2c');
    b.hline(15, 25, 56, '#7a4f2c');
    for (const [x, y, c] of [[16, 45, '#d9783c'], [21, 43, '#e0a93e'], [25, 46, '#b85a2c'], [19, 47, '#f0a647'], [23, 48, '#e0a93e']] as [number, number, string][]) {
      rect(x - 2, y - 1, 4, 3, c);
      b.set(x, y - 2, '#ffce8a');
      b.set(x - 1, y, '#8f4a22');
    }
    rect(17, 40, 2, 7, '#7a4f2c');
    b.set(17, 39, '#c98a4f');
  } else if (kind === 'bonfire') {
    // Festa Junina: fogueira de toras com chamas e faíscas.
    b.shadow(20, 59, 13, 3, '#2a2018', 0.26);
    // toras cruzadas
    for (let i = 0; i < 8; i++) {
      rect(9 + i * 2, 52 + (i % 3), 4, 4, i % 2 ? '#6b4a32' : '#7a5539');
      b.set(9 + i * 2, 52 + (i % 3), '#9a7048');
    }
    rect(10, 56, 21, 3, '#4a3222');
    b.hline(10, 30, 56, '#6b4a32');
    // chamas
    for (let row = 0; row < 22; row++) {
      const y = 50 - row;
      const w = Math.max(1, Math.round((1 - row / 22) * 9 + Math.sin(row * 0.7) * 2));
      rect(20 - Math.floor(w / 2), y, w, 1, row < 6 ? '#ffe36e' : row < 13 ? '#ffb84d' : '#e8574a');
      if (row < 9) rect(20 - Math.floor(w / 4), y, Math.max(1, Math.floor(w / 2)), 1, '#fff3c9');
    }
    // faíscas
    b.set(14, 26, '#ffe36e');
    b.set(27, 22, '#ffb84d');
    b.set(22, 18, '#ffe36e');
    b.set(18, 14, '#ffd06e');
    // pedras em volta
    for (const [x, y] of [[8, 57], [13, 58], [28, 57], [23, 58], [17, 58]]) rect(x, y, 3, 2, '#8d8a82');
  } else if (kind === 'corn') {
    // Festa Junina: pé de milho com espigas e uma bandeirinha.
    b.shadow(20, 59, 6, 2, '#2a2018', 0.2);
    rect(18, 51, 4, 8, '#8f5a3a');
    b.vline(20, 20, 51, '#4f8a45');
    for (let i = 0; i < 5; i++) {
      const y = 24 + i * 6;
      b.hline(12, 27, y, '#5aa45d');
      b.set(12, y - 1, '#75c06f');
      b.set(27, y - 1, '#4f8a45');
    }
    b.hline(16, 24, 20, '#5aa45d');
    // espigas
    rect(22, 32, 5, 11, '#e8c454');
    rect(23, 33, 3, 9, '#f7dd7d');
    b.vline(24, 33, 41, '#c9a83a');
    rect(13, 38, 4, 9, '#e8c454');
    b.set(14, 39, '#f7dd7d');
    b.set(15, 43, '#c9a83a');
    // bandeirinha
    b.vline(11, 12, 22, '#7a4a2c');
    for (let row = 0; row < 5; row++) rect(6 + row, 12 + row, 11 - row * 2, 1, row < 2 ? '#e8574a' : row < 4 ? '#f2c94c' : '#3f9a5f');
  } else {
    // Televisão de tubo com antena e tela âmbar.
    b.shadow(20, 59, 10, 2, '#120c24', 0.24);
    b.vline(14, 26, 36, '#4a3a2a');
    b.vline(26, 26, 36, '#4a3a2a');
    b.set(12, 25, '#8a6a4a');
    b.set(28, 25, '#8a6a4a');
    rect(9, 34, 22, 21, '#7a5230');
    rect(10, 35, 20, 18, '#c9955c');
    rect(12, 37, 13, 14, '#20303a');
    rect(14, 39, 9, 10, '#2f5a52');
    b.hline(14, 22, 42, '#8fd6a8');
    b.hline(14, 22, 45, '#6aa87f');
    b.set(19, 41, '#ffe36e');
    rect(27, 38, 2, 2, '#3b2a22');
    rect(27, 42, 2, 2, '#3b2a22');
    b.hline(27, 28, 48, '#5a4030');
    rect(13, 55, 3, 3, '#4a3a2a');
    rect(24, 55, 3, 3, '#4a3a2a');
  }
  b.outline();
  return { buf: b, ax: 20, ay: 60 };
}
