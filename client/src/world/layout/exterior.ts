// Área externa: grama, árvores, calçada e rua; pátio/jardim nos slots sem sala.
import type { FloorKind, WallStyle } from '../../art/api';
import type { ScenarioTheme } from '../api';
import { mulberry32 } from '../../../../shared/hash';
import { BUILDING_H, COL_W, CORE_COLS, CORRIDOR_Y, EXT_EAST, EXT_NORTH, EXT_SOUTH, EXT_WEST, SOUTH_Y, TILE } from '../constants';
import { cellRect, slotAt, slotColumn, slotSide } from './geometry';
import type { ExteriorProp, FloorPatch, TileRect, WallItemPlacement, WallSegment } from './types';

export const EXTERIOR_WALL: WallStyle = { base: '#cfc8bd', trim: '#8a8174', pattern: 'brick', exterior: true };

export interface ExteriorLayout {
  /** Limites da área desenhada (tiles). */
  bounds: TileRect;
  floors: FloorPatch[];
  props: ExteriorProp[];
  /** Faixas da rua (y em px) e sentido (+1 = leste, -1 = oeste). */
  lanes: { y: number; dir: 1 | -1 }[];
  /** Linha central da rua (px), para as faixas tracejadas. */
  streetY: number;
  streetH: number;
}

/** Fechamento do corredor e pátio de um slot sem sala. */
export interface SlotShell {
  slot: number;
  rect: TileRect;
  walls: WallSegment[];
  windows: WallItemPlacement[];
  floors: FloorPatch[];
  props: ExteriorProp[];
}

export function layoutExterior(cols: number, scenario: ScenarioTheme = 'city'): ExteriorLayout {
  const w = cols * COL_W;
  const bounds: TileRect = { x: -EXT_WEST, y: -EXT_NORTH, w: w + EXT_WEST + EXT_EAST, h: BUILDING_H + EXT_NORTH + EXT_SOUTH };
  const px = (t: number) => t * TILE;
  const floors: FloorPatch[] = [];
  const props: ExteriorProp[] = [];
  const rng = mulberry32(0xc0de + cols);

  const south = BUILDING_H;
  if (scenario === 'forest') {
    // Gramado verde floresta denso e vibrante
    floors.push({ kind: 'grass', x: px(bounds.x), y: px(bounds.y), w: px(bounds.w), h: px(bounds.h), seed: 101, tint: '#3e8043' });
    // Calçada que contorna o prédio
    floors.push({ kind: 'sidewalk', x: px(bounds.x), y: px(south + 2), w: px(bounds.w), h: px(2), seed: 102 });
    // A rua de asfalto é mantida (estrada florestal rústica)
    floors.push({ kind: 'street', x: px(bounds.x), y: px(south + 4), w: px(bounds.w), h: px(5), seed: 103 });
    floors.push({ kind: 'sidewalk', x: px(bounds.x), y: px(south + 9), w: px(bounds.w), h: px(2), seed: 104 });
    // Caminho da recepção até a calçada
    floors.push({ kind: 'sidewalk', x: px(-3), y: px(CORRIDOR_Y), w: px(3), h: px(5), seed: 105 });
    floors.push({ kind: 'sidewalk', x: px(-3), y: px(CORRIDOR_Y + 5), w: px(2), h: px(south + 2 - CORRIDOR_Y - 5), seed: 106 });
  } else if (scenario === 'cyberpunk') {
    floors.push({ kind: 'concrete', x: px(bounds.x), y: px(bounds.y), w: px(bounds.w), h: px(bounds.h), seed: 201 });
    floors.push({ kind: 'sidewalk', x: px(bounds.x), y: px(south + 2), w: px(bounds.w), h: px(2), seed: 202 });
    floors.push({ kind: 'street', x: px(bounds.x), y: px(south + 4), w: px(bounds.w), h: px(5), seed: 203 });
    floors.push({ kind: 'sidewalk', x: px(bounds.x), y: px(south + 9), w: px(bounds.w), h: px(2), seed: 204 });
    floors.push({ kind: 'sidewalk', x: px(-3), y: px(CORRIDOR_Y), w: px(3), h: px(5), seed: 205 });
    floors.push({ kind: 'sidewalk', x: px(-3), y: px(CORRIDOR_Y + 5), w: px(2), h: px(south + 2 - CORRIDOR_Y - 5), seed: 206 });
  } else if (scenario === 'orbital') {
    // Convés de metal: plataforma, passarelas claras e o trilho escuro do transporte.
    floors.push({ kind: 'deck', x: px(bounds.x), y: px(bounds.y), w: px(bounds.w), h: px(bounds.h), seed: 301, tint: '#4a5876' });
    floors.push({ kind: 'deck', x: px(bounds.x), y: px(south + 2), w: px(bounds.w), h: px(2), seed: 302, tint: '#5d6f8e' });
    floors.push({ kind: 'deck', x: px(bounds.x), y: px(south + 4), w: px(bounds.w), h: px(5), seed: 303, tint: '#232b3e' });
    floors.push({ kind: 'deck', x: px(bounds.x), y: px(south + 9), w: px(bounds.w), h: px(2), seed: 304, tint: '#5d6f8e' });
    floors.push({ kind: 'deck', x: px(-3), y: px(CORRIDOR_Y), w: px(3), h: px(5), seed: 305, tint: '#5d6f8e' });
    floors.push({ kind: 'deck', x: px(-3), y: px(CORRIDOR_Y + 5), w: px(2), h: px(south + 2 - CORRIDOR_Y - 5), seed: 306, tint: '#5d6f8e' });
  } else if (scenario === 'snow') {
    // Neve: campo branco, calçada pisada e a rua mantida (limpa), com o passeio também nevado.
    floors.push({ kind: 'snow', x: px(bounds.x), y: px(bounds.y), w: px(bounds.w), h: px(bounds.h), seed: 401, tint: '#eef4fa' });
    floors.push({ kind: 'snow', x: px(bounds.x), y: px(south + 2), w: px(bounds.w), h: px(2), seed: 402, tint: '#dde8f4' });
    floors.push({ kind: 'street', x: px(bounds.x), y: px(south + 4), w: px(bounds.w), h: px(5), seed: 403 });
    floors.push({ kind: 'snow', x: px(bounds.x), y: px(south + 9), w: px(bounds.w), h: px(2), seed: 404, tint: '#e7eff8' });
    floors.push({ kind: 'snow', x: px(-3), y: px(CORRIDOR_Y), w: px(3), h: px(5), seed: 405, tint: '#dde8f4' });
    floors.push({ kind: 'snow', x: px(-3), y: px(CORRIDOR_Y + 5), w: px(2), h: px(south + 2 - CORRIDOR_Y - 5), seed: 406, tint: '#dde8f4' });
  } else if (scenario === 'beach') {
    // Praia: areia no lugar da grama, deck de madeira no lugar da calçada e o mar no lugar da rua.
    floors.push({ kind: 'sand', x: px(bounds.x), y: px(bounds.y), w: px(bounds.w), h: px(bounds.h), seed: 501, tint: '#e8d3a4' });
    floors.push({ kind: 'wood', x: px(bounds.x), y: px(south + 2), w: px(bounds.w), h: px(2), seed: 502 });
    floors.push({ kind: 'water', x: px(bounds.x), y: px(south + 4), w: px(bounds.w), h: px(5), seed: 503, tint: '#2f8fb0' });
    floors.push({ kind: 'sand', x: px(bounds.x), y: px(south + 9), w: px(bounds.w), h: px(2), seed: 504, tint: '#efdcae' });
    floors.push({ kind: 'wood', x: px(-3), y: px(CORRIDOR_Y), w: px(3), h: px(5), seed: 505 });
    floors.push({ kind: 'wood', x: px(-3), y: px(CORRIDOR_Y + 5), w: px(2), h: px(south + 2 - CORRIDOR_Y - 5), seed: 506 });
  } else {
    floors.push({ kind: 'grass', x: px(bounds.x), y: px(bounds.y), w: px(bounds.w), h: px(bounds.h), seed: 11, tint: scenario === 'retro' ? '#949c4e' : undefined });
    floors.push({ kind: 'sidewalk', x: px(bounds.x), y: px(south + 2), w: px(bounds.w), h: px(2), seed: 12 });
    floors.push({ kind: 'street', x: px(bounds.x), y: px(south + 4), w: px(bounds.w), h: px(5), seed: 13 });
    floors.push({ kind: 'sidewalk', x: px(bounds.x), y: px(south + 9), w: px(bounds.w), h: px(2), seed: 14 });
    floors.push({ kind: 'sidewalk', x: px(-3), y: px(CORRIDOR_Y), w: px(3), h: px(5), seed: 15 });
    floors.push({ kind: 'sidewalk', x: px(-3), y: px(CORRIDOR_Y + 5), w: px(2), h: px(south + 2 - CORRIDOR_Y - 5), seed: 16 });
  }

  // Estação orbital: no lugar de árvores e arbustos entram torres, antenas e caixas de carga.
  const orbital = scenario === 'orbital';
  const snow = scenario === 'snow';
  const beach = scenario === 'beach';
  const plant = (rng: () => number, pineChance: number): ExteriorProp['kind'] =>
    orbital ? (rng() < 0.5 ? 'dish' : 'tower')
      : beach ? 'palm'
        : snow ? (rng() < 0.22 ? 'snowman' : 'pine')
          : rng() < pineChance ? 'pine' : 'tree';
  const shrub = (): ExteriorProp['kind'] => (orbital ? 'crate' : 'bush');
  const bed = (): ExteriorProp['kind'] => (orbital ? 'crate' : beach ? 'parasol' : snow ? 'bush' : 'flowers');
  const stone = (): ExteriorProp['kind'] => (orbital ? 'crate' : 'rock');
  const fenceKind = (i: number): ExteriorProp['kind'] => (orbital ? 'rail' : beach ? 'rail' : snow ? 'hedge' : i % 3 === 1 ? 'flowers' : 'hedge');

  // árvores ao norte (fileira com variação) e a oeste/leste
  const northStep = scenario === 'forest' ? 2 : orbital ? 8 : 4;
  for (let x = bounds.x + 1; x < bounds.x + bounds.w - 1; x += northStep + Math.floor(rng() * (scenario === 'forest' ? 2 : 3))) {
    const pineChance = scenario === 'forest' ? 0.65 : 0.25;
    props.push({ kind: plant(rng, pineChance), x: px(x) + Math.floor(rng() * 8), y: px(-3) - Math.floor(rng() * 20), seed: Math.floor(rng() * 1e9) });
    if (rng() < (scenario === 'forest' ? 0.85 : orbital ? 0.4 : 0.6)) props.push({ kind: shrub(), x: px(x + 2), y: px(-1) - 2, seed: Math.floor(rng() * 1e9) });
    if (scenario === 'forest' && rng() < 0.45) props.push({ kind: stone(), x: px(x + 1), y: px(-2) + 2, seed: Math.floor(rng() * 1e9) });
  }
  // bosque ao norte: fileiras irregulares cada vez mais esparsas
  const woodsConfig = scenario === 'forest'
    ? [[-5, 3], [-8, 4], [-11, 4], [-14, 5]] as const
    : orbital
      ? [[-11, 12]] as const
      : [[-6, 5], [-10, 6], [-14, 8]] as const;
  for (const [row, gap] of woodsConfig) {
    for (let x = bounds.x + 2; x < bounds.x + bounds.w - 1; x += gap + Math.floor(rng() * (scenario === 'forest' ? 2 : 4))) {
      const pineChance = scenario === 'forest' ? 0.7 : 0.3;
      props.push({ kind: plant(rng, pineChance), x: px(x) + Math.floor(rng() * 8), y: px(row) - Math.floor(rng() * 12), seed: Math.floor(rng() * 1e9) });
      if (scenario === 'forest' && rng() < 0.35) props.push({ kind: stone(), x: px(x + 2), y: px(row) + 4, seed: Math.floor(rng() * 1e9) });
    }
  }
  for (const side of [-1, 1]) {
    for (const band of orbital ? [0, 8] : [0, 7, 13]) {
      const baseX = side < 0 ? -6 - band : w + 4 + band;
      for (let y = 1; y < BUILDING_H; y += 3 + Math.floor(rng() * 3)) {
        if (side < 0 && band === 0 && y >= CORRIDOR_Y - 1 && y <= south + 1) continue;
        props.push({ kind: plant(rng, 0.3), x: px(baseX + Math.floor(rng() * 5)), y: px(y + 1), seed: Math.floor(rng() * 1e9) });
        if (band === 0 && rng() < 0.5) props.push({ kind: shrub(), x: px(side < 0 ? -2 : w + 1), y: px(y + 2), seed: Math.floor(rng() * 1e9) });
      }
    }
  }
  // cerca viva + flores ao longo da fachada sul e postes na calçada; diante de cada slot de
  // projeto, o trecho do caminho do jardim só tem cerca quando há sala ali
  for (let x = 0; x < w; x += 2) {
    const col = Math.floor(x / COL_W);
    const lx = x - col * COL_W;
    const gate = col >= CORE_COLS && (lx === 6 || lx === 8) ? slotAt(col, 'south') : undefined;
    props.push({ kind: fenceKind(x / 2), x: px(x) + TILE, y: px(south + 1) + 10, seed: x * 7 + 3, whenRoom: gate });
  }
  for (let x = bounds.x + 4; x < bounds.x + bounds.w; x += 10) {
    props.push({ kind: 'lamp', x: px(x), y: px(south + 3) + 6, seed: x });
  }
  const southRows = scenario === 'forest' ? [12, 15, 18, 21] : orbital ? [19] : [13, 17, 21];
  for (const row of southRows) {
    const sGap = scenario === 'forest' ? 3 : orbital ? 9 : 6;
    for (let x = bounds.x + 3; x < bounds.x + bounds.w - 2; x += sGap + Math.floor(rng() * (scenario === 'forest' ? 3 : 5))) {
      const pineChance = scenario === 'forest' ? 0.65 : 0.2;
      props.push({ kind: plant(rng, pineChance), x: px(x) + Math.floor(rng() * 10), y: px(south + row) + Math.floor(rng() * 10), seed: Math.floor(rng() * 1e9) });
      if (rng() < (scenario === 'forest' ? 0.6 : orbital ? 0.35 : 0.3)) props.push({ kind: shrub(), x: px(x + 3), y: px(south + row + 1), seed: Math.floor(rng() * 1e9) });
      if (scenario === 'forest' && rng() < 0.4) props.push({ kind: stone(), x: px(x + 1), y: px(south + row + 3), seed: Math.floor(rng() * 1e9) });
    }
  }
  props.push({ kind: 'bench', x: px(-4), y: px(CORRIDOR_Y + 3) + 6, seed: 1 });
  // totem com a marca na entrada principal (oeste)
  props.push({ kind: 'totem', x: px(-3) + 6, y: px(CORRIDOR_Y + 1), seed: 2 });
  // canteiros sob as janelas também viram caixas de carga no convés
  if (orbital) props.push({ kind: 'crate', x: px(-2) + 8, y: px(CORRIDOR_Y + 8), seed: 77 });
  // Praia: guarda-sóis e pedras na areia; Neve: bonecos de neve espalhados.
  if (beach) {
    props.push({ kind: 'parasol', x: px(4), y: px(south + 12), seed: 3 });
    props.push({ kind: 'parasol', x: px(w - 5), y: px(south + 12), seed: 4 });
    for (let x = bounds.x + 2; x < bounds.x + bounds.w - 1; x += 7) {
      props.push({ kind: 'rock', x: px(x) + 4, y: px(south + 10) + 4, seed: x });
    }
  }
  if (snow) {
    for (let x = bounds.x + 5; x < bounds.x + bounds.w - 2; x += 15) {
      props.push({ kind: 'snowman', x: px(x), y: px(south + 12) + 2, seed: x });
    }
  }

  const streetY = px(south + 4);
  const streetH = px(5);
  return {
    bounds,
    floors,
    props,
    lanes: [
      { y: streetY + Math.round(streetH * 0.36), dir: 1 },
      { y: streetY + Math.round(streetH * 0.86), dir: -1 },
    ],
    streetY,
    streetH,
  };
}

/** Parede externa + jardim de um slot vazio: deck de madeira com mesas e guarda-sóis, canteiros e caminho. */
export function slotShell(slot: number, lastColumn: boolean, scenario: ScenarioTheme = 'city'): SlotShell {
  const col = slotColumn(slot);
  const side = slotSide(slot);
  const rect = cellRect(col, side);
  const x0 = rect.x * TILE;
  const rng = mulberry32(0x9a7d + slot * 31);
  const walls: WallSegment[] = [];
  const windows: WallItemPlacement[] = [];
  const floors: FloorPatch[] = [];
  const props: ExteriorProp[] = [];
  const W = COL_W * TILE;
  const T = (n: number) => n * TILE;
  const seed = () => Math.floor(rng() * 1e9);
  // Estação orbital: o jardim vira pátio de carga (convés, caixas, torres e antenas).
  const orbital = scenario === 'orbital';
  const snow = scenario === 'snow';
  const beach = scenario === 'beach';
  const treeKind = (): ExteriorProp['kind'] =>
    orbital ? (rng() < 0.5 ? 'dish' : 'tower') : beach ? 'palm' : snow ? 'pine' : rng() < 0.5 ? 'pine' : 'tree';
  const bushKind = (): ExteriorProp['kind'] => (orbital ? 'crate' : 'bush');
  const flowerKind = (): ExteriorProp['kind'] => (orbital ? 'crate' : beach ? 'parasol' : snow ? 'bush' : 'flowers');
  const parasolKind = (): ExteriorProp['kind'] => (orbital ? 'dish' : 'parasol');
  const rockKind = (): ExteriorProp['kind'] => (orbital ? 'crate' : 'rock');
  const walk = (): FloorKind => (orbital ? 'deck' : beach ? 'wood' : snow ? 'snow' : 'sidewalk');
  const deckTint = (): string | undefined => (orbital ? '#4a5876' : snow ? '#dde8f4' : undefined);
  const deckInner = (): FloorKind => (orbital ? 'deck' : snow ? 'snow' : 'wood');
  const deckInnerTint = (): string | undefined => (orbital ? '#5d6f8e' : snow ? '#e7eff8' : undefined);
  const walkTint = (): string | undefined => (orbital ? '#5d6f8e' : snow ? '#dde8f4' : undefined);
  /** Árvore grande do canto do jardim (torre, palmeira ou pinheiro, conforme o cenário). */
  const bigTree = (): ExteriorProp['kind'] => (orbital ? 'tower' : beach ? 'palm' : snow ? 'pine' : 'tree');
  /** Deck de madeira com borda de pedra (tiles locais); no convés, placas de metal; na neve, piso nevado. */
  const deck = (lx: number, ly: number, w: number, h: number) => {
    floors.push({ kind: walk(), x: x0 + T(lx), y: T(rect.y + ly), w: T(w), h: T(h), seed: slot + 7, tint: deckTint() });
    floors.push({ kind: deckInner(), x: x0 + T(lx) + 4, y: T(rect.y + ly) + 4, w: T(w) - 8, h: T(h) - 8, seed: slot + 8, tint: deckInnerTint() });
  };

  if (side === 'north') {
    // fachada com janelas fechando o corredor (linhas 10–11)
    const fy = (CORRIDOR_Y - 2) * TILE;
    walls.push({ kind: 'face', x: x0, y: fy, w: W, style: EXTERIOR_WALL });
    [3, 8, 13].forEach((cx, i) =>
      windows.push({ id: `shell:${slot}:janela${i}`, kind: 'window', cx: x0 + cx * TILE, baseY: CORRIDOR_Y * TILE, on: 'face', order: 0 }),
    );
    if (lastColumn) walls.push({ kind: 'cap', x: x0 + W - TILE / 2, y: fy, w: TILE / 2, h: 2 * TILE, style: EXTERIOR_WALL });
    // caminho do gramado até o deck, deck no meio e canteiros sob as janelas
    floors.push({ kind: walk(), x: x0 + T(7), y: T(rect.y), w: T(2), h: T(3), seed: slot, tint: walkTint() });
    deck(3, 3, 10, 5);
    props.push({ kind: parasolKind(), x: x0 + T(5.5), y: T(rect.y + 6) + 4, seed: seed(), slot });
    props.push({ kind: parasolKind(), x: x0 + T(10.5), y: T(rect.y + 6) + 4, seed: seed(), slot });
    props.push({ kind: bushKind(), x: x0 + T(3.5), y: T(rect.y + 3) + 6, seed: seed(), slot });
    props.push({ kind: bushKind(), x: x0 + T(12.5), y: T(rect.y + 3) + 6, seed: seed(), slot });
    for (const cx of [3, 8, 13]) props.push({ kind: flowerKind(), x: x0 + T(cx), y: T(rect.y + 9) + 12, seed: slot * 3 + cx, slot });
    props.push({ kind: bigTree(), x: x0 + T(1) + 4, y: T(rect.y + 3), seed: seed(), slot });
    props.push({ kind: treeKind(), x: x0 + T(15) - 4, y: T(rect.y + 3) + 6, seed: seed(), slot });
    props.push({ kind: bushKind(), x: x0 + T(1) + 8, y: T(rect.y + 8), seed: seed(), slot });
    props.push({ kind: bushKind(), x: x0 + T(15) - 8, y: T(rect.y + 8), seed: seed(), slot });
  } else {
    // mureta externa fechando o corredor (linha 17) e jardim abaixo, ligado à calçada da rua
    walls.push({ kind: 'south', x: x0, y: SOUTH_Y * TILE, w: W, style: EXTERIOR_WALL });
    if (lastColumn) walls.push({ kind: 'cap', x: x0 + W - TILE / 2, y: SOUTH_Y * TILE, w: TILE / 2, h: TILE, style: EXTERIOR_WALL });
    floors.push({ kind: walk(), x: x0 + T(7), y: T(rect.y + 1), w: T(2), h: T(rect.h - 1), seed: slot, tint: walkTint() });
    // trecho entre a fachada e a calçada: só existe enquanto o slot está vazio (a cerca viva fecha)
    props.push({ kind: 'paving', x: x0 + T(7), y: T(BUILDING_H), seed: slot, slot });
    deck(3, 3.5, 10, 5);
    props.push({ kind: parasolKind(), x: x0 + T(5.5), y: T(rect.y + 6.5) + 4, seed: seed(), slot });
    props.push({ kind: parasolKind(), x: x0 + T(10.5), y: T(rect.y + 6.5) + 4, seed: seed(), slot });
    props.push({ kind: bushKind(), x: x0 + T(3.5), y: T(rect.y + 4) + 4, seed: seed(), slot });
    props.push({ kind: bushKind(), x: x0 + T(12.5), y: T(rect.y + 4) + 4, seed: seed(), slot });
    for (const cx of [3, 13]) props.push({ kind: flowerKind(), x: x0 + T(cx), y: T(rect.y + 2), seed: slot * 3 + cx, slot });
    props.push({ kind: 'bench', x: x0 + T(4), y: T(rect.y + 10) + 6, seed: slot, slot });
    props.push({ kind: 'bench', x: x0 + T(12), y: T(rect.y + 10) + 6, seed: slot + 1, slot });
    props.push({ kind: bigTree(), x: x0 + T(1) + 6, y: T(rect.y + 11), seed: seed(), slot });
    props.push({ kind: treeKind(), x: x0 + T(15) - 6, y: T(rect.y + 11) + 4, seed: seed(), slot });
    props.push({ kind: rockKind(), x: x0 + T(14), y: T(rect.y + 2) + 4, seed: slot + 3, slot });
  }
  return { slot, rect, walls, windows, floors, props };
}
