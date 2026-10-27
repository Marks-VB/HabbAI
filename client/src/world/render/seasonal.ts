import type { CharacterFrameRequest, FurnitureKind, Sprite, WallStyle } from '../../art/api';
import { mix } from '../../art/core/color';
import { hash32 } from '../../../../shared/hash';
import { renderSeasonalProp, type SeasonalProp } from '../../art/seasonal';
import type { ScenarioTheme, SeasonalTheme } from '../api';
import type { AreaLayout, WallSegment } from '../layout/types';

const sprites = new Map<SeasonalProp, Sprite>();
function prop(kind: SeasonalProp): Sprite {
  let sprite = sprites.get(kind);
  if (!sprite) {
    const { buf, ax, ay } = renderSeasonalProp(kind);
    const canvas = document.createElement('canvas');
    canvas.width = buf.w;
    canvas.height = buf.h;
    canvas.getContext('2d')!.putImageData(new ImageData(buf.data, buf.w, buf.h), 0, 0);
    sprites.set(kind, sprite = { canvas, ax, ay });
  }
  return sprite;
}

export function seasonalCostume(theme: SeasonalTheme, seed: number): CharacterFrameRequest['costume'] {
  if (theme === 'christmas') return 'santa';
  if (theme === 'cyberpunk') return 'visor';
  if (theme === 'retro') return 'headphones';
  // Orbital: metade dos agentes vira robô, metade fica com o capacete de estação.
  if (theme === 'orbital') return (seed >>> 0) % 2 === 0 ? 'robot' : 'helmet';
  if (theme === 'spring') return 'blossom';
  if (theme === 'autumn') return 'scarf';
  if (theme === 'junina') return 'strawhat';
  if (theme === 'halloween') return (['witch', 'pumpkin', 'vampire', 'ghost'] as const)[(seed >>> 0) % 4];
  return undefined;
}

/** Reutiliza footprints de plantas: nenhuma nova colisão ou mudança de caminhos. */
export function seasonalFurniture(theme: SeasonalTheme, kind: FurnitureKind, area: AreaLayout, seed: number): Sprite | null {
  if (theme === 'none' || area.kind === 'restroom') return null;
  if (kind === 'plant_tall') {
    const first = area.furniture.find((f) => f.kind === 'plant_tall');
    if (theme === 'cyberpunk') return prop(first && hash32(first.id) === seed ? 'holo' : 'neon');
    if (theme === 'retro') return prop(first && hash32(first.id) === seed ? 'arcade' : 'tv');
    if (theme === 'orbital') return prop(first && hash32(first.id) === seed ? 'pod' : 'console');
    if (theme === 'spring') return prop('bloom');
    if (theme === 'autumn') return prop('maple');
    if (theme === 'junina') return prop(first && hash32(first.id) === seed ? 'bonfire' : 'corn');
    if (!first || hash32(first.id) !== seed) return null;
    if (theme === 'christmas') return prop('tree');
    return prop(seed % 3 === 0 ? 'ghost' : 'pumpkin');
  }
  if (kind === 'plant_small') {
    if (theme === 'christmas') return prop('gift');
    if (theme === 'cyberpunk') return prop('neon');
    if (theme === 'retro') return prop('tv');
    if (theme === 'orbital') return prop('console');
    if (theme === 'spring') return prop('vase');
    if (theme === 'autumn') return prop('leafpot');
    if (theme === 'junina') return prop('corn');
    return prop('pumpkin');
  }
  return null;
}

export function seasonalRugColor(theme: SeasonalTheme, original: string): string {
  if (theme === 'christmas') return '#a93649';
  if (theme === 'halloween') return '#60416f';
  if (theme === 'cyberpunk') return '#2b2450';
  if (theme === 'retro') return '#a4653f';
  if (theme === 'orbital') return '#1e2a44';
  if (theme === 'spring') return '#f4dbe6';
  if (theme === 'autumn') return '#8a4a2a';
  if (theme === 'junina') return '#b8492f';
  return original;
}

export function seasonalWallStyle(theme: SeasonalTheme, original: WallStyle): WallStyle {
  if (theme === 'none') return original;
  if (original.pattern === 'glass') {
    // Só a estação orbital tinge as divisórias de vidro (visores azulados do convés).
    if (theme === 'orbital') return { ...original, glassTint: 'rgba(46,74,108,0.52)' };
    return original;
  }
  if (theme === 'cyberpunk') return { ...original, base: mix(original.base, '#241d38', 0.62), trim: '#39e6f0' };
  if (theme === 'retro') return { ...original, base: mix(original.base, '#f0cf9a', 0.32), trim: '#a4643a' };
  if (theme === 'orbital') return { ...original, base: mix(original.base, '#2b3956', 0.68), trim: '#8fd6ff' };
  if (theme === 'spring') return { ...original, base: mix(original.base, '#f8e8de', 0.34), trim: '#e08aa5' };
  if (theme === 'autumn') return { ...original, base: mix(original.base, '#dfa972', 0.4), trim: '#8c4a2a' };
  if (theme === 'junina') return { ...original, base: mix(original.base, '#f4ddb6', 0.34), trim: '#3f8a5f' };
  if (theme === 'christmas') return { ...original, base: mix(original.base, '#ffe3b4', 0.18), trim: '#4e7756' };
  return { ...original, base: mix(original.base, '#bc97d1', 0.18), trim: '#725486' };
}

/** Motivos de tapete (cacheados junto com o piso). */
export function decorateSeasonalRug(ctx: CanvasRenderingContext2D, theme: SeasonalTheme, rug: { x: number; y: number; w: number; h: number }): void {
  if (theme === 'none') return;
  const x = Math.round(rug.x), y = Math.round(rug.y), w = Math.floor(rug.w), h = Math.floor(rug.h);
  if (w < 25 || h < 16) return;
  ctx.save();
  if (theme === 'cyberpunk') {
    // Circuitos de neon: linhas ciano com nós magenta.
    const cy = Math.round(y + h / 2);
    ctx.fillStyle = '#39e6f0';
    for (let cx = x + 8; cx < x + w - 10; cx += 26) {
      ctx.fillRect(cx, cy - 4, 12, 1);
      ctx.fillRect(cx + 12, cy - 4, 1, 6);
      ctx.fillStyle = '#ff4fd8';
      ctx.fillRect(cx + 5, cy - 6, 3, 2);
      ctx.fillRect(cx + 15, cy + 2, 2, 2);
      ctx.fillStyle = '#39e6f0';
    }
    for (let cx = x + 4; cx < x + w - 4; cx += 8) ctx.fillRect(cx, y + h - 5, 4, 1);
  } else if (theme === 'retro') {
    // Galões setentistas em creme e laranja.
    const cy = Math.round(y + h / 2);
    ctx.fillStyle = '#f4dfae';
    ctx.fillRect(x + 4, y + 4, w - 8, 1);
    ctx.fillRect(x + 4, y + h - 5, w - 8, 1);
    for (let cx = x + 14; cx < x + w - 10; cx += 28) {
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(cx - 6 + i, cy - 5 + i, 3, 1);
        ctx.fillRect(cx + 4 - i, cy - 5 + i, 3, 1);
        ctx.fillRect(cx - 6 + i, cy + 5 - i, 3, 1);
        ctx.fillRect(cx + 4 - i, cy + 5 - i, 3, 1);
      }
      ctx.fillStyle = '#d9783c';
      ctx.fillRect(cx - 1, cy - 1, 3, 3);
      ctx.fillStyle = '#f4dfae';
    }
  } else if (theme === 'orbital') {
    // Convés: placas, rebites e uma fileira de luz fria no centro.
    const cy = Math.round(y + h / 2);
    ctx.fillStyle = '#33456b';
    ctx.fillRect(x + 4, y + 4, w - 8, 1);
    ctx.fillRect(x + 4, y + h - 5, w - 8, 1);
    for (let cx = x + 8; cx < x + w - 6; cx += 12) {
      ctx.fillStyle = '#5d7699';
      ctx.fillRect(cx, y + 7, 1, 1);
      ctx.fillRect(cx, y + h - 8, 1, 1);
    }
    for (let cx = x + 14; cx < x + w - 10; cx += 20) {
      ctx.fillStyle = '#7fe3ff';
      ctx.fillRect(cx, cy, 6, 1);
      ctx.fillStyle = '#bfe9ff';
      ctx.fillRect(cx + 2, cy, 2, 1);
    }
  } else if (theme === 'spring') {
    // Primavera: borda de pétalas e pequenas flores espalhadas.
    ctx.fillStyle = '#f7b7cc';
    ctx.fillRect(x + 4, y + 4, w - 8, 1);
    ctx.fillRect(x + 4, y + h - 5, w - 8, 1);
    for (let cx = x + 12; cx < x + w - 10; cx += 24) {
      const cy = Math.round(y + h / 2) + ((cx / 24) % 2 === 0 ? -2 : 2);
      for (const [dx, dy] of [[0, -2], [2, 0], [0, 2], [-2, 0]]) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(cx + dx, cy + dy, 2, 2);
      }
      ctx.fillStyle = '#f7d154';
      ctx.fillRect(cx, cy, 1, 1);
      ctx.fillStyle = '#6aa956';
      ctx.fillRect(cx - 1, y + 6, 1, 2);
    }
  } else if (theme === 'autumn') {
    // Outono: folhas em tons de âmbar e uma faixa de galhos.
    ctx.fillStyle = '#e0a93e';
    ctx.fillRect(x + 4, y + 4, w - 8, 1);
    ctx.fillRect(x + 4, y + h - 5, w - 8, 1);
    for (let cx = x + 13; cx < x + w - 10; cx += 22) {
      const cy = Math.round(y + h / 2);
      ctx.fillStyle = (cx / 22) % 3 === 0 ? '#d9783c' : '#e0a93e';
      ctx.fillRect(cx - 2, cy, 5, 1);
      ctx.fillRect(cx - 1, cy - 1, 3, 1);
      ctx.fillRect(cx - 1, cy + 1, 3, 1);
      ctx.fillStyle = '#b85a2c';
      ctx.fillRect(cx, cy, 2, 1);
      ctx.fillRect(cx + 2, cy + 1, 1, 1);
    }
  } else if (theme === 'junina') {
    // Festa Junina: varal de bandeirinhas cruzando o tapete.
    const top = y + 4;
    ctx.fillStyle = '#f4dfae';
    ctx.fillRect(x + 4, top, w - 8, 1);
    const cols = ['#e8574a', '#f2c94c', '#3f9a5f', '#3f7fd8'];
    let i = 0;
    for (let cx = x + 8; cx < x + w - 10; cx += 12, i++) {
      ctx.fillStyle = cols[i % cols.length];
      for (let row = 0; row < 4; row++) ctx.fillRect(cx + row, top + 1 + row, 9 - row * 2, 1);
    }
    ctx.fillStyle = '#f2c94c';
    ctx.fillRect(x + 4, y + h - 5, w - 8, 1);
  } else {
    ctx.fillStyle = theme === 'christmas' ? '#ddb66e' : '#e5a457';
    ctx.fillRect(x + 4, y + 4, w - 8, 1);
    ctx.fillRect(x + 4, y + h - 5, w - 8, 1);
    for (let cx = x + 14; cx < x + w - 10; cx += 28) {
      const cy = Math.round(y + h / 2);
      if (theme === 'christmas') {
        ctx.fillRect(cx - 4, cy, 9, 1);
        ctx.fillRect(cx, cy - 4, 1, 9);
        for (const d of [-2, 2]) {
          ctx.fillRect(cx + d, cy + d, 1, 1);
          ctx.fillRect(cx + d, cy - d, 1, 1);
        }
      } else {
        ctx.fillRect(cx - 3, cy - 2, 7, 5);
        ctx.fillRect(cx, cy - 4, 1, 2);
        ctx.fillStyle = '#60416f';
        ctx.fillRect(cx - 2, cy - 1, 1, 1);
        ctx.fillRect(cx + 2, cy - 1, 1, 1);
        ctx.fillStyle = '#e5a457';
      }
    }
  }
  ctx.restore();
}

/** Enfeites no alto da parede, longe das telas e placas. Os vãos ficam livres. */
export function decorateSeasonalWall(ctx: CanvasRenderingContext2D, theme: SeasonalTheme, wall: WallSegment): void {
  if (theme === 'none' || wall.kind !== 'face') return;
  ctx.save();
  const x0 = Math.round(wall.x + 3), end = Math.floor(wall.x + wall.w - 3), y = Math.round(wall.y + 5);
  const blocked = (x: number) => wall.doorways?.some((d) => x >= d.x - 1 && x < d.x + d.w + 1) ?? false;
  if (theme === 'cyberpunk') {
    // Cornija de neon: segmentos ciano/magenta e pequenas descidas de luz.
    for (let x = x0; x < end; x++) {
      if (blocked(x)) continue;
      const phase = (x - x0) % 30;
      if (phase >= 12) continue;
      ctx.fillStyle = phase < 6 ? '#39e6f0' : '#ff4fd8';
      ctx.fillRect(x, y + 1, 1, 2);
      if (phase === 1) ctx.fillRect(x, y + 3, 1, 5);
      if (phase === 1) {
        ctx.fillStyle = '#9df6ff';
        ctx.fillRect(x, y + 8, 1, 1);
      }
    }
    for (let x = x0 + 18; x < end - 6; x += 60) {
      if (blocked(x)) continue;
      ctx.fillStyle = '#2a2440';
      ctx.fillRect(x, y + 12, 23, 9);
      ctx.fillStyle = '#39e6f0';
      ctx.fillRect(x + 1, y + 13, 21, 1);
      ctx.fillRect(x + 1, y + 19, 21, 1);
      ctx.fillStyle = '#ff4fd8';
      ctx.fillRect(x + 3, y + 15, 7, 2);
      ctx.fillStyle = '#9df6ff';
      ctx.fillRect(x + 13, y + 15, 8, 1);
      ctx.fillRect(x + 13, y + 17, 5, 1);
    }
  } else if (theme === 'retro') {
    // Bandeirinhas e lâmpadas quentes de lanchonete.
    const colors = ['#f4dfae', '#d9783c', '#e0a93e', '#7a4a2c'];
    ctx.fillStyle = '#7a4a2c';
    for (let x = x0; x < end; x++) if (!blocked(x)) ctx.fillRect(x, y, 1, 1);
    let i = 0;
    for (let x = x0 + 4; x < end - 6; x += 14, i++) {
      if (blocked(x) || blocked(x + 6)) continue;
      ctx.fillStyle = colors[i % colors.length];
      for (let row = 0; row < 4; row++) ctx.fillRect(x + row, y + 1 + row, 9 - row * 2, 1);
      ctx.fillStyle = '#ffe3a3';
      ctx.fillRect(x + 4, y + 1, 1, 1);
    }
    for (let x = x0 + 10; x < end - 4; x += 28) {
      if (blocked(x)) continue;
      ctx.fillStyle = '#ffcf7a';
      ctx.fillRect(x, y + 9, 2, 2);
      ctx.fillStyle = '#fff0c9';
      ctx.fillRect(x, y + 9, 1, 1);
    }
  } else if (theme === 'orbital') {
    // Painéis de convés: canaleta no alto, luzes indicadoras e grades de ventilação.
    ctx.fillStyle = '#33456b';
    for (let x = x0; x < end; x++) if (!blocked(x)) ctx.fillRect(x, y, 1, 1);
    const lamps = ['#7fe3ff', '#bfe9ff', '#ffe36e'];
    let i = 0;
    for (let x = x0 + 6; x < end - 4; x += 10, i++) {
      if (blocked(x)) continue;
      ctx.fillStyle = lamps[i % lamps.length];
      ctx.fillRect(x, y + 2, 2, 1);
    }
    for (let x = x0 + 30; x < end - 24; x += 68) {
      if (blocked(x) || blocked(x + 18)) continue;
      ctx.fillStyle = '#25324a';
      ctx.fillRect(x, y + 12, 19, 8);
      ctx.fillStyle = '#465571';
      for (let k = 0; k < 4; k++) ctx.fillRect(x + 2, y + 12 + k * 2, 15, 1);
      ctx.fillStyle = '#7fe3ff';
      ctx.fillRect(x + 1, y + 11, 1, 1);
      ctx.fillRect(x + 17, y + 11, 1, 1);
    }
  } else if (theme === 'spring') {
    // Primavera: ramo verde pendurado com flores brancas e rosas.
    for (let x = x0; x < end; x++) {
      if (blocked(x)) continue;
      const sag = Math.round(Math.sin(((x - x0) % 44) / 44 * Math.PI) * 2);
      ctx.fillStyle = '#4f8a45';
      ctx.fillRect(x, y + sag, 1, 2);
      if ((x - x0) % 11 === 5) ctx.fillRect(x, y + sag + 2, 1, 2);
    }
    let i = 0;
    for (let x = x0 + 6; x < end - 4; x += 14, i++) {
      if (blocked(x)) continue;
      const cy = y + Math.round(Math.sin(((x - x0) % 44) / 44 * Math.PI) * 2) + 1;
      const petal = i % 3 === 0 ? '#f28fb0' : '#ffffff';
      ctx.fillStyle = petal;
      ctx.fillRect(x - 1, cy, 3, 1);
      ctx.fillRect(x, cy - 1, 1, 3);
      ctx.fillStyle = '#f7d154';
      ctx.fillRect(x, cy, 1, 1);
      ctx.fillStyle = '#6aa956';
      ctx.fillRect(x + 2, cy + 2, 2, 1);
    }
  } else if (theme === 'autumn') {
    // Outono: varal de folhas secas em âmbar, laranja e vermelho.
    const cols = ['#e0a93e', '#d9783c', '#b85a2c', '#f0a647'];
    for (let x = x0; x < end; x++) {
      if (blocked(x)) continue;
      const sag = Math.round(Math.sin(((x - x0) % 46) / 46 * Math.PI) * 3);
      ctx.fillStyle = '#7a4f2c';
      ctx.fillRect(x, y + sag, 1, 1);
    }
    let i = 0;
    for (let x = x0 + 5; x < end - 6; x += 13, i++) {
      if (blocked(x) || blocked(x + 5)) continue;
      const sag = Math.round(Math.sin(((x - x0) % 46) / 46 * Math.PI) * 3);
      ctx.fillStyle = cols[i % cols.length];
      ctx.fillRect(x, y + sag + 1, 4, 1);
      ctx.fillRect(x + 1, y + sag + 2, 2, 1);
      ctx.fillRect(x + 1, y + sag, 2, 1);
      ctx.fillStyle = '#ffce8a';
      ctx.fillRect(x + 1, y + sag + 1, 1, 1);
    }
  } else if (theme === 'junina') {
    // Festa Junina: varal de bandeirinhas coloridas e lanternas de papel.
    ctx.fillStyle = '#7a4a2c';
    for (let x = x0; x < end; x++) {
      if (blocked(x)) continue;
      const sag = Math.round(Math.sin(((x - x0) % 52) / 52 * Math.PI) * 3);
      ctx.fillRect(x, y + sag, 1, 1);
    }
    const cols = ['#e8574a', '#f2c94c', '#3f9a5f', '#3f7fd8', '#f08bb0'];
    let i = 0;
    for (let x = x0 + 4; x < end - 8; x += 15, i++) {
      if (blocked(x) || blocked(x + 7)) continue;
      const sag = Math.round(Math.sin(((x - x0) % 52) / 52 * Math.PI) * 3);
      ctx.fillStyle = cols[i % cols.length];
      for (let row = 0; row < 5; row++) ctx.fillRect(x + row, y + sag + 1 + row, 12 - row * 2, 1);
      ctx.fillStyle = '#fff0c9';
      ctx.fillRect(x + 4, y + sag + 1, 1, 1);
    }
    for (let x = x0 + 22; x < end - 8; x += 62) {
      if (blocked(x)) continue;
      ctx.fillStyle = '#f2c94c';
      ctx.fillRect(x, y + 10, 6, 7);
      ctx.fillStyle = '#fff0c9';
      ctx.fillRect(x + 1, y + 11, 2, 2);
      ctx.fillStyle = '#e0a93e';
      ctx.fillRect(x + 2, y + 9, 2, 1);
      ctx.fillRect(x + 2, y + 17, 2, 1);
    }
  } else {
    for (let x = x0; x < end; x++) {
      if (blocked(x)) continue;
      const sag = Math.round(Math.sin(((x - x0) % 48) / 48 * Math.PI) * 3);
      ctx.fillStyle = theme === 'christmas' ? '#347653' : '#584068';
      ctx.fillRect(x, y + sag, 1, theme === 'christmas' ? 3 : 1);
      if ((x - x0) % 12 === 6) {
        ctx.fillStyle = theme === 'christmas' ? '#f5d491' : '#eea24d';
        ctx.fillRect(x, y + sag + 3, 2, 3);
        ctx.fillStyle = theme === 'christmas' ? '#fff0be' : '#ffd78a';
        ctx.fillRect(x, y + sag + 3, 1, 1);
      }
    }
    if (theme === 'halloween') {
      // Teias pequenas nos cantos; não cobrem os equipamentos.
      ctx.strokeStyle = '#d6bfdd';
      ctx.lineWidth = 1;
      for (const side of [1, -1]) {
        const x = side === 1 ? x0 : end;
        ctx.beginPath();
        for (const [dx, dy] of [[15, 0], [13, 7], [7, 13], [0, 15]]) {
          ctx.moveTo(x, y + 2);
          ctx.lineTo(x + side * dx, y + 2 + dy);
        }
        for (const r of [5, 10, 15]) {
          ctx.moveTo(x + side * r, y + 2);
          ctx.lineTo(x + side * Math.round(r * 0.7), y + 2 + Math.round(r * 0.7));
          ctx.lineTo(x, y + 2 + r);
        }
        ctx.stroke();
      }
      if (wall.w > 90) {
        const bat = prop('bat');
        ctx.drawImage(bat.canvas, Math.round(wall.x + wall.w / 2 - bat.ax), y + 18 - bat.ay);
      }
    }
  }
  ctx.restore();
}

/** Guirlandas nas molduras dos elevadores (sem cobrir a porta animada). */
export function decorateElevator(ctx: CanvasRenderingContext2D, theme: SeasonalTheme, x: number, y: number): void {
  if (theme === 'none') return;
  if (theme === 'cyberpunk') {
    const top = Math.round(y - 22);
    ctx.save();
    ctx.fillStyle = '#39e6f0';
    ctx.fillRect(Math.round(x - 12), top, 24, 1);
    ctx.fillRect(Math.round(x - 12), top, 1, 6);
    ctx.fillRect(Math.round(x + 11), top, 1, 6);
    ctx.fillStyle = '#ff4fd8';
    ctx.fillRect(Math.round(x - 7), top + 2, 14, 1);
    ctx.fillStyle = '#9df6ff';
    ctx.fillRect(Math.round(x), top - 2, 2, 2);
    ctx.restore();
    return;
  }
  if (theme === 'retro') {
    const top = Math.round(y - 20);
    ctx.save();
    ctx.fillStyle = '#7a4a2c';
    ctx.fillRect(Math.round(x - 13), top, 26, 1);
    for (let i = 0; i < 3; i++) {
      const bx = Math.round(x - 9 + i * 9);
      ctx.fillStyle = i === 1 ? '#f4dfae' : '#ffcf7a';
      ctx.fillRect(bx, top + 1, 2, 3);
      ctx.fillStyle = '#fff0c9';
      ctx.fillRect(bx, top + 1, 1, 1);
    }
    ctx.restore();
    return;
  }
  if (theme === 'orbital') {
    // Moldura de escotilha: cantoneiras metálicas com tiras de luz fria.
    const top = Math.round(y - 21);
    const left = Math.round(x - 14);
    ctx.save();
    ctx.fillStyle = '#465571';
    ctx.fillRect(left, top, 28, 2);
    ctx.fillRect(left, top, 2, 7);
    ctx.fillRect(left + 26, top, 2, 7);
    ctx.fillStyle = '#7fe3ff';
    ctx.fillRect(left + 3, top + 3, 8, 1);
    ctx.fillRect(left + 17, top + 3, 8, 1);
    ctx.fillStyle = '#bfe9ff';
    ctx.fillRect(left + 13, top + 2, 2, 2);
    ctx.restore();
    return;
  }
  if (theme === 'spring') {
    // Arco de flores em volta da porta.
    const top = Math.round(y - 20);
    ctx.save();
    ctx.fillStyle = '#4f8a45';
    ctx.fillRect(Math.round(x - 13), top, 27, 1);
    ctx.fillRect(Math.round(x - 13), top, 1, 6);
    ctx.fillRect(Math.round(x + 13), top, 1, 6);
    for (let i = 0; i < 5; i++) {
      const bx = Math.round(x - 11 + i * 6);
      ctx.fillStyle = i % 2 === 0 ? '#f28fb0' : '#ffffff';
      ctx.fillRect(bx, top + 1, 2, 2);
      ctx.fillStyle = '#f7d154';
      ctx.fillRect(bx, top + 1, 1, 1);
    }
    ctx.restore();
    return;
  }
  if (theme === 'autumn') {
    // Grinalda de folhas secas.
    const top = Math.round(y - 20);
    ctx.save();
    ctx.fillStyle = '#7a4f2c';
    ctx.fillRect(Math.round(x - 13), top, 27, 1);
    const cols = ['#e0a93e', '#d9783c', '#b85a2c', '#f0a647'];
    for (let i = 0; i < 6; i++) {
      const bx = Math.round(x - 12 + i * 5);
      ctx.fillStyle = cols[i % cols.length];
      ctx.fillRect(bx, top + 1 + (i % 2), 3, 2);
    }
    ctx.restore();
    return;
  }
  if (theme === 'junina') {
    // Bandeirinhas e um balãozinho de papel sobre a porta.
    const top = Math.round(y - 21);
    ctx.save();
    ctx.fillStyle = '#7a4a2c';
    ctx.fillRect(Math.round(x - 14), top, 29, 1);
    const cols = ['#e8574a', '#f2c94c', '#3f9a5f', '#3f7fd8'];
    for (let i = 0; i < 5; i++) {
      const bx = Math.round(x - 13 + i * 6);
      ctx.fillStyle = cols[i % cols.length];
      for (let row = 0; row < 3; row++) ctx.fillRect(bx + row, top + 1 + row, 5 - row * 2, 1);
    }
    ctx.fillStyle = '#f08bb0';
    ctx.fillRect(Math.round(x - 3), top - 7, 6, 5);
    ctx.fillStyle = '#f7b7cc';
    ctx.fillRect(Math.round(x - 2), top - 6, 2, 2);
    ctx.fillStyle = '#e0a93e';
    ctx.fillRect(Math.round(x), top - 2, 1, 2);
    ctx.restore();
    return;
  }
  const sprite = prop(theme === 'christmas' ? 'wreath' : 'bat');
  ctx.drawImage(sprite.canvas, Math.round(x - sprite.ax), Math.round(y - 19 - sprite.ay));
}

const GLOW: Record<SeasonalTheme, string> = {
  none: '#ffffff',
  christmas: '#ffd58b',
  halloween: '#d8a5ed',
  cyberpunk: '#5ff6ff',
  retro: '#ffcf7a',
  orbital: '#bfe9ff',
  spring: '#ffd6e4',
  autumn: '#ffb166',
  junina: '#ffd06e',
};

const glows = new Map<SeasonalTheme, HTMLCanvasElement>();
function glowSprite(theme: SeasonalTheme): HTMLCanvasElement {
  let canvas = glows.get(theme);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = canvas.height = 34;
    const ctx = canvas.getContext('2d')!;
    const glow = ctx.createRadialGradient(17, 17, 1, 17, 17, 17);
    glow.addColorStop(0, GLOW[theme]);
    glow.addColorStop(1, 'rgba(255,220,180,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 34, 34);
    glows.set(theme, canvas);
  }
  return canvas;
}

/** Luz decorativa suave, limitada à face da parede. Não interfere com salas apagadas. */
export function drawSeasonalLights(ctx: CanvasRenderingContext2D, theme: SeasonalTheme, layout: AreaLayout, light: number): void {
  if (theme === 'none' || light <= 0.01) return;
  ctx.save();
  for (const wall of layout.walls) {
    if (wall.kind !== 'face') continue;
    ctx.save();
    ctx.beginPath();
    ctx.rect(wall.x, wall.y + 4, wall.w, 27);
    ctx.clip();
    for (let x = wall.x + 14; x < wall.x + wall.w - 6; x += 24) {
      if (wall.doorways?.some((d) => x >= d.x - 10 && x <= d.x + d.w + 10)) continue;
      ctx.globalAlpha = light * 0.3;
      ctx.drawImage(glowSprite(theme), Math.round(x - 17), theme === 'cyberpunk' || theme === 'retro' || theme === 'orbital' ? wall.y + 2 : wall.y - 8);
      ctx.globalAlpha = light * 0.85;
      if (theme === 'cyberpunk') {
        ctx.fillStyle = Math.floor(x / 24) % 2 === 0 ? '#39e6f0' : '#ff4fd8';
        ctx.fillRect(Math.round(x), wall.y + 9, 2, 2);
      } else if (theme === 'retro') {
        ctx.fillStyle = Math.floor(x / 24) % 2 === 0 ? '#ffcf7a' : '#f4dfae';
        ctx.fillRect(Math.round(x), wall.y + 9, 2, 2);
      } else if (theme === 'orbital') {
        ctx.fillStyle = Math.floor(x / 24) % 2 === 0 ? '#bfe9ff' : '#7fe3ff';
        ctx.fillRect(Math.round(x), wall.y + 9, 2, 2);
      } else if (theme === 'spring') {
        ctx.fillStyle = Math.floor(x / 24) % 2 === 0 ? '#ffe4ee' : '#f7b7cc';
        ctx.fillRect(Math.round(x), wall.y + 9, 2, 2);
      } else if (theme === 'autumn') {
        ctx.fillStyle = Math.floor(x / 24) % 2 === 0 ? '#ffce8a' : '#f0a647';
        ctx.fillRect(Math.round(x), wall.y + 9, 2, 2);
      } else if (theme === 'junina') {
        ctx.fillStyle = Math.floor(x / 24) % 2 === 0 ? '#ffe36e' : '#ff9a6b';
        ctx.fillRect(Math.round(x), wall.y + 9, 2, 2);
      } else {
        ctx.fillStyle = theme === 'christmas' ? '#ffe4a9' : '#ffd181';
        ctx.fillRect(Math.round(x), wall.y + 9, 2, 2);
      }
    }
    ctx.restore();
  }
  ctx.restore();
}

export function drawSeasonalWindow(ctx: CanvasRenderingContext2D, theme: SeasonalTheme, glass: { x: number; y: number; w: number; h: number }, now: number, seed: number, scenario: ScenarioTheme = 'city'): void {
  if (scenario === 'city' && (theme === 'none' || theme === 'halloween')) return;
  const activeMode: string = scenario !== 'city' ? scenario : theme;
  ctx.save();
  ctx.beginPath();
  ctx.rect(glass.x, glass.y, glass.w, glass.h);
  ctx.clip();
  if (activeMode === 'cyberpunk') {
    // Cidade de neon ao fundo e chuva fina escorrendo no vidro.
    const horizon = Math.floor(glass.y + glass.h * 0.62);
    ctx.fillStyle = '#1b1533';
    ctx.fillRect(glass.x, horizon, glass.w, glass.y + glass.h - horizon);
    for (let i = 0; i < 14; i++) {
      const w = 3 + ((seed >>> 0) + i * 7) % 5;
      const h = 4 + ((seed >>> 0) + i * 11) % 9;
      const x = glass.x + ((seed >>> 0) + i * 13) % Math.max(1, Math.floor(glass.w) - w);
      ctx.fillStyle = i % 3 === 0 ? '#ff4fd8' : i % 3 === 1 ? '#39e6f0' : '#7a6bb0';
      ctx.fillRect(Math.floor(x), horizon - h, w, h);
      ctx.fillStyle = '#ffe36e';
      if (i % 4 === 0) ctx.fillRect(Math.floor(x) + 1, horizon - h + 1, 1, 1);
    }
    ctx.fillStyle = '#9df6ff';
    ctx.globalAlpha *= 0.55;
    for (let i = 0; i < 18; i++) {
      const x = ((seed >>> 0) + i * 17) % Math.max(1, Math.floor(glass.w));
      const y = (Math.floor(now / 70) + i * 13) % Math.max(1, Math.floor(glass.h));
      ctx.fillRect(Math.floor(glass.x + x), Math.floor(glass.y + y), 1, 3);
    }
  } else if (activeMode === 'retro') {
    // Entardecer em faixas, meio pôster de lanchonete.
    const bands = ['#f6c46b', '#f0a05a', '#d9783c', '#a4653f'];
    const bandH = Math.max(1, Math.floor(glass.h / bands.length));
    bands.forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.fillRect(glass.x, Math.floor(glass.y + i * bandH), glass.w, i === bands.length - 1 ? glass.h - i * bandH : bandH);
    });
    ctx.fillStyle = '#fff0c9';
    const sunY = Math.floor(glass.y + glass.h * 0.42);
    ctx.fillRect(Math.floor(glass.x + glass.w * 0.32), sunY, Math.max(3, Math.floor(glass.w * 0.3)), Math.max(3, Math.floor(glass.h * 0.3)));
    ctx.fillStyle = '#f0a05a';
    for (let i = 0; i < 3; i++) ctx.fillRect(glass.x, sunY + 3 + i * 3, glass.w, 1);
  } else if (activeMode === 'forest') {
    // Vista de pinheiros e copas de árvores na floresta
    const horizon = Math.floor(glass.y + glass.h * 0.55);
    ctx.fillStyle = '#2d5a3f';
    ctx.fillRect(glass.x, horizon, glass.w, glass.y + glass.h - horizon);
    for (let i = 0; i < 10; i++) {
      const pw = 4 + ((seed >>> 0) + i * 5) % 5;
      const ph = 6 + ((seed >>> 0) + i * 7) % 8;
      const px = glass.x + ((seed >>> 0) + i * 9) % Math.max(1, Math.floor(glass.w) - pw);
      ctx.fillStyle = i % 2 === 0 ? '#1f452e' : '#3d7352';
      ctx.fillRect(Math.floor(px), horizon - ph, pw, ph);
    }
  } else if (activeMode === 'orbital') {
    // Espaço: nebulosa tênue, campo de estrelas e um planeta com anel.
    ctx.fillStyle = '#0b1226';
    ctx.fillRect(glass.x, glass.y, glass.w, glass.h);
    ctx.fillStyle = '#1b2a52';
    for (let i = 0; i < 5; i++) {
      const nx = glass.x + ((seed >>> 0) + i * 31) % Math.max(1, Math.floor(glass.w));
      const ny = glass.y + ((seed >>> 0) + i * 17) % Math.max(1, Math.floor(glass.h * 0.6));
      ctx.fillRect(Math.floor(nx), Math.floor(ny), 10 + (i % 3) * 6, 4);
    }
    for (let i = 0; i < 26; i++) {
      const x = glass.x + ((seed >>> 0) + i * 23) % Math.max(1, Math.floor(glass.w));
      const y = glass.y + ((seed >>> 0) + i * 41) % Math.max(1, Math.floor(glass.h));
      ctx.fillStyle = i % 7 === 0 ? '#bfe9ff' : '#eaf6ff';
      ctx.fillRect(Math.floor(x), Math.floor(y), i % 7 === 0 ? 2 : 1, 1);
    }
    const pr = Math.max(3, Math.min(Math.floor(glass.w * 0.3), Math.floor(glass.h * 0.34)));
    const px0 = Math.floor(glass.x + glass.w * 0.68);
    const py0 = Math.floor(glass.y + glass.h * 0.6);
    for (let dy = -pr; dy <= pr; dy++) {
      const half = Math.floor(Math.sqrt(Math.max(0, pr * pr - dy * dy)));
      ctx.fillStyle = dy < -pr * 0.2 ? '#4f86a8' : '#2f5d7d';
      ctx.fillRect(px0 - half, py0 + dy, half * 2, 1);
      // terminador: metade direita na sombra
      ctx.fillStyle = '#1d3b52';
      const sh = Math.floor(half * 0.15);
      ctx.fillRect(px0 + sh, py0 + dy, half - sh, 1);
    }
    ctx.fillStyle = '#8fb0c9';
    for (let dx = -pr * 2; dx <= pr * 2; dx++) {
      if (Math.abs(dx) < pr * 0.75) continue;
      const y = py0 + Math.round((dx / (pr * 2)) * pr * 0.55);
      ctx.fillRect(px0 + dx, y, 1, 1);
      if (Math.abs(dx) > pr * 0.9) ctx.fillRect(px0 + dx, y + 1, 1, 1);
    }
    // reflexo frio na borda de cima do vidro
    ctx.fillStyle = '#bfe9ff';
    ctx.globalAlpha *= 0.35;
    ctx.fillRect(glass.x, glass.y, glass.w, 1);
  } else if (activeMode === 'spring') {
    // Primavera: céu claro, sol e árvores floridas com pétalas ao vento.
    ctx.fillStyle = '#cfe9f7';
    ctx.fillRect(glass.x, glass.y, glass.w, glass.h);
    ctx.fillStyle = '#ffe9a3';
    const sx = Math.floor(glass.x + glass.w * 0.74);
    const sy = Math.floor(glass.y + glass.h * 0.22);
    ctx.fillRect(sx - 3, sy - 2, 7, 5);
    ctx.fillRect(sx - 2, sy - 3, 5, 7);
    const horizon = Math.floor(glass.y + glass.h * 0.66);
    ctx.fillStyle = '#9fce7d';
    ctx.fillRect(glass.x, horizon, glass.w, glass.y + glass.h - horizon);
    for (let i = 0; i < 9; i++) {
      const tw = 5 + ((seed >>> 0) + i * 5) % 4;
      const th = 6 + ((seed >>> 0) + i * 7) % 7;
      const tx = glass.x + ((seed >>> 0) + i * 11) % Math.max(1, Math.floor(glass.w) - tw);
      ctx.fillStyle = '#7a5539';
      ctx.fillRect(Math.floor(tx + tw / 2), horizon - 2, 1, 3);
      ctx.fillStyle = i % 3 === 0 ? '#f7b7cc' : i % 3 === 1 ? '#ffffff' : '#f28fb0';
      ctx.fillRect(Math.floor(tx), horizon - th, tw, th - 3);
      ctx.fillStyle = '#e88fae';
      ctx.fillRect(Math.floor(tx + 1), horizon - th + 1, tw - 2, 2);
    }
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha *= 0.8;
    for (let i = 0; i < 10; i++) {
      const x = ((seed >>> 0) + i * 19) % Math.max(1, Math.floor(glass.w));
      const y = (Math.floor(now / 160) + i * 9) % Math.max(1, Math.floor(glass.h));
      ctx.fillRect(Math.floor(glass.x + x), Math.floor(glass.y + y), 2, 1);
    }
  } else if (activeMode === 'autumn') {
    // Outono: entardecer âmbar, árvores desfolhadas e folhas voando.
    const bands = ['#f6d79a', '#f0b46e', '#d98c4f', '#a8602f'];
    const bandH = Math.max(1, Math.floor(glass.h / bands.length));
    bands.forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.fillRect(glass.x, Math.floor(glass.y + i * bandH), glass.w, i === bands.length - 1 ? glass.h - i * bandH : bandH);
    });
    const horizon = Math.floor(glass.y + glass.h * 0.7);
    ctx.fillStyle = '#b07a3f';
    ctx.fillRect(glass.x, horizon, glass.w, glass.y + glass.h - horizon);
    for (let i = 0; i < 7; i++) {
      const tw = 4 + ((seed >>> 0) + i * 5) % 4;
      const th = 5 + ((seed >>> 0) + i * 7) % 6;
      const tx = glass.x + ((seed >>> 0) + i * 13) % Math.max(1, Math.floor(glass.w) - tw);
      ctx.fillStyle = i % 2 ? '#8c4a2a' : '#a85a2c';
      ctx.fillRect(Math.floor(tx), horizon - th, tw, th);
      ctx.fillStyle = '#d9783c';
      ctx.fillRect(Math.floor(tx + 1), horizon - th + 1, tw - 2, 2);
    }
    ctx.fillStyle = '#ffce8a';
    for (let i = 0; i < 12; i++) {
      const x = ((seed >>> 0) + i * 17) % Math.max(1, Math.floor(glass.w));
      const y = (Math.floor(now / 130) + i * 11) % Math.max(1, Math.floor(glass.h));
      ctx.fillRect(Math.floor(glass.x + x), Math.floor(glass.y + y), 2, 1);
      ctx.fillRect(Math.floor(glass.x + x) + 1, Math.floor(glass.y + y) + 1, 1, 1);
    }
  } else if (activeMode === 'junina') {
    // Festa Junina: céu de fim de tarde com balões de papel subindo.
    const bands = ['#f0c98a', '#e8a06a', '#c76f5a', '#7a4a6b'];
    const bandH = Math.max(1, Math.floor(glass.h / bands.length));
    bands.forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.fillRect(glass.x, Math.floor(glass.y + i * bandH), glass.w, i === bands.length - 1 ? glass.h - i * bandH : bandH);
    });
    const horizon = Math.floor(glass.y + glass.h * 0.78);
    ctx.fillStyle = '#5a5a3f';
    ctx.fillRect(glass.x, horizon, glass.w, glass.y + glass.h - horizon);
    for (let i = 0; i < 4; i++) {
      const bx = glass.x + ((seed >>> 0) + i * 29) % Math.max(1, Math.floor(glass.w) - 10);
      const by = glass.y + ((seed >>> 0) + i * 23 + Math.floor(now / 140)) % Math.max(1, Math.floor(glass.h * 0.6));
      ctx.fillStyle = i % 2 === 0 ? '#f2c94c' : '#e8574a';
      ctx.fillRect(Math.floor(bx), Math.floor(by), 6, 5);
      ctx.fillStyle = '#fff0c9';
      ctx.fillRect(Math.floor(bx) + 1, Math.floor(by) - 1, 2, 1);
      ctx.fillRect(Math.floor(bx) + 1, Math.floor(by) + 6, 1, 2);
    }
  } else if (activeMode === 'snow') {
    // Neve: céu pálido, campo branco, pinheiros e flocos caindo.
    ctx.fillStyle = '#d8e4ef';
    ctx.fillRect(glass.x, glass.y, glass.w, glass.h);
    const horizon = Math.floor(glass.y + glass.h * 0.66);
    ctx.fillStyle = '#f4f8fc';
    ctx.fillRect(glass.x, horizon, glass.w, glass.y + glass.h - horizon);
    for (let i = 0; i < 8; i++) {
      const pw = 4 + ((seed >>> 0) + i * 7) % 4;
      const ph = 6 + ((seed >>> 0) + i * 5) % 7;
      const px = glass.x + ((seed >>> 0) + i * 11) % Math.max(1, Math.floor(glass.w) - pw);
      ctx.fillStyle = i % 2 === 0 ? '#2f5a45' : '#3f7256';
      ctx.fillRect(Math.floor(px), horizon - ph, pw, ph);
      ctx.fillStyle = '#eef6fc';
      ctx.fillRect(Math.floor(px), horizon - ph, pw, 1);
      ctx.fillRect(Math.floor(px) + 1, horizon - Math.floor(ph / 2), pw - 2, 1);
    }
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 24; i++) {
      const x = ((seed >>> 0) + i * 13) % Math.max(1, Math.floor(glass.w));
      const y = (Math.floor(now / 90) + i * 7) % Math.max(1, Math.floor(glass.h));
      ctx.fillRect(Math.floor(glass.x + x), Math.floor(glass.y + y), i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
    }
  } else if (activeMode === 'beach') {
    // Praia: céu de verão, sol, mar com ondas e gaivotas.
    ctx.fillStyle = '#bfe6f5';
    ctx.fillRect(glass.x, glass.y, glass.w, glass.h);
    ctx.fillStyle = '#fff2b8';
    const sx = Math.floor(glass.x + glass.w * 0.24);
    const sy = Math.floor(glass.y + glass.h * 0.2);
    ctx.fillRect(sx - 2, sy - 2, 5, 5);
    ctx.fillRect(sx - 3, sy - 1, 7, 3);
    const sea = Math.floor(glass.y + glass.h * 0.52);
    ctx.fillStyle = '#3f9ec6';
    ctx.fillRect(glass.x, sea, glass.w, glass.y + glass.h - sea);
    ctx.fillStyle = '#5fc0dd';
    ctx.fillRect(glass.x, sea, glass.w, 2);
    ctx.fillStyle = '#a8e6f2';
    for (let row = 0; row < 5; row++) {
      const y = sea + 4 + row * 5;
      for (let x = glass.x + ((row * 7) % 9); x < glass.x + glass.w; x += 13) {
        ctx.fillRect(Math.floor(x), Math.floor(y), 4, 1);
      }
    }
    ctx.fillStyle = '#f0f7fa';
    for (const [bx, by] of [[0.5, 0.25], [0.62, 0.18], [0.7, 0.3]]) {
      const x = Math.floor(glass.x + glass.w * bx);
      const y = Math.floor(glass.y + glass.h * by);
      ctx.fillRect(x, y, 3, 1);
      ctx.fillRect(x - 2, y - 1, 2, 1);
      ctx.fillRect(x + 3, y - 1, 2, 1);
    }
  } else {
    ctx.fillStyle = '#edf3f3';
    ctx.globalAlpha *= 0.7;
    ctx.fillRect(glass.x, glass.y + glass.h - 2, glass.w, 2);
    for (let i = 0; i < 12; i++) {
      const x = ((seed >>> 0) + i * 17) % Math.max(1, Math.floor(glass.w));
      const y = (Math.floor(now / 180) + i * 11) % Math.max(1, Math.floor(glass.h));
      ctx.fillRect(Math.floor(glass.x + x), Math.floor(glass.y + y), 1, 1);
    }
  }
  ctx.restore();
}
