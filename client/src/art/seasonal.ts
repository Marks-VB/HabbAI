// Decorações procedurais em pixel art. Mesma escala dos móveis do escritório.
import { PixelBuf } from './core/pixbuf';
import type { BufSprite } from './core/sprite';

export type SeasonalProp = 'tree' | 'gift' | 'pumpkin' | 'ghost' | 'wreath' | 'bat' | 'neon' | 'holo' | 'arcade' | 'tv';

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
