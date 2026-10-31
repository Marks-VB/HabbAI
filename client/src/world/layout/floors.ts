// Prédio empilhado da visita (PLANO.md, "Andares"): uma sala por andar, com o corredor de cada andar
// e um poço de elevador ligando os corredores. Só o modo visita usa este módulo; o escritório local
// continua no corredor único de sempre (layout/building.ts).
//
// A pilha é montada com o TÉRREO EMBAIXO (o chão do prédio fica junto da rua) e os andares de projeto
// acima, como num corte de edifício. O térreo é o bloco de sempre (núcleo + corredor), com a primeira
// sala na fileira sul; os andares acima têm uma sala cada, do lado norte, e um patamar a oeste.
// Como a grade de caminhabilidade (path/grid.ts) não aceita coordenadas negativas, o bloco do térreo
// começa em `groundY` (a altura dos andares de cima) em vez de zero: todos os tiles ficam em y >= 0.
import { BUILDING_H, COL_W, CORRIDOR_H, CORRIDOR_Y, ROOM_H, TILE } from '../constants';
import { WalkGrid } from '../path/grid';
import { AreaBuilder } from './builder';
import { type BuildingLayout, coreAreas, paintArea } from './building';
import { CORE_WALLS } from './core';
import { layoutCorridor } from './corridor';
import type { AreaLayout, SpotDef, TileRect } from './types';

/** Altura de um andar de projeto: a sala (12) + o corredor da frente (5). */
export const FLOOR_H = ROOM_H + CORRIDOR_H;

/** Id do poço do elevador (área caminhável que liga os corredores). */
export const SHAFT_ID = 'core:elevador';
/** Prefixo dos patamares dos andares de cima (cada um com id próprio). */
export const LANDING_PREFIX = 'core:patamar@';

/** Desloca uma área inteira em `dy` tiles (e, opcionalmente, `dx`) sem mutar a original. */
export function offsetArea(area: AreaLayout, dy: number, dx = 0): AreaLayout {
  const fx = dx * TILE;
  const fy = dy * TILE;
  const out: AreaLayout = {
    ...area,
    rect: { ...area.rect, x: area.rect.x + dx, y: area.rect.y + dy },
    floors: area.floors.map((f) => ({ ...f, x: f.x + fx, y: f.y + fy })),
    rugs: area.rugs.map((r) => ({ ...r, x: r.x + fx, y: r.y + fy })),
    walls: area.walls.map((w) => {
      const moved = { ...w, x: w.x + fx, y: w.y + fy };
      if (w.kind === 'cap' || !w.doorways) return moved;
      return { ...moved, doorways: w.doorways.map((d) => ({ ...d, x: d.x + fx })) };
    }),
    wallItems: area.wallItems.map((w) => ({ ...w, cx: w.cx + fx, baseY: w.baseY + fy })),
    furniture: area.furniture.map((f) => ({ ...f, tx: f.tx + dx, ty: f.ty + dy })),
    spots: area.spots.map((s) => ({
      ...s,
      tx: s.tx + dx,
      ty: s.ty + dy,
      x: s.x + fx,
      y: s.y + fy,
      ...(s.sortY !== undefined ? { sortY: s.sortY + fy } : {}),
    })),
    walkable: area.walkable.map((r) => ({ ...r, x: r.x + dx, y: r.y + dy })),
  };
  if (area.blocked) out.blocked = area.blocked.map((r) => ({ ...r, x: r.x + dx, y: r.y + dy }));
  if (area.door) out.door = { ...area.door, x: area.door.x + dx, y: area.door.y + dy };
  if (area.shade) out.shade = { ...area.shade, x: area.shade.x + fx, y: area.shade.y + fy };
  return out;
}

/** Topo (tiles) de um andar de projeto: o andar `floors - 1` fica no telhado. */
export function floorTop(floor: number, floors: number): number {
  return Math.max(0, floors - 1 - floor) * FLOOR_H;
}

/** Topo (tiles) do bloco do térreo: logo abaixo do andar mais alto. */
export function groundTop(floors: number): number {
  return Math.max(0, floors - 1) * FLOOR_H;
}

/** Retângulo (tiles) da faixa de um andar: térreo = bloco inteiro, acima = sala + corredor. */
export function floorRect(floor: number, floors: number, cols: number): TileRect {
  if (floors <= 0) return { x: 0, y: 0, w: cols * COL_W, h: BUILDING_H };
  const f = Math.max(0, Math.min(floors - 1, Math.floor(floor)));
  if (f === 0) return { x: 0, y: groundTop(floors), w: cols * COL_W, h: BUILDING_H };
  return { x: 0, y: floorTop(f, floors), w: cols * COL_W, h: FLOOR_H };
}

/** Tira a decoração do corredor que cairia dentro do poço (a coluna leste). */
function clearShaftColumn(area: AreaLayout, x0: number): AreaLayout {
  return {
    ...area,
    furniture: area.furniture.filter((f) => f.tx < x0 || f.kind === 'glass_partition'),
    rugs: area.rugs.filter((r) => r.x < x0 * TILE),
    spots: area.spots.filter((s) => s.tx < x0),
  };
}

/** Poço do elevador em fatias por andar: cada uma desenha só a sua faixa (nada de uma tela gigante). */
function shaftAreas(x: number, groundY: number, floors: number): AreaLayout[] {
  const out = [shaftSegment(x, groundY, CORRIDOR_Y, 0, false)];
  for (let f = 1; f < floors; f++) out.push(shaftSegment(x, floorTop(f, floors), FLOOR_H, f, f === floors - 1));
  return out;
}

/** Uma fatia do poço: piso contínuo e a parede de vidro no lado leste (o topo é fechado na última). */
function shaftSegment(x: number, y: number, h: number, floor: number, top: boolean): AreaLayout {
  const b = new AreaBuilder(`${SHAFT_ID}@${floor}`, 'corridor', { x, y, w: COL_W, h });
  b.floor('concrete', 0, 0, COL_W, h, 601 + floor);
  b.walk(1, 0, COL_W - 2, h);
  if (top) b.cap(0, 0, COL_W, 0.5, CORE_WALLS.glass);
  b.cap(COL_W - 0.5, 0, 0.5, h, CORE_WALLS.glass);
  return b.build();
}

/** Patamar de um andar de projeto: pequeno hall a oeste, entre o corredor e a parede externa. */
function landingArea(top: number, floor: number): AreaLayout {
  const b = new AreaBuilder(`${LANDING_PREFIX}${floor}`, 'corridor', { x: 0, y: top, w: COL_W, h: ROOM_H });
  b.floor('marble', 0, 0, COL_W, ROOM_H, 700 + floor);
  b.face(0.5, COL_W - 1, CORE_WALLS.reception);
  b.cap(0, 0, 0.5, ROOM_H, CORE_WALLS.reception);
  b.walk(1, 2, COL_W - 2, ROOM_H - 2);
  b.wall('window', 8, undefined, { order: 0.4 });
  b.furn('plant_small', 2, 10, 'fern', { order: 0.5 });
  return b.build();
}

/**
 * O prédio da visita: `floors` andares (o térreo + os de projeto), `rooms` na ordem dos andares.
 * A sala do térreo deve ter sido gerada com `slot` ímpar (fileira sul, porta para o corredor) e as
 * dos andares de cima com `slot` par (fileira norte); aqui elas são deslocadas para a faixa certa.
 */
export function stackedBuilding(
  rooms: readonly AreaLayout[],
  floors: number,
  cols: number,
  version = 0,
): BuildingLayout {
  const n = Math.max(0, Math.floor(floors));
  const groundY = groundTop(n);
  const shaftX = (cols - 1) * COL_W;

  // ---- térreo: núcleo + corredor + a primeira sala (fileira sul) + poço no canto leste
  const core = coreAreas().map((a) => offsetArea(a, groundY));
  const groundCorridor = offsetArea(layoutCorridor(cols), groundY);
  const corridors: AreaLayout[] = [groundCorridor];
  const stackedRooms: AreaLayout[] = [];
  if (n > 0 && rooms[0]) stackedRooms.push(offsetArea(rooms[0], groundY));

  // ---- andares de projeto: sala no meio, patamar a oeste e o poço na coluna leste
  for (let f = 1; f < n; f++) {
    const top = floorTop(f, n);
    corridors.push(clearShaftColumn(offsetArea(layoutCorridor(cols, `core:corredor@${f}`), top), shaftX));
    const room = rooms[f];
    if (room) stackedRooms.push(offsetArea(room, top, -COL_W));
    corridors.push(landingArea(top, f));
  }

  const shafts = shaftAreas(shaftX, groundY, n);
  const all: AreaLayout[] = [...core, ...corridors, ...stackedRooms, ...shafts];
  const grid = new WalkGrid(cols * COL_W, groundY + BUILDING_H, version);
  const spots: SpotDef[] = [];
  for (const a of all) {
    paintArea(grid, a);
    spots.push(...a.spots);
  }
  return {
    cols,
    rect: { x: 0, y: 0, w: cols * COL_W, h: groundY + BUILDING_H },
    core,
    corridor: groundCorridor,
    corridors,
    shafts,
    rooms: stackedRooms,
    grid,
    spots,
    groundY,
    floorHeight: FLOOR_H,
    floorCount: n,
  };
}
