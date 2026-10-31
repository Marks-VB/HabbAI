// A visita empilhada no `Sim` de verdade: uma sala por andar, com o térreo embaixo. O layout de cada
// sala vem de layoutProjectRoom (slot fixo) e é deslocado para a faixa do andar em layout/floors.ts.
import { describe, expect, it } from 'vitest';
import { applyBuildingPatch, officeFromBuilding } from '../../../../shared/world/office-from-world';
import { sampleBuildingDetail } from '../../../../shared/world/visit-sample';
import type { Appearance, ArtModule, RoomTheme } from '../../art/api';
import { DEFAULT_WORLD_OPTIONS } from '../api';
import { BUILDING_H, CORRIDOR_Y } from '../constants';
import { FLOOR_H } from '../layout/floors';
import { inRect } from '../layout/geometry';
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
