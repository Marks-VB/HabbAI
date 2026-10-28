// Sprites procedurais da área externa (árvores, arbustos, postes, carros...) e utilitários
// visuais do mundo (sombra, brilhos). Mesma direção de arte do módulo de arte: contorno
// cinza-azulado escuro, 3–4 tons por material, luz vinda de cima/esquerda.
import { mulberry32 } from '../../../../shared/hash';
import type { ExteriorProp } from '../layout/types';
import type { ScenarioTheme } from '../api';

export interface PropSprite {
  canvas: HTMLCanvasElement;
  ax: number;
  ay: number;
}

const cache = new Map<string, PropSprite>();

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

function hex(c: string): [number, number, number] {
  const n = Number.parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Pintor por pixel (ImageData) para formas orgânicas. */
class Painter {
  readonly data: ImageData;
  constructor(
    readonly ctx: CanvasRenderingContext2D,
    readonly w: number,
    readonly h: number,
  ) {
    // parte do conteúdo já desenhado (ex.: sombra) para não apagá-lo no putImageData
    this.data = ctx.getImageData(0, 0, w, h);
  }
  set(x: number, y: number, color: string, a = 255): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const [r, g, b] = hex(color);
    const i = (y * this.w + x) * 4;
    this.data.data[i] = r;
    this.data.data[i + 1] = g;
    this.data.data[i + 2] = b;
    this.data.data[i + 3] = a;
  }
  alpha(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data.data[(y * this.w + x) * 4 + 3];
  }
  flush(): void {
    this.ctx.putImageData(this.data, 0, 0);
  }
}

function shadowEllipse(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, a = 0.22): void {
  ctx.fillStyle = `rgba(28,36,52,${a})`;
  for (let y = -ry; y <= ry; y++) {
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
    ctx.fillRect(cx - half, cy + y, half * 2, 1);
  }
}

/** Copa arredondada: união de círculos com sombreamento por luz superior-esquerda. */
function canopy(p: Painter, rng: () => number, cx: number, cy: number, r: number, tones: string[], outline: string): void {
  const blobs: [number, number, number][] = [[cx, cy, r]];
  for (let i = 0; i < 4; i++) {
    const a = rng() * Math.PI * 2;
    const d = r * (0.35 + rng() * 0.35);
    blobs.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, r * (0.55 + rng() * 0.25)]);
  }
  const inside = (x: number, y: number) => blobs.some(([bx, by, br]) => (x - bx) ** 2 + (y - by) ** 2 <= br * br);
  const x0 = Math.floor(cx - r * 1.8);
  const x1 = Math.ceil(cx + r * 1.8);
  const y0 = Math.floor(cy - r * 1.6);
  const y1 = Math.ceil(cy + r * 1.6);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!inside(x + 0.5, y + 0.5)) continue;
      const edge = !inside(x - 0.5, y + 0.5) || !inside(x + 1.5, y + 0.5) || !inside(x + 0.5, y - 0.5) || !inside(x + 0.5, y + 1.5);
      if (edge) {
        p.set(x, y, outline);
        continue;
      }
      // luz: topo-esquerda mais claro; ruído para "folhas"
      const nx = (x - cx) / r;
      const ny = (y - cy) / r;
      const light = -nx * 0.45 - ny * 0.75 + (rng() - 0.5) * 0.55;
      const k = light > 0.55 ? 3 : light > 0.05 ? 2 : light > -0.5 ? 1 : 0;
      p.set(x, y, tones[k]);
    }
  }
}

function treeSprite(seed: number, scenario: ScenarioTheme = 'city'): PropSprite {
  const rng = mulberry32(seed);
  const isTall = scenario === 'forest';
  const canvasW = isTall ? 44 : 36;
  const canvasH = isTall ? 60 : 48;
  const midX = Math.floor(canvasW / 2);
  const baseAy = canvasH - 3;
  const [c, ctx] = makeCanvas(canvasW, canvasH);
  shadowEllipse(ctx, midX, baseAy, isTall ? 15 : 12, 3, 0.28);
  const p = new Painter(ctx, canvasW, canvasH);
  // tronco
  const trunkTop = isTall ? 34 : 30;
  for (let y = trunkTop; y < baseAy + 1; y++) {
    for (let x = midX - 2; x <= midX + 2; x++) {
      const col = x === midX - 2 ? '#8a6243' : x === midX + 2 ? '#4a3222' : '#6b4a32';
      p.set(x, y, col);
    }
  }
  p.set(midX - 3, baseAy, '#4a3222');
  p.set(midX + 3, baseAy, '#4a3222');
  const variants = scenario === 'forest' ? [
    ['#144229', '#1d5e3c', '#2e8756', '#48b877'],
    ['#123b24', '#195434', '#267a4c', '#3ea66a'],
    ['#0f331f', '#164a2d', '#226b42', '#36935c'],
  ] : scenario === 'retro' ? [
    ['#9c4a24', '#bd5f28', '#e07f3c', '#f5aa67'],
    ['#8a3a22', '#b34d28', '#d66e38', '#f29858'],
    ['#b36822', '#d48228', '#f5a638', '#ffd16e'],
  ] : scenario === 'cyberpunk' ? [
    ['#1d2440', '#25355e', '#365394', '#4d7ae0'],
    ['#2d1b45', '#482773', '#6f3aa8', '#a85ff0'],
    ['#15333a', '#1e4f57', '#2e7a82', '#45b8bd'],
  ] : scenario === 'snow' ? [
    ['#c3d7e6', '#d6e5f1', '#e7f2fa', '#ffffff'],
    ['#b6cfe0', '#cfe0ee', '#e2eff8', '#ffffff'],
    ['#cddff0', '#e0ecf7', '#eff7fd', '#ffffff'],
  ] : scenario === 'beach' ? [
    ['#2c6b4a', '#3a8a57', '#4fa96b', '#79c98a'],
    ['#2f7a52', '#3f9a63', '#5fbf7a', '#8fdb9a'],
    ['#377a4a', '#479a58', '#5fb46a', '#8fd07f'],
  ] : [
    ['#2f6a43', '#3f8550', '#5aa45d', '#86c873'],
    ['#356b3c', '#4b8a45', '#6aa956', '#9fcf74'],
    ['#2c6250', '#3a7e5f', '#53a071', '#82c489'],
  ];
  const radius = isTall ? 14 + Math.floor(rng() * 3) : 11 + Math.floor(rng() * 3);
  const canopyY = isTall ? 22 : 18;
  const outline = scenario === 'forest' ? '#0d2b1b' : scenario === 'snow' ? '#8aa6bb' : '#25463a';
  canopy(p, rng, midX, canopyY, radius, variants[Math.floor(rng() * variants.length)], outline);
  p.flush();
  return { canvas: c, ax: midX, ay: baseAy };
}

function pineSprite(seed: number, scenario: ScenarioTheme = 'city'): PropSprite {
  const rng = mulberry32(seed);
  // Na floresta, os pinheiros são mais altos e encorpados (64px de altura com 5 camadas)
  const isTall = scenario === 'forest';
  const canvasW = isTall ? 34 : 28;
  const canvasH = isTall ? 64 : 48;
  const midX = Math.floor(canvasW / 2);
  const baseAy = canvasH - 3;
  const [c, ctx] = makeCanvas(canvasW, canvasH);
  shadowEllipse(ctx, midX, baseAy, isTall ? 12 : 9, 3, 0.28);
  const p = new Painter(ctx, canvasW, canvasH);
  // tronco
  const trunkTop = isTall ? 46 : 38;
  for (let y = trunkTop; y < baseAy + 1; y++) {
    for (let x = midX - 2; x <= midX + 2; x++) {
      p.set(x, y, x === midX - 2 ? '#8a6243' : x === midX + 2 ? '#4a3222' : '#6b4a32');
    }
  }
  const tones = scenario === 'forest'
    ? ['#143a29', '#1d5239', '#2d7a52', '#44a872'] // Floresta: verde profundo denso e majestoso
    : scenario === 'retro'
    ? ['#6e4125', '#8c542e', '#b8753d', '#df9a56'] // Retrô: outonal
    : scenario === 'cyberpunk'
    ? ['#162540', '#1f3c66', '#2b5894', '#4288d4'] // Cyberpunk: ciano/azul
    : scenario === 'snow'
    ? ['#1d4a38', '#28624a', '#3a7f5f', '#4f9a75'] // Neve: verde escuro sob a neve
    : ['#24533f', '#2f6b4f', '#3f8a5f', '#62ab79'];
  const outline = scenario === 'forest' ? '#0f291d' : scenario === 'retro' ? '#4a2b18' : scenario === 'cyberpunk' ? '#0f1a2e' : scenario === 'snow' ? '#133326' : '#1d3f33';
  const layers = isTall ? 5 : 4;
  const layerStep = isTall ? 9 : 8;
  const layerH = isTall ? 16 : 14;
  for (let l = 0; l < layers; l++) {
    const top = 3 + l * layerStep;
    const bottom = top + layerH;
    for (let y = top; y < bottom; y++) {
      const half = Math.round(((y - top) / (bottom - top)) * (isTall ? 6 + l * 2.4 : 5 + l * 2.2));
      for (let x = midX - half; x <= midX + half; x++) {
        const edge = x === midX - half || x === midX + half || y === bottom - 1;
        const light = (midX - x) / (half + 1) - (y - top) / (bottom - top) + (rng() - 0.5) * 0.5;
        p.set(x, y, edge ? outline : tones[light > 0.5 ? 3 : light > -0.1 ? 2 : light > -0.6 ? 1 : 0]);
      }
    }
    if (scenario === 'snow') {
      // Neve acumulada nas pontas de cada camada.
      const half = Math.round(layerH / (bottom - top) * (isTall ? 6 + l * 2.4 : 5 + l * 2.2));
      for (let x = midX - half + 1; x <= midX + half - 1; x++) {
        if (rng() < 0.55) p.set(x, top, '#f4f8fc');
        if (rng() < 0.3) p.set(x, top + 1, '#e4eff8');
      }
    }
  }
  p.flush();
  return { canvas: c, ax: midX, ay: baseAy };
}

function bushSprite(seed: number, scenario: ScenarioTheme = 'city'): PropSprite {
  const rng = mulberry32(seed);
  const [c, ctx] = makeCanvas(22, 16);
  shadowEllipse(ctx, 11, 14, 9, 2, 0.22);
  const p = new Painter(ctx, 22, 16);
  const tones = scenario === 'forest'
    ? ['#205436', '#2d7749', '#41a364', '#66cc8a']
    : scenario === 'retro'
    ? ['#854625', '#a85f31', '#d48344', '#f5b06e']
    : scenario === 'cyberpunk'
    ? ['#1f2a4a', '#2a3d6d', '#3d599c', '#5e86de']
    : scenario === 'snow'
    ? ['#b9cede', '#cde0ee', '#e2eef8', '#ffffff']
    : scenario === 'beach'
    ? ['#2c6b4a', '#3a8a57', '#4fa96b', '#79c98a']
    : ['#34663f', '#47864c', '#62a45a', '#8cc66f'];
  const outline = scenario === 'forest' ? '#163b26' : scenario === 'retro' ? '#5a2e16' : scenario === 'cyberpunk' ? '#141c30' : scenario === 'snow' ? '#8aa6bb' : '#264a36';
  canopy(p, rng, 11, 9, 6, tones, outline);
  // florzinhas / cogumelos na floresta
  if (rng() < 0.75) {
    const col = scenario === 'forest'
      ? ['#e8453c', '#ffffff', '#e8453c', '#f5a623'][Math.floor(rng() * 4)] // cogumelos vermelhos e bagas
      : ['#f2d14b', '#f28aa5', '#ffffff'][Math.floor(rng() * 3)];
    for (let i = 0; i < 5; i++) p.set(6 + Math.floor(rng() * 10), 5 + Math.floor(rng() * 6), col);
  }
  p.flush();
  return { canvas: c, ax: 11, ay: 14 };
}

function flowersSprite(seed: number): PropSprite {
  const rng = mulberry32(seed);
  const [c, ctx] = makeCanvas(30, 14);
  const p = new Painter(ctx, 30, 14);
  // canteiro: borda de pedra + terra
  for (let y = 4; y < 13; y++) {
    for (let x = 1; x < 29; x++) {
      const border = y === 4 || y === 12 || x === 1 || x === 28;
      p.set(x, y, border ? (y === 12 ? '#8d8a82' : '#b9b5aa') : '#6a4b35');
    }
  }
  const cols = ['#e8574a', '#f2c94c', '#f08bb0', '#ffffff', '#9b7be0'];
  for (let i = 0; i < 26; i++) {
    const x = 3 + Math.floor(rng() * 24);
    const y = 2 + Math.floor(rng() * 9);
    p.set(x, y + 1, '#3f8550');
    p.set(x, y, rng() < 0.75 ? cols[Math.floor(rng() * cols.length)] : '#5aa45d');
  }
  p.flush();
  return { canvas: c, ax: 15, ay: 13 };
}

function hedgeSprite(seed: number, scenario: ScenarioTheme = 'city'): PropSprite {
  const rng = mulberry32(seed);
  const [c, ctx] = makeCanvas(34, 16);
  shadowEllipse(ctx, 17, 14, 15, 2, 0.2);
  const p = new Painter(ctx, 34, 16);
  const snow = scenario === 'snow';
  const pal = snow
    ? { edge: '#9db6c8', hi: '#f2f8fd', mid: '#dbe8f3', lo: '#c3d6e6' }
    : { edge: '#264a36', hi: '#6aa956', mid: '#4b8a45', lo: '#356b3c' };
  for (let y = 3; y < 14; y++) {
    for (let x = 1; x < 33; x++) {
      const r = y === 3 ? 2 : y === 4 ? 1 : 0;
      if (x < 1 + r || x > 32 - r) continue;
      const edge = y === 3 || y === 13 || x === 1 + r || x === 32 - r;
      const light = -(y - 3) / 10 + (rng() - 0.5) * 0.6;
      p.set(x, y, edge ? pal.edge : light > 0 ? pal.hi : light > -0.4 ? pal.mid : pal.lo);
    }
  }
  p.flush();
  return { canvas: c, ax: 17, ay: 14 };
}

/** Palmeira de praia: tronco curvado, folhas em leque e dois cocos. */
function palmSprite(seed: number): PropSprite {
  const rng = mulberry32(seed);
  const [c, ctx] = makeCanvas(40, 60);
  shadowEllipse(ctx, 20, 57, 9, 3, 0.24);
  const p = new Painter(ctx, 40, 60);
  const lean = (rng() - 0.5) * 0.6;
  const topX = 20 + lean * 10;
  const topY = 16;
  // tronco com anéis
  for (let y = topY; y < 57; y++) {
    const t = (y - topY) / (57 - topY);
    const x = Math.round(topX + (20 - topX) * t);
    p.set(x - 1, y, '#8a6243');
    p.set(x, y, '#a87a4f');
    p.set(x + 1, y, '#6b4a32');
    if (y % 5 === 0) p.set(x, y, '#5b3c25');
  }
  // folhas: leques longos em volta do topo
  const frond = ['#2f7a52', '#3f9a63', '#5fbf7a', '#8fdb9a'];
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + (i / 8) * Math.PI;
    for (let d = 2; d < 18; d++) {
      const x = Math.round(topX + Math.cos(a) * d);
      const y = Math.round(topY + Math.sin(a) * d * 0.5 + d * d * 0.02);
      const k = d < 5 ? 3 : d < 9 ? 2 : d < 13 ? 1 : 0;
      p.set(x, y, frond[k]);
      if (d % 3 === 0) p.set(x, y + 1, frond[Math.max(0, k - 1)]);
      // folíolos pendentes nas pontas
      if (d > 11 && d % 2 === 0) p.set(x, y + 2, frond[0]);
    }
  }
  // cocos
  p.set(Math.round(topX) - 2, topY + 2, '#6b4a32');
  p.set(Math.round(topX) + 1, topY + 3, '#8a6243');
  p.flush();
  return { canvas: c, ax: 20, ay: 57 };
}

/** Boneco de neve: três bolas, cartola, cenoura e braços de graveto. */
function snowmanSprite(seed: number): PropSprite {
  const rng = mulberry32(seed);
  const [c, ctx] = makeCanvas(28, 40);
  shadowEllipse(ctx, 14, 37, 10, 3, 0.22);
  const p = new Painter(ctx, 28, 40);
  const hrect = (x: number, y: number, w: number, h: number, col: string) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) p.set(xx, yy, col);
  };
  const ball = (cx: number, cy: number, r: number) => {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y > r * r) continue;
        const edge = x * x + y * y > (r - 1) * (r - 1);
        const lit = (-x - y) / (r * 1.6);
        // Contorno azulado forte: sem ele o boneco some no branco da neve.
        p.set(cx + x, cy + y, edge ? '#8fa9c4' : lit > 0.55 ? '#ffffff' : lit > -0.1 ? '#f4faff' : '#dcebf6');
      }
    }
  };
  ball(14, 32, 6);
  ball(14, 23, 5);
  ball(14, 15, 4);
  // braços de graveto
  hrect(2, 21, 7, 1, '#6b4a32');
  hrect(19, 20, 7, 1, '#6b4a32');
  hrect(3, 19, 1, 3, '#6b4a32');
  hrect(24, 18, 1, 3, '#6b4a32');
  // cachecol vermelho entre a cabeça e o tronco
  hrect(8, 19, 13, 2, '#cf4a42');
  hrect(8, 19, 13, 1, '#e86a60');
  hrect(8, 21, 4, 4, '#cf4a42');
  hrect(8, 21, 1, 4, '#a8382f');
  // olhos, cenoura e botões
  p.set(12, 15, '#2a3140');
  p.set(16, 15, '#2a3140');
  p.set(14, 16, '#e0872f');
  p.set(14, 17, '#c96a2e');
  p.set(15, 16, '#c96a2e');
  for (const y of [23, 26, 29]) p.set(14, y, '#2a3140');
  // cartola assentada na cabeça
  hrect(8, 10, 13, 2, '#2a3140');
  hrect(10, 4, 9, 6, '#2a3140');
  hrect(10, 4, 9, 1, '#4a5468');
  hrect(11, 8, 7, 1, rng() < 0.5 ? '#c9453f' : '#3f4a5c');
  p.flush();
  return { canvas: c, ax: 14, ay: 37 };
}

function lampSprite(scenario: ScenarioTheme = 'city'): PropSprite {
  const [c, ctx] = makeCanvas(10, 36);
  shadowEllipse(ctx, 5, 34, 4, 1, 0.25);
  const orbital = scenario === 'orbital';
  ctx.fillStyle = scenario === 'cyberpunk' ? '#121526' : orbital ? '#2b3346' : '#2e3648';
  ctx.fillRect(4, 6, 2, 28);
  ctx.fillStyle = scenario === 'cyberpunk' ? '#39e6f0' : orbital ? '#7fe3ff' : '#4a5468';
  ctx.fillRect(4, 6, 1, 28);
  ctx.fillStyle = scenario === 'cyberpunk' ? '#1b1b36' : orbital ? '#33456b' : '#2e3648';
  ctx.fillRect(1, 2, 8, 5);
  const glowCol = scenario === 'cyberpunk' ? '#39e6f0' : scenario === 'retro' ? '#ff9a42' : orbital ? '#bfe9ff' : '#ffe9a8';
  const glowHi = scenario === 'cyberpunk' ? '#a6f8ff' : scenario === 'retro' ? '#ffe08a' : orbital ? '#eaf6ff' : '#fff6d6';
  ctx.fillStyle = glowCol;
  ctx.fillRect(2, 4, 6, 2);
  ctx.fillStyle = glowHi;
  ctx.fillRect(3, 4, 2, 1);
  ctx.fillStyle = '#3a4152';
  ctx.fillRect(3, 32, 4, 2);
  return { canvas: c, ax: 5, ay: 34 };
}

function benchSprite(scenario: ScenarioTheme = 'city'): PropSprite {
  const [c, ctx] = makeCanvas(26, 14);
  shadowEllipse(ctx, 13, 12, 11, 2, 0.22);
  const orbital = scenario === 'orbital';
  const legCol = scenario === 'forest' ? '#4a3222' : scenario === 'cyberpunk' ? '#121526' : orbital ? '#2b3346' : '#2e3648';
  ctx.fillStyle = legCol;
  ctx.fillRect(3, 8, 2, 4);
  ctx.fillRect(21, 8, 2, 4);
  // encosto e assento em ripas
  const woodMain = scenario === 'forest' ? '#5a381e' : orbital ? '#465571' : '#7a5232';
  const woodHi = scenario === 'forest' ? '#82532e' : orbital ? '#5d7699' : '#a0703f';
  const woodDk = scenario === 'forest' ? '#3d2514' : orbital ? '#2b3346' : '#5b3c25';
  ctx.fillStyle = woodMain;
  ctx.fillRect(1, 1, 24, 3);
  ctx.fillRect(1, 6, 24, 3);
  ctx.fillStyle = woodHi;
  ctx.fillRect(1, 1, 24, 1);
  ctx.fillRect(1, 6, 24, 1);
  ctx.fillStyle = woodDk;
  ctx.fillRect(1, 8, 24, 1);
  ctx.fillRect(1, 3, 24, 1);
  return { canvas: c, ax: 13, ay: 12 };
}

function rockSprite(seed: number): PropSprite {
  const rng = mulberry32(seed);
  const [c, ctx] = makeCanvas(16, 12);
  const p = new Painter(ctx, 16, 12);
  canopy(p, rng, 8, 7, 4, ['#7d8590', '#959da8', '#b3bac4', '#d3d8de'], '#4d5562');
  p.flush();
  return { canvas: c, ax: 8, ay: 11 };
}

/** Mesa de jardim com guarda-sol listrado (vista de cima, 3/4) e duas cadeirinhas. */
function parasolSprite(seed: number): PropSprite {
  const [c, ctx] = makeCanvas(32, 34);
  const palettes: [string, string, string][] = [
    ['#e8574a', '#f6efe2', '#a83a33'],
    ['#2fb3a3', '#f6efe2', '#1f8579'],
    ['#f2b33d', '#fbf4e4', '#c88a1f'],
  ];
  const [a, b, dk] = palettes[seed % palettes.length];
  // sombra do guarda-sol no chão
  shadowEllipse(ctx, 16, 29, 12, 3, 0.24);
  // cadeirinhas (laterais) e mesa
  ctx.fillStyle = '#5b3c25';
  ctx.fillRect(2, 24, 6, 5);
  ctx.fillRect(24, 24, 6, 5);
  ctx.fillStyle = '#a0703f';
  ctx.fillRect(2, 24, 6, 2);
  ctx.fillRect(24, 24, 6, 2);
  ctx.fillStyle = '#d8dde3';
  ctx.fillRect(10, 24, 12, 5);
  ctx.fillStyle = '#f4f6f8';
  ctx.fillRect(10, 24, 12, 2);
  ctx.fillStyle = '#8d96a3';
  ctx.fillRect(10, 28, 12, 1);
  // haste
  ctx.fillStyle = '#4a5468';
  ctx.fillRect(15, 11, 2, 14);
  // lona: octógono achatado com gomos alternados e borda escura
  const p = new Painter(ctx, 32, 34);
  const cx = 15.5;
  const cy = 8;
  for (let y = 0; y <= 15; y++) {
    for (let x = 0; x < 32; x++) {
      const dx = (x - cx) / 14.5;
      const dy = (y - cy) / 7.5;
      const d = Math.abs(dx) + Math.abs(dy) * 0.55 + Math.hypot(dx, dy) * 0.45;
      if (d > 1) continue;
      const ang = Math.atan2(y - cy, x - cx);
      const gomo = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 8) % 2;
      const edge = d > 0.86;
      const lit = y < cy - 1;
      p.set(x, y, edge ? dk : gomo ? (lit ? '#ffffff' : b) : lit ? a : dk);
    }
  }
  p.set(15, 8, '#2e3648');
  p.set(16, 8, '#2e3648');
  p.flush();
  return { canvas: c, ax: 16, ay: 29 };
}

/** Totem da entrada com a marca (azul-marinho e laranja, como a placa da recepção). */
function totemSprite(scenario: ScenarioTheme = 'city'): PropSprite {
  const [c, ctx] = makeCanvas(14, 34);
  shadowEllipse(ctx, 7, 32, 6, 1.5, 0.25);
  const orbital = scenario === 'orbital';
  const mainCol = scenario === 'forest' ? '#4a3222' : orbital ? '#1a2438' : '#141b30';
  const bodyCol = scenario === 'forest' ? '#6b4a32' : orbital ? '#232f4a' : '#1c2541';
  const trimCol = scenario === 'forest' ? '#8a6243' : orbital ? '#33456b' : '#2a355a';
  ctx.fillStyle = mainCol;
  ctx.fillRect(2, 2, 10, 30);
  ctx.fillStyle = bodyCol;
  ctx.fillRect(3, 3, 8, 28);
  ctx.fillStyle = trimCol;
  ctx.fillRect(3, 3, 1, 28);
  // faixa no topo, "H" claro e "b" entalhado
  ctx.fillStyle = scenario === 'forest' ? '#2f7a45' : orbital ? '#7fe3ff' : '#f2a33a';
  ctx.fillRect(3, 5, 8, 2);
  ctx.fillStyle = '#f5f1e6';
  ctx.fillRect(4, 11, 1, 6);
  ctx.fillRect(8, 11, 1, 6);
  ctx.fillRect(5, 13, 3, 1);
  ctx.fillStyle = scenario === 'forest' ? '#a4d97e' : orbital ? '#bfe9ff' : '#f2a33a';
  ctx.fillRect(5, 19, 1, 6);
  ctx.fillRect(6, 21, 2, 1);
  ctx.fillRect(8, 22, 1, 2);
  ctx.fillRect(6, 24, 2, 1);
  // base
  ctx.fillStyle = scenario === 'forest' ? '#3d2b1f' : orbital ? '#3a4658' : '#8d96a3';
  ctx.fillRect(1, 31, 12, 2);
  return { canvas: c, ax: 7, ay: 32 };
}

/** Torre de comunicação: mastro de treliça com farol vermelho e antenas. */
function towerSprite(): PropSprite {
  const [c, ctx] = makeCanvas(16, 46);
  shadowEllipse(ctx, 8, 44, 6, 2, 0.3);
  ctx.fillStyle = '#2b3346';
  ctx.fillRect(5, 3, 6, 41);
  ctx.fillStyle = '#465571';
  ctx.fillRect(6, 3, 4, 41);
  ctx.fillStyle = '#5d7699';
  ctx.fillRect(6, 3, 1, 41);
  // treliça
  ctx.fillStyle = '#25324a';
  for (let y = 8; y < 42; y += 4) {
    ctx.fillRect(5, y, 6, 1);
    ctx.fillRect(7, y + 1, 2, 1);
  }
  // base e topo
  ctx.fillStyle = '#3a4658';
  ctx.fillRect(3, 40, 10, 4);
  ctx.fillStyle = '#33456b';
  ctx.fillRect(4, 2, 8, 4);
  ctx.fillStyle = '#7fe3ff';
  ctx.fillRect(5, 3, 6, 1);
  // farol
  ctx.fillStyle = '#c9453f';
  ctx.fillRect(7, 0, 2, 2);
  ctx.fillStyle = '#ff8a6b';
  ctx.fillRect(7, 0, 1, 1);
  // antenas
  ctx.fillStyle = '#8fa7c4';
  ctx.fillRect(1, 12, 4, 1);
  ctx.fillRect(11, 16, 4, 1);
  ctx.fillStyle = '#bfe9ff';
  ctx.fillRect(1, 11, 1, 1);
  ctx.fillRect(14, 15, 1, 1);
  return { canvas: c, ax: 8, ay: 44 };
}

/** Antena parabólica sobre base metálica. */
function dishSprite(seed: number): PropSprite {
  const rng = mulberry32(seed);
  const [c, ctx] = makeCanvas(24, 28);
  shadowEllipse(ctx, 12, 26, 8, 2, 0.28);
  ctx.fillStyle = '#2b3346';
  ctx.fillRect(10, 15, 4, 11);
  ctx.fillStyle = '#465571';
  ctx.fillRect(11, 15, 2, 11);
  ctx.fillStyle = '#3a4658';
  ctx.fillRect(6, 24, 12, 2);
  // prato: elipse inclinada em tons de metal
  const p = new Painter(ctx, 24, 28);
  const cx = 12 + (rng() - 0.5) * 2;
  const cy = 9;
  for (let y = -8; y <= 8; y++) {
    for (let x = -9; x <= 9; x++) {
      const d = Math.hypot(x / 9, y / 7.5);
      if (d > 1) continue;
      const lit = y < -1 ? 3 : y < 2 ? 2 : y < 5 ? 1 : 0;
      p.set(Math.round(cx + x), Math.round(cy + y), ['#25324a', '#33456b', '#465571', '#6d87a8'][lit]);
    }
  }
  // haste central
  for (let y = 6; y < 15; y++) p.set(Math.round(cx), y, '#1c2333');
  p.set(Math.round(cx), 4, '#bfe9ff');
  p.flush();
  // brilho na borda superior
  ctx.fillStyle = '#8fb0c9';
  ctx.fillRect(10, 2, 4, 1);
  return { canvas: c, ax: 12, ay: 26 };
}

/** Caixa de carga metálica com faixa de atenção. */
function crateSprite(seed: number): PropSprite {
  const rng = mulberry32(seed);
  const [c, ctx] = makeCanvas(18, 16);
  shadowEllipse(ctx, 9, 14, 8, 2, 0.26);
  ctx.fillStyle = '#1c2333';
  ctx.fillRect(1, 3, 16, 11);
  ctx.fillStyle = '#3a4658';
  ctx.fillRect(2, 4, 14, 9);
  ctx.fillStyle = '#4d5b76';
  ctx.fillRect(2, 4, 14, 2);
  ctx.fillStyle = '#2b3346';
  ctx.fillRect(2, 11, 14, 2);
  // faixa de atenção
  ctx.fillStyle = '#e0a93e';
  for (let x = 3; x < 15; x += 4) ctx.fillRect(x, 7, 2, 2);
  ctx.fillStyle = '#8a6a24';
  for (let x = 5; x < 15; x += 4) ctx.fillRect(x, 7, 1, 2);
  // marca de carga
  ctx.fillStyle = rng() < 0.5 ? '#7fe3ff' : '#c9453f';
  ctx.fillRect(12, 5, 3, 1);
  return { canvas: c, ax: 9, ay: 14 };
}

/** Guarda-corpo de convés: dois postes e duas travessas. */
function railSprite(): PropSprite {
  const [c, ctx] = makeCanvas(34, 14);
  shadowEllipse(ctx, 17, 12, 15, 1.5, 0.2);
  ctx.fillStyle = '#2b3346';
  ctx.fillRect(2, 3, 2, 9);
  ctx.fillRect(30, 3, 2, 9);
  ctx.fillStyle = '#465571';
  ctx.fillRect(2, 3, 1, 9);
  ctx.fillRect(30, 3, 1, 9);
  ctx.fillStyle = '#5d7699';
  ctx.fillRect(1, 3, 32, 1);
  ctx.fillRect(1, 6, 32, 1);
  ctx.fillStyle = '#7fe3ff';
  ctx.fillRect(16, 3, 2, 1);
  return { canvas: c, ax: 17, ay: 12 };
}

export function propSprite(prop: ExteriorProp, scenario: ScenarioTheme = 'city'): PropSprite {
  const key = `${prop.kind === 'lamp' || prop.kind === 'bench' || prop.kind === 'totem' ? prop.kind : `${prop.kind}:${prop.seed % 7}`}:${scenario}`;
  let s = cache.get(key);
  if (s) return s;
  switch (prop.kind) {
    case 'tree':
      s = treeSprite(prop.seed % 7, scenario);
      break;
    case 'pine':
      s = pineSprite(prop.seed % 7, scenario);
      break;
    case 'bush':
      s = bushSprite(prop.seed % 7, scenario);
      break;
    case 'flowers':
      s = flowersSprite(prop.seed % 7);
      break;
    case 'hedge':
      s = hedgeSprite(prop.seed % 7, scenario);
      break;
    case 'lamp':
      s = lampSprite(scenario);
      break;
    case 'bench':
      s = benchSprite(scenario);
      break;
    case 'rock':
      s = rockSprite(prop.seed % 7);
      break;
    case 'parasol':
      s = parasolSprite(prop.seed % 7);
      break;
    case 'totem':
      s = totemSprite(scenario);
      break;
    case 'tower':
      s = towerSprite();
      break;
    case 'dish':
      s = dishSprite(prop.seed % 7);
      break;
    case 'crate':
      s = crateSprite(prop.seed % 7);
      break;
    case 'rail':
      s = railSprite();
      break;
    case 'palm':
      s = palmSprite(prop.seed % 7);
      break;
    case 'snowman':
      s = snowmanSprite(prop.seed % 7);
      break;
    default:
      // 'paving' e outros tipos desenhados pelo próprio renderer
      s = { canvas: makeCanvas(1, 1)[0], ax: 0, ay: 0 };
  }
  cache.set(key, s);
  return s;
}

const CAR_COLORS: [string, string, string][] = [
  ['#d9534a', '#a83a33', '#f08a80'],
  ['#3f7fd8', '#2c5ea6', '#7fb0f0'],
  ['#f2f2ee', '#c4c6c8', '#ffffff'],
  ['#f2b33d', '#c88a1f', '#ffd889'],
  ['#2fb3a3', '#1f8579', '#79dccf'],
  ['#4a5468', '#323a4a', '#76819a'],
];

/** Carro visto de lado (3/4), virado para a direita; `flip` desenha para a esquerda. */
export function carSprite(variant: number, flip: boolean, scenario: ScenarioTheme = 'city'): PropSprite {
  const key = `car:${variant % CAR_COLORS.length}:${flip ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [body, dark, light] = CAR_COLORS[variant % CAR_COLORS.length];
  const [c, ctx] = makeCanvas(36, 20);
  if (flip) {
    ctx.translate(36, 0);
    ctx.scale(-1, 1);
  }
  shadowEllipse(ctx, 18, 17, 16, 2, 0.3);
  const o = '#2e3648';
  // carroceria
  ctx.fillStyle = o;
  ctx.fillRect(2, 8, 32, 8);
  ctx.fillRect(8, 3, 18, 6);
  ctx.fillStyle = body;
  ctx.fillRect(3, 9, 30, 6);
  ctx.fillRect(9, 4, 16, 5);
  ctx.fillStyle = light;
  ctx.fillRect(3, 9, 30, 1);
  ctx.fillRect(9, 4, 16, 1);
  ctx.fillStyle = dark;
  ctx.fillRect(3, 13, 30, 2);
  // vidros
  ctx.fillStyle = '#3a5f86';
  ctx.fillRect(10, 5, 6, 3);
  ctx.fillRect(18, 5, 6, 3);
  ctx.fillStyle = '#9cc7ec';
  ctx.fillRect(10, 5, 2, 1);
  ctx.fillRect(18, 5, 2, 1);
  // farol e lanterna
  ctx.fillStyle = '#fff3c4';
  ctx.fillRect(32, 10, 2, 2);
  ctx.fillStyle = '#e04a3a';
  ctx.fillRect(2, 10, 1, 2);
  // rodas
  for (const wx of [7, 25]) {
    ctx.fillStyle = o;
    ctx.fillRect(wx, 13, 5, 5);
    ctx.fillStyle = '#6b7385';
    ctx.fillRect(wx + 1, 14, 3, 3);
    ctx.fillStyle = '#9aa3b5';
    ctx.fillRect(wx + 2, 15, 1, 1);
  }
  const s = { canvas: c, ax: 18, ay: 17 };
  cache.set(key, s);
  return s;
}

/** Sombra de contato sob os personagens. */
export function shadowSprite(): PropSprite {
  const hit = cache.get('shadow');
  if (hit) return hit;
  const [c, ctx] = makeCanvas(14, 6);
  shadowEllipse(ctx, 7, 3, 6, 2, 0.28);
  const s = { canvas: c, ax: 7, ay: 3 };
  cache.set('shadow', s);
  return s;
}

/** Brilho radial (desenhado com composição aditiva). */
export function glowSprite(color: string, size = 64): HTMLCanvasElement {
  const key = `glow:${color}:${size}`;
  const hit = cache.get(key);
  if (hit) return hit.canvas;
  const [c, ctx] = makeCanvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  const [r, gg, b] = hex(color);
  g.addColorStop(0, `rgba(${r},${gg},${b},0.9)`);
  g.addColorStop(0.4, `rgba(${r},${gg},${b},0.35)`);
  g.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  cache.set(key, { canvas: c, ax: size / 2, ay: size / 2 });
  return c;
}
