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
  if (theme === 'halloween') return (['witch', 'pumpkin', 'vampire'] as const)[(seed >>> 0) % 3];
  return undefined;
}

/** Reutiliza footprints de plantas: nenhuma nova colisão ou mudança de caminhos. */
export function seasonalFurniture(theme: SeasonalTheme, kind: FurnitureKind, area: AreaLayout, seed: number): Sprite | null {
  if (theme === 'none' || area.kind === 'restroom') return null;
  if (kind === 'plant_tall') {
    const first = area.furniture.find((f) => f.kind === 'plant_tall');
    if (theme === 'cyberpunk') return prop(first && hash32(first.id) === seed ? 'holo' : 'neon');
    if (theme === 'retro') return prop(first && hash32(first.id) === seed ? 'arcade' : 'tv');
    if (!first || hash32(first.id) !== seed) return null;
    if (theme === 'christmas') return prop('tree');
    return prop(seed % 3 === 0 ? 'ghost' : 'pumpkin');
  }
  if (kind === 'plant_small') {
    if (theme === 'christmas') return prop('gift');
    if (theme === 'cyberpunk') return prop('neon');
    if (theme === 'retro') return prop('tv');
    return prop('pumpkin');
  }
  return null;
}

export function seasonalRugColor(theme: SeasonalTheme, original: string): string {
  if (theme === 'christmas') return '#a93649';
  if (theme === 'halloween') return '#60416f';
  if (theme === 'cyberpunk') return '#2b2450';
  if (theme === 'retro') return '#a4653f';
  return original;
}

export function seasonalWallStyle(theme: SeasonalTheme, original: WallStyle): WallStyle {
  if (theme === 'none' || original.pattern === 'glass') return original;
  if (theme === 'cyberpunk') return { ...original, base: mix(original.base, '#241d38', 0.62), trim: '#39e6f0' };
  if (theme === 'retro') return { ...original, base: mix(original.base, '#f0cf9a', 0.32), trim: '#a4643a' };
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
  const sprite = prop(theme === 'christmas' ? 'wreath' : 'bat');
  ctx.drawImage(sprite.canvas, Math.round(x - sprite.ax), Math.round(y - 19 - sprite.ay));
}

const GLOW: Record<SeasonalTheme, string> = {
  none: '#ffffff',
  christmas: '#ffd58b',
  halloween: '#d8a5ed',
  cyberpunk: '#5ff6ff',
  retro: '#ffcf7a',
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
      ctx.drawImage(glowSprite(theme), Math.round(x - 17), theme === 'cyberpunk' || theme === 'retro' ? wall.y + 2 : wall.y - 8);
      ctx.globalAlpha = light * 0.85;
      if (theme === 'cyberpunk') {
        ctx.fillStyle = Math.floor(x / 24) % 2 === 0 ? '#39e6f0' : '#ff4fd8';
        ctx.fillRect(Math.round(x), wall.y + 9, 2, 2);
      } else if (theme === 'retro') {
        ctx.fillStyle = Math.floor(x / 24) % 2 === 0 ? '#ffcf7a' : '#f4dfae';
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
