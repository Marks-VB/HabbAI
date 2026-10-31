// A visita empilhada no `Sim` de verdade: uma sala por andar, com o térreo embaixo. O layout de cada
// sala vem de layoutProjectRoom (slot fixo) e é deslocado para a faixa do andar em layout/floors.ts.
import { describe, expect, it } from 'vitest';
import { applyBuildingPatch, officeFromBuilding } from '../../../../shared/world/office-from-world';
import { sampleBuildingDetail } from '../../../../shared/world/visit-sample';
import type { AgentInfo, OfficeSnapshot, RoomInfo } from '../../../../shared/types';
import type { Appearance, ArtModule, RoomTheme } from '../../art/api';
import { DEFAULT_WORLD_OPTIONS } from '../api';
import { BUILDING_H, CORRIDOR_Y } from '../constants';
import { LOUNGE_ID } from '../layout/core';
import { FLOOR_H } from '../layout/floors';
import { inRect } from '../layout/geometry';
import { PathFinder } from '../path/astar';
import { Sim } from './sim';
import { visitorInfo } from './visitor';

const theme: RoomTheme = {
  carpet: '#4f6d8f',
  carpet2: '#486685',
  wall: { base: '#e6e2da', trim: '#9a8f80', pattern: 'plain' },
  accent: '#3f7fd8',
  deskVariant: 'wood',
  chairVariant: 'black',
};

const appearance: Appearance = {
  skin: '#f0c8a0',
  hair: '#3a2a20',
  hairStyle: 'short',
  eyes: '#222',
  top: '#3f7fd8',
  topAccent: '#fff',
  topStyle: 'tshirt',
  bottom: '#333',
  shoes: '#111',
  accessory: 'none',
  accessoryColor: '#000',
  lanyard: null,
  look: 'm',
};

const art = { appearanceFromSeed: () => appearance, roomTheme: () => theme } as unknown as ArtModule;
const T0 = 1_790_000_000_000;

function run(sim: Sim, clock: { now: number }, seconds: number, until?: () => boolean): void {
  const steps = Math.round(seconds * 30);
  for (let i = 0; i < steps; i++) {
    clock.now += 1000 / 30;
    sim.update(1 / 30, clock.now);
    if (until?.()) return;
  }
}

function visit() {
  const sim = new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm' }), null, { visit: true });
  const clock = { now: T0 };
  const snap = officeFromBuilding(sampleBuildingDetail(), clock.now, { version: 't' });
  sim.applySnapshot(snap, clock.now);
  run(sim, clock, 2);
  return { sim, clock, snap };
}

function localRoom(id: string, slot: number): RoomInfo {
  return { id, name: id.replace('/', ''), path: id, slot, seed: slot * 99 + 7, createdAt: T0 };
}

function localAgent(id: string, roomId: string): AgentInfo {
  return {
    id,
    kind: 'main',
    roomId,
    name: id,
    look: 'f',
    role: 'Agente principal',
    sessionId: `s-${id}`,
    account: '.claude',
    status: 'working',
    recent: [],
    tasks: [],
    startedAt: T0,
    lastEventAt: T0,
    statusSince: T0,
    stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 },
    seed: id.length * 1234567,
  };
}

function localSnapshot(rooms: RoomInfo[]): OfficeSnapshot {
  return {
    rev: 1,
    serverTime: T0,
    rooms,
    agents: rooms.map((r) => localAgent(`ag${r.slot}`, r.id)),
    accounts: [{ id: '.claude', short: 'C', name: 'Conta C', color: '#f08a3c', configDir: '~/.claude', sessions: 1, usageStatus: 'ok' }],
    meta: { demo: true, sources: [], startedAt: T0, version: 't' },
  };
}

/** Escritório local com a opção "Andares" ligada (nada de visita: a simulação é a de sempre). */
function localFloors() {
  const sim = new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm' }), null, { floors: true });
  const clock = { now: T0 };
  const snap = localSnapshot([localRoom('/a', 0), localRoom('/b', 1), localRoom('/c', 2)]);
  sim.applySnapshot(snap, clock.now);
  run(sim, clock, 2);
  return { sim, clock, snap };
}

describe('andares do escritório local no Sim (opção "Andares")', () => {
  it('é o prédio empilhado da visita com a simulação de sempre: térreo com o núcleo e uma sala por andar', () => {
    const { sim } = localFloors();
    expect(sim.visit).toBe(false);
    expect(sim.floors).toBe(true);
    expect(sim.stacked).toBe(true);
    expect(sim.floorCount()).toBe(3);
    expect(sim.building.floorCount).toBe(3);
    expect(sim.floorOf('/a')).toBe(0);
    expect(sim.floorOf('/b')).toBe(1);
    expect(sim.floorOf('/c')).toBe(2);
    expect(sim.floorOf('/nao-existe')).toBe(-1);
    // a sala do andar 2 fica a 2 * FLOOR_H acima do térreo
    const ground = sim.building.groundY!;
    const top = sim.rooms.get('/c')!.layout.rect;
    expect(ground - top.y).toBe(2 * FLOOR_H);
    expect(top.y).toBe(sim.floorRect(2).y);
    // o térreo mantém o núcleo inteiro (recepção, banheiro, copa e lounge)
    expect(sim.building.core).toHaveLength(4);
    expect(sim.building.core.find((a) => a.id === LOUNGE_ID)!.rect.y).toBe(ground + 17);
    // os agentes continuam de verdade: um por sala, sentado na própria mesa
    expect(sim.chars.size).toBe(3);
    for (const id of ['/a', '/b', '/c']) expect(sim.chars.get(`ag${sim.rooms.get(id)!.slot}`)!.roomId).toBe(id);
    const topAgent = sim.chars.get('ag2')!;
    expect(sim.floorAtY(topAgent.ty)).toBe(2);
    expect(inRect(sim.floorRect(2), topAgent.tx, topAgent.ty)).toBe(true);
  });

  it('um andar novo empurra o térreo para baixo e ninguém fica preso entre dois andares', () => {
    const { sim, clock, snap } = localFloors();
    // um agente sem sala espera na recepção (o térreo, que desce quando o prédio cresce)
    const lobby = localAgent('sem-sala', 'nao-existe');
    sim.applySnapshot({ ...snap, agents: [...snap.agents, lobby] }, clock.now);
    run(sim, clock, 1);
    const ch = sim.chars.get('sem-sala')!;
    const before = { tx: ch.tx, ty: ch.ty };
    expect(sim.floorAtY(before.ty)).toBe(0);
    expect(sim.building.grid.walkable(before.tx, before.ty)).toBe(true);
    // chega uma sala nova: o prédio inteiro desce FLOOR_H e o agente vai junto
    sim.applySnapshot(
      {
        ...snap,
        rev: 2,
        rooms: [...snap.rooms, localRoom('/d', 3)],
        agents: [...snap.agents, localAgent('ag3', '/d'), lobby],
      },
      clock.now,
    );
    run(sim, clock, 0.2);
    expect(sim.floorCount()).toBe(4);
    expect(sim.floorAtY(ch.ty)).toBe(0);
    expect(sim.building.grid.walkable(ch.tx, ch.ty)).toBe(true);
    // (o agente pode dar um passo na recepção; o andar é o mesmo e ele continua no térreo deslocado)
    expect(ch.ty).toBeGreaterThanOrEqual(before.ty + FLOOR_H);
    // todo mundo continua no chão de um andar válido e caminhável
    for (const c of sim.chars.values()) {
      expect(sim.floorAtY(c.ty)).toBeGreaterThanOrEqual(0);
      expect(sim.building.grid.walkable(c.tx, c.ty), `${c.id} em ${c.tx},${c.ty}`).toBe(true);
    }
  });

  it('A* entre andares: da sala do andar 2 ao lounge do térreo, pelo poço e sem atalho por parede', () => {
    const { sim } = localFloors();
    const room = [...sim.rooms.values()].find((r) => r.id === '/c')!;
    // um lugar (cadeira/mesa) da sala do andar 2 -> um lugar do lounge no térreo
    const from = room.layout.spots.find((s) => s.kind === 'desk') ?? room.layout.spots[0];
    const lounge = sim.building.core.find((a) => a.id === LOUNGE_ID)!.spots[0];
    const finder = new PathFinder(sim.building.grid);
    const path: number[] = [];
    expect(finder.find(from.tx, from.ty, lounge.tx, lounge.ty, path)).toBe(true);
    expect(path.length).toBeGreaterThan(0);
    // cada passo é caminhável e vizinho de 4 direções (nada de atravessar parede)
    let px = from.tx;
    let py = from.ty;
    for (let i = 0; i < path.length; i += 2) {
      const x = path[i];
      const y = path[i + 1];
      expect(sim.building.grid.walkable(x, y), `passo ${x},${y}`).toBe(true);
      expect(Math.abs(x - px) + Math.abs(y - py)).toBe(1);
      px = x;
      py = y;
    }
    expect([px, py]).toEqual([lounge.tx, lounge.ty]);
    // o caminho desce pelo poço (a coluna leste do térreo), e não por dentro da recepção/copa
    const shaftX = (sim.building.cols - 1) * 16;
    const inShaft = (i: number) => path[i] >= shaftX + 1 && path[i] < shaftX + 16 - 1;
    const ground = sim.building.groundY!;
    const throughShaft = Array.from({ length: path.length / 2 }, (_, k) => k).some(
      (k) => inShaft(k * 2) && path[k * 2 + 1] >= ground && path[k * 2 + 1] < ground + CORRIDOR_Y,
    );
    expect(throughShaft).toBe(true);
  });

  it('com a opção desligada, o escritório continua o corredor único de sempre', () => {
    const sim = new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS }), null);
    const clock = { now: T0 };
    sim.applySnapshot(localSnapshot([localRoom('/a', 0), localRoom('/b', 1)]), clock.now);
    run(sim, clock, 1);
    expect(sim.floors).toBe(false);
    expect(sim.stacked).toBe(false);
    expect(sim.floorCount()).toBe(1);
    expect(sim.floorOf('/b')).toBe(0);
    expect(sim.building.shafts).toBeUndefined();
    expect(sim.building.groundY).toBeUndefined();
    expect(sim.floorRect()).toEqual({ x: 0, y: 0, w: 3 * 16, h: BUILDING_H });
    // as salas continuam lado a lado no corredor (uma ao norte, outra ao sul da mesma coluna)
    expect(sim.building.cols).toBe(3);
    const a = sim.rooms.get('/a')!.layout.rect;
    const b = sim.rooms.get('/b')!.layout.rect;
    expect(a.x).toBe(b.x);
    expect(Math.abs(a.y - b.y)).toBe(17);
  });
});

describe('andares da visita no Sim', () => {
  it('um andar por sala, com o térreo embaixo e o telhado no topo', () => {
    const { sim } = visit();
    expect(sim.visit).toBe(true);
    expect(sim.floorCount()).toBe(3);
    expect(sim.building.floorCount).toBe(3);
    expect(sim.building.groundY).toBe(2 * FLOOR_H);
    expect(sim.building.rect.h).toBe(2 * FLOOR_H + BUILDING_H);
    expect(sim.floorOf('f_0a1b2c3d4e')).toBe(0);
    expect(sim.floorOf('f_1b2c3d4e5f')).toBe(1);
    expect(sim.floorOf('f_2c3d4e5f60')).toBe(2);
    expect(sim.floorOf('nao-existe')).toBe(-1);

    // o térreo guarda a primeira sala na fileira sul, dentro do bloco do térreo
    const ground = sim.rooms.get('f_0a1b2c3d4e')!;
    expect(ground.layout.rect.y).toBe(sim.building.groundY! + 17);
    expect(ground.layout.side).toBe('south');
    // a sala do andar 2 fica a 2 andares acima do topo do térreo (o telhado)
    const top = sim.rooms.get('f_2c3d4e5f60')!;
    expect(top.layout.rect.y).toBe(sim.floorRect(2).y);
    expect(sim.building.groundY! - top.layout.rect.y).toBe(2 * FLOOR_H);
    expect(sim.floorRect(2).h).toBe(FLOOR_H);
    // cada sala mora na faixa do andar dela
    for (const [id, floor] of [
      ['f_0a1b2c3d4e', 0],
      ['f_1b2c3d4e5f', 1],
      ['f_2c3d4e5f60', 2],
    ] as const) {
      const room = sim.rooms.get(id)!;
      expect(inRect(sim.floorRect(floor), room.layout.rect.x, room.layout.rect.y)).toBe(true);
      expect(sim.floorAtY(room.layout.rect.y)).toBe(floor);
    }
    // o corredor do térreo fica entre as fileiras do núcleo
    expect(sim.building.corridor.rect.y).toBe(sim.building.groundY! + CORRIDOR_Y);
  });

  it('floorAtY devolve o andar da faixa e o andar atual valida o intervalo', () => {
    const { sim } = visit();
    const ground = sim.building.groundY!;
    expect(sim.floorAtY(ground)).toBe(0);
    expect(sim.floorAtY(ground + 20)).toBe(0);
    expect(sim.floorAtY(ground - 1)).toBe(1);
    expect(sim.floorAtY(FLOOR_H)).toBe(1);
    expect(sim.floorAtY(FLOOR_H - 1)).toBe(2);
    expect(sim.floorAtY(0)).toBe(2);
    expect(sim.currentFloor).toBe(0);
    sim.currentFloor = 99;
    expect(sim.currentFloor).toBe(2);
    sim.currentFloor = -3;
    expect(sim.currentFloor).toBe(0);
    expect(sim.goToFloor(1)).toBe(1);
    expect(sim.currentFloor).toBe(1);
    expect(sim.goToFloor(42)).toBe(2);
    expect(sim.currentFloor).toBe(2);
  });

  it('o visitante troca de andar na hora e o poço leva a qualquer porta', () => {
    const { sim, clock } = visit();
    const me = sim.setVisitor(visitorInfo({ name: 'Pixel Dev', look: 'f', parts: {} }, clock.now), clock.now)!;
    run(sim, clock, 10, () => !sim.visitorBusy);
    expect(sim.floorAtY(me.ty)).toBe(0);
    // troca pelo trilho: o visitante vai para o corredor do andar do topo
    sim.goToFloor(2);
    expect(sim.currentFloor).toBe(2);
    expect(sim.floorAtY(me.ty)).toBe(2);
    expect(sim.building.grid.walkable(me.tx, me.ty)).toBe(true);
    // e o clique leva até a porta da sala do andar 2, pelo poço
    const room = sim.rooms.get('f_2c3d4e5f60')!;
    const door = room.layout.door!;
    expect(sim.visitorWalkTo(door.x, door.y)).toBe(true);
    run(sim, clock, 60, () => !me.step && !me.queue.length);
    expect([me.tx, me.ty]).toEqual([door.x, door.y]);
    expect(sim.floorAtY(me.ty)).toBe(2);
    // no térreo, o visitante volta para o corredor de baixo
    sim.goToFloor(0);
    expect(sim.floorAtY(me.ty)).toBe(0);
    expect(sim.building.grid.walkable(me.tx, me.ty)).toBe(true);
  });

  it('a sala que sai não deixa a câmera presa: o andar atual encosta no válido mais próximo', () => {
    const { sim, clock, snap } = visit();
    sim.goToFloor(2);
    // o patch seguinte não traz o andar do topo (nem os agentes dele)
    const floors = sampleBuildingDetail().floors.filter((f) => f.id !== 'f_2c3d4e5f60');
    const { snapshot } = applyBuildingPatch(snap, { rev: 13, floors }, clock.now);
    sim.applySnapshot(snapshot, clock.now);
    run(sim, clock, 180, () => sim.floorCount() === 2);
    expect(sim.floorCount()).toBe(2);
    expect(sim.currentFloor).toBe(1);
    expect(sim.floorRect(1).y).toBe(0);
  });
});
