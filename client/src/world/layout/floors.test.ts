// O prédio empilhado da visita: deslocamento de áreas, empilhamento por andar, poço do elevador e
// o térreo com o núcleo. Tudo puro (sem DOM e sem a simulação).
import { describe, expect, it } from 'vitest';
import type { RoomTheme } from '../../art/api';
import { BUILDING_H, COL_W, CORRIDOR_Y, TILE } from '../constants';
import { RECEPTION_ID, RESTROOM_ID } from './core';
import { FLOOR_H, floorRect, floorTop, groundTop, offsetArea, stackedBuilding } from './floors';
import { layoutProjectRoom } from './room';
import type { AreaLayout } from './types';

const theme: RoomTheme = {
  carpet: '#4f6d8f',
  carpet2: '#486685',
  wall: { base: '#e6e2da', trim: '#9a8f80', pattern: 'plain' },
  accent: '#3f7fd8',
  deskVariant: 'wood',
  chairVariant: 'black',
};

/** Salas na ordem dos andares: o térreo usa slot ímpar (sul), os de cima slot par (norte). */
function rooms(count: number): AreaLayout[] {
  return Array.from({ length: count }, (_, i) =>
    layoutProjectRoom({ id: `/proj/${i}`, slot: i === 0 ? 1 : 0, seed: 1000 + i * 77 }, theme),
  );
}

/** Um ponto de cada tipo de geometria, em px, para conferir o deslocamento. */
function geometry(area: AreaLayout): Record<string, number[]> {
  const points: Record<string, number[]> = {
    rect: [area.rect.x, area.rect.y, area.rect.w, area.rect.h],
    floor: [area.floors[0].x, area.floors[0].y],
    rug: [area.rugs[0].x, area.rugs[0].y],
    wall: [area.walls[0].x, area.walls[0].y],
    wallItem: [area.wallItems[0].cx, area.wallItems[0].baseY],
    furniture: [area.furniture[0].tx, area.furniture[0].ty],
    spot: [area.spots[0].tx, area.spots[0].ty, area.spots[0].x, area.spots[0].y],
    walkable: [area.walkable[0].x, area.walkable[0].y, area.walkable[0].w, area.walkable[0].h],
  };
  if (area.door) points.door = [area.door.x, area.door.y, area.door.w, area.door.h];
  if (area.shade) points.shade = [area.shade.x, area.shade.y];
  return points;
}

describe('offsetArea', () => {
  it('desloca toda a geometria em dy tiles (px quando o dado é px) sem mutar a original', () => {
    const room = layoutProjectRoom({ id: '/proj/x', slot: 0, seed: 42 }, theme);
    const before = structuredClone(room);
    const moved = offsetArea(room, 7);
    expect(room).toEqual(before);
    const a = geometry(room);
    const b = geometry(moved);
    expect(moved.rect.y).toBe(room.rect.y + 7);
    expect(b.rect).toEqual([a.rect[0], a.rect[1] + 7, a.rect[2], a.rect[3]]);
    expect(b.floor).toEqual([a.floor[0], a.floor[1] + 7 * TILE]);
    expect(b.rug).toEqual([a.rug[0], a.rug[1] + 7 * TILE]);
    expect(b.wall).toEqual([a.wall[0], a.wall[1] + 7 * TILE]);
    expect(b.wallItem).toEqual([a.wallItem[0], a.wallItem[1] + 7 * TILE]);
    expect(b.furniture).toEqual([a.furniture[0], a.furniture[1] + 7]);
    expect(b.spot).toEqual([a.spot[0], a.spot[1] + 7, a.spot[2], a.spot[3] + 7 * TILE]);
    expect(b.walkable).toEqual([a.walkable[0], a.walkable[1] + 7, a.walkable[2], a.walkable[3]]);
    expect(b.door).toEqual([a.door[0], a.door[1] + 7, a.door[2], a.door[3]]);
    expect(b.shade).toEqual([a.shade[0], a.shade[1] + 7 * TILE]);
    // os ids continuam os mesmos: quem já reservou um lugar não perde o lugar na mudança de andar
    expect(moved.spots.map((s) => s.id)).toEqual(room.spots.map((s) => s.id));
  });

  it('também desloca em x (a sala dos andares de cima vai para a coluna do meio)', () => {
    const room = layoutProjectRoom({ id: '/proj/x', slot: 0, seed: 42 }, theme);
    const moved = offsetArea(room, 0, -COL_W);
    expect(moved.rect.x).toBe(room.rect.x - COL_W);
    expect(moved.floors[0].x).toBe(room.floors[0].x - COL_W * TILE);
    expect(moved.wallItems[0].cx).toBe(room.wallItems[0].cx - COL_W * TILE);
    expect(moved.furniture[0].tx).toBe(room.furniture[0].tx - COL_W);
    expect(moved.spots[0].tx).toBe(room.spots[0].tx - COL_W);
    expect(moved.door?.x).toBe((room.door?.x ?? 0) - COL_W);
  });
});

describe('stackedBuilding', () => {
  const list = rooms(3);
  const b = stackedBuilding(list, 3, 3);

  it('empilha uma sala por andar, com o térreo embaixo e o telhado no topo', () => {
    expect(FLOOR_H).toBe(17);
    expect(groundTop(3)).toBe(2 * FLOOR_H);
    expect(floorTop(2, 3)).toBe(0);
    expect(b.floorCount).toBe(3);
    expect(b.groundY).toBe(2 * FLOOR_H);
    expect(b.rect).toEqual({ x: 0, y: 0, w: 3 * COL_W, h: 2 * FLOOR_H + BUILDING_H });
    // térreo: a sala na fileira sul, dentro do bloco do térreo
    const ground = b.rooms[0];
    expect(ground.rect.y).toBe(b.groundY! + 17);
    expect(ground.side).toBe('south');
    expect(ground.rect.y + ground.rect.h).toBe(b.rect.h);
    // andar 1: logo acima do térreo; andar 2 no telhado
    expect(b.rooms[1].rect.y).toBe(floorTop(1, 3));
    expect(b.rooms[1].rect.y + b.rooms[1].rect.h).toBe(b.groundY! - 5);
    expect(b.rooms[2].rect.y).toBe(floorTop(2, 3));
    expect(b.rooms[2].rect.y).toBe(b.groundY! - 2 * FLOOR_H);
    // o térreo fica na coluna leste do núcleo; as salas de cima, na coluna do meio
    expect(b.rooms[0].rect.x).toBe(2 * COL_W);
    for (const room of b.rooms.slice(1)) {
      expect(room.rect.x).toBe(COL_W);
      expect(room.side).toBe('north');
    }
  });

  it('o térreo mantém o núcleo (recepção/banheiro/copa/lounge) e a primeira sala', () => {
    expect(b.core).toHaveLength(4);
    expect(b.core.find((a) => a.id === RECEPTION_ID)!.rect.y).toBe(b.groundY);
    expect(b.core.find((a) => a.id === RESTROOM_ID)!.rect.y).toBe(b.groundY! + 17);
    expect(b.rooms).toHaveLength(3);
    expect(b.rooms[0].id).toBe('/proj/0');
    // o corredor do térreo fica entre as duas fileiras do núcleo
    expect(b.corridor.rect.y).toBe(b.groundY! + CORRIDOR_Y);
    expect(b.corridors).toHaveLength(1 + 2 * 2); // corredor do térreo + (2 andares × corredor + patamar)
  });

  it('o poço liga os corredores e cada porta alcança o elevador da recepção', () => {
    const elevator = b.core.find((a) => a.id === RECEPTION_ID)!.spots.find((s) => s.kind === 'elevator')!;
    const reach = b.grid.reachableFrom(elevator.tx, elevator.ty);
    const ok = (x: number, y: number) => reach[y * b.grid.w + x] === 1;
    for (let f = 0; f < 3; f++) {
      const band = floorRect(f, 3, 3);
      const corridor = b.corridors![f === 0 ? 0 : (f - 1) * 2 + 1];
      expect(corridor.rect.y).toBe(band.y + 12);
      // um tile no meio do corredor do andar f, perto do poço
      const cx = 40;
      const cy = band.y + 14;
      expect(b.grid.walkable(cx, cy), `corredor do andar ${f}`).toBe(true);
      expect(ok(cx, cy), `corredor do andar ${f} alcançável`).toBe(true);
    }
    // o poço é caminhável do telhado ao corredor do térreo
    for (let y = 0; y < b.groundY! + CORRIDOR_Y; y += 5) expect(b.grid.walkable(40, y), `poço em y=${y}`).toBe(true);
    // a porta de cada sala, o interior e todos os spots são alcançáveis
    for (const room of b.rooms) {
      const door = room.door!;
      for (let x = door.x; x < door.x + door.w; x++)
        for (let y = door.y; y < door.y + door.h; y++)
          expect(b.grid.walkable(x, y), `${room.id} porta ${x},${y}`).toBe(true);
      for (const s of room.spots) expect(ok(s.tx, s.ty), `${s.id} inalcançável`).toBe(true);
    }
    expect(b.spots.map((s) => s.id)).toHaveLength(new Set(b.spots.map((s) => s.id)).size);
  });

  it('o corredor dos andares de cima não tem decoração dentro do poço (a coluna leste)', () => {
    const shaftX = 2 * COL_W;
    for (let f = 1; f < 3; f++) {
      const corridor = b.corridors![(f - 1) * 2 + 1];
      expect(corridor.furniture.filter((p) => p.tx >= shaftX && p.kind !== 'glass_partition')).toEqual([]);
      expect(corridor.spots.filter((s) => s.tx >= shaftX)).toEqual([]);
      expect(corridor.rugs.filter((r) => r.x >= shaftX * TILE)).toEqual([]);
    }
  });

  it('floorRect devolve a faixa do térreo (bloco inteiro) e a de cima (sala + corredor)', () => {
    expect(floorRect(0, 3, 3)).toEqual({ x: 0, y: 2 * FLOOR_H, w: 3 * COL_W, h: BUILDING_H });
    expect(floorRect(1, 3, 3)).toEqual({ x: 0, y: FLOOR_H, w: 3 * COL_W, h: FLOOR_H });
    expect(floorRect(2, 3, 3)).toEqual({ x: 0, y: 0, w: 3 * COL_W, h: FLOOR_H });
    // fora do intervalo, encosta no andar válido mais próximo
    expect(floorRect(9, 3, 3).y).toBe(0);
    expect(floorRect(-4, 3, 3).y).toBe(2 * FLOOR_H);
    // sem salas: só o térreo, sem andares para empilhar
    expect(floorRect(0, 0, 3)).toEqual({ x: 0, y: 0, w: 3 * COL_W, h: BUILDING_H });
  });
});
