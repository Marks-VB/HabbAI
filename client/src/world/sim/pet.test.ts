// Simulação do mascote sem DOM e sem timers reais: limites do corredor, estados (sentado, andando,
// dormindo e reagindo ao clique), animação por quadro e determinismo com RNG injetado.
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../../../shared/hash';
import { TILE } from '../../art/api';
import { OfficePet } from './pet';

/** RNG de uma sequência fixa (o último valor se repete). */
function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

const alwaysWalkable = (): boolean => true;
const noDestination = (): null => null;

/** Anda em passos de 16 ms até chegar (ou até o limite de passos). */
function walkTo(pet: OfficePet, maxSteps = 2000): void {
  for (let i = 0; i < maxSteps && pet.pose === 'walk'; i++) pet.tick(16, alwaysWalkable, noDestination);
}

describe('mascote: estado e clique', () => {
  it('nasce sentado e o init só vale uma vez', () => {
    const pet = new OfficePet(seq(0.5));
    expect(pet).toMatchObject({ x: 0, y: 0, targetX: 0, targetY: 0, dir: 'down', pose: 'sit', frame: 0, stateTimer: 5000, purrTimer: 0 });
    pet.init(80, 96);
    expect(pet).toMatchObject({ x: 80, y: 96, targetX: 80, targetY: 96 });
    // Um segundo init (o snapshot mudou, o corredor foi reconstruído) não teletransporta o gato.
    pet.tick(1_000, alwaysWalkable, noDestination);
    pet.init(999, 999);
    expect(pet).toMatchObject({ x: 80, y: 96, targetX: 80, targetY: 96 });
  });

  it('carinho: senta, ronrona por 4 s sem andar e depois volta à rotina', () => {
    const pet = new OfficePet(seq(0.5));
    pet.init(0, 0);
    pet.pose = 'walk';
    pet.targetX = 100;
    pet.stateTimer = 12_000;
    expect(pet.pet()).toBe(true);
    expect(pet).toMatchObject({ pose: 'sit', purrTimer: 4000, stateTimer: 5000 });
    pet.tick(1_000, alwaysWalkable, noDestination);
    expect(pet).toMatchObject({ x: 0, pose: 'sit', purrTimer: 3000, stateTimer: 5000 });
    pet.tick(3_000, alwaysWalkable, noDestination);
    // O ronrono acabou neste quadro: volta a contar o tempo parado.
    expect(pet).toMatchObject({ pose: 'sit', purrTimer: 0, stateTimer: 2000 });
    // Novo carinho zera a espera outra vez.
    pet.pet();
    expect(pet).toMatchObject({ purrTimer: 4000, stateTimer: 5000 });
  });

  it('parado: ao vencer o tempo escolhe um destino andável e vai andando até ele', () => {
    const pet = new OfficePet(seq(0.9, 0.5));
    pet.init(0, 0);
    pet.stateTimer = 0;
    pet.tick(16, alwaysWalkable, () => ({ x: 3, y: 2 }));
    expect(pet).toMatchObject({ pose: 'walk', targetX: 3 * TILE + TILE / 2, targetY: 2 * TILE + TILE / 2, stateTimer: 12_000 });
    walkTo(pet);
    expect(pet).toMatchObject({ x: 3 * TILE + TILE / 2, y: 2 * TILE + TILE / 2, pose: 'sit', dir: 'right' });
    // 0.9 (>= 0.4) senta; 0.5 sorteia a duração de 5 a 11 s.
    expect(pet.stateTimer).toBeCloseTo(8000);
  });

  it('chegou ao destino: dorme com 40% de chance e o cochilo dura de 14 a 24 s', () => {
    const pet = new OfficePet(seq(0.1, 0.5));
    pet.init(0, 0);
    pet.stateTimer = 0;
    pet.tick(16, alwaysWalkable, () => ({ x: 1, y: 0 }));
    walkTo(pet);
    expect(pet.pose).toBe('sleep');
    expect(pet.stateTimer).toBeCloseTo(19_000);
    // Dormindo: continua parado no lugar até o tempo acabar.
    pet.tick(5_000, alwaysWalkable, () => ({ x: 9, y: 9 }));
    expect(pet).toMatchObject({ x: TILE + TILE / 2, y: TILE / 2, pose: 'sleep', stateTimer: 14_000 });
  });

  it('sem destino livre ou com destino bloqueado: fica sentado e tenta de novo em 4 s', () => {
    const withoutDestination = new OfficePet(seq(0.5));
    withoutDestination.init(0, 0);
    withoutDestination.stateTimer = 0;
    withoutDestination.tick(16, alwaysWalkable, noDestination);
    expect(withoutDestination).toMatchObject({ pose: 'sit', x: 0, y: 0, stateTimer: 4000 });

    const blocked = new OfficePet(seq(0.5));
    blocked.init(0, 0);
    blocked.stateTimer = 0;
    blocked.tick(16, () => false, () => ({ x: 3, y: 2 }));
    expect(blocked).toMatchObject({ pose: 'sit', x: 0, y: 0, stateTimer: 4000 });
  });

  it('o destino nunca sai do corredor: a posição fica dentro dos limites em todos os quadros', () => {
    const rnd = mulberry32(42);
    // Corredor sintético de 10 x 5 tiles (o mesmo formato do corredor de verdade).
    const rect = { x: 5, y: 4, w: 10, h: 5 };
    const walkable = (tx: number, ty: number) => tx >= rect.x && tx < rect.x + rect.w && ty >= rect.y && ty < rect.y + rect.h;
    const destination = () => ({ x: rect.x + Math.floor(rnd() * rect.w), y: rect.y + Math.floor(rnd() * rect.h) });
    const pet = new OfficePet(rnd);
    pet.init((rect.x + Math.floor(rect.w / 2)) * TILE, (rect.y + Math.floor(rect.h / 2)) * TILE);
    const left = rect.x * TILE;
    const right = (rect.x + rect.w) * TILE;
    const top = rect.y * TILE;
    const bottom = (rect.y + rect.h) * TILE;
    let walked = false;
    for (let i = 0; i < 60 * 60; i++) {
      pet.tick(1000 / 60, walkable, destination);
      expect(pet.x, `quadro ${i}`).toBeGreaterThanOrEqual(left);
      expect(pet.x, `quadro ${i}`).toBeLessThanOrEqual(right);
      expect(pet.y, `quadro ${i}`).toBeGreaterThanOrEqual(top);
      expect(pet.y, `quadro ${i}`).toBeLessThanOrEqual(bottom);
      if (pet.pose === 'walk') {
        walked = true;
        expect(pet.targetX).toBeGreaterThanOrEqual(left);
        expect(pet.targetX).toBeLessThanOrEqual(right);
        expect(pet.targetY).toBeGreaterThanOrEqual(top);
        expect(pet.targetY).toBeLessThanOrEqual(bottom);
      }
    }
    expect(walked).toBe(true);
  });

  it('anda para o lado certo (dir segue o maior eixo do deslocamento)', () => {
    const cases: Array<[number, number, string]> = [
      [100, 0, 'right'],
      [-100, 0, 'left'],
      [0, 100, 'down'],
      [0, -100, 'up'],
    ];
    for (const [tx, ty, dir] of cases) {
      const pet = new OfficePet(seq(0.5));
      pet.init(0, 0);
      pet.pose = 'walk';
      pet.targetX = tx;
      pet.targetY = ty;
      pet.stateTimer = 12_000;
      pet.tick(100, alwaysWalkable, noDestination);
      expect(pet.dir, `${tx},${ty}`).toBe(dir);
    }
  });

  it('animação: 180 ms por quadro andando, 400 ms sentado, sempre em 8 quadros', () => {
    const walking = new OfficePet(seq(0.5));
    walking.init(0, 0);
    walking.pose = 'walk';
    walking.targetX = 10_000;
    walking.stateTimer = 12_000;
    walking.tick(179, alwaysWalkable, noDestination);
    expect(walking.frame).toBe(0);
    walking.tick(1, alwaysWalkable, noDestination);
    expect(walking.frame).toBe(1);
    for (let i = 0; i < 7; i++) walking.tick(180, alwaysWalkable, noDestination);
    expect(walking.frame).toBe(0);

    const sitting = new OfficePet(seq(0.5));
    sitting.init(0, 0);
    sitting.stateTimer = 12_000;
    sitting.tick(399, alwaysWalkable, noDestination);
    expect(sitting.frame).toBe(0);
    sitting.tick(1, alwaysWalkable, noDestination);
    expect(sitting.frame).toBe(1);
    sitting.tick(400, alwaysWalkable, noDestination);
    expect(sitting.frame).toBe(2);
  });
});

describe('mascote: determinismo', () => {
  /** Um minuto de simulação; o RNG injetado decide cochilos e destinos. */
  function simulate(seed: number): string[] {
    const rnd = mulberry32(seed);
    const pet = new OfficePet(rnd);
    pet.init(80, 80);
    pet.stateTimer = 0;
    const destination = () => ({ x: 5 + Math.floor(rnd() * 10), y: 4 + Math.floor(rnd() * 5) });
    const out: string[] = [];
    for (let i = 0; i < 2000; i++) {
      pet.tick(16, alwaysWalkable, destination);
      out.push(`${pet.x.toFixed(3)},${pet.y.toFixed(3)},${pet.pose},${pet.dir},${pet.frame},${pet.stateTimer.toFixed(0)}`);
    }
    return out;
  }

  it('a mesma semente gera a mesma sequência de posições, poses e quadros', () => {
    expect(simulate(7)).toEqual(simulate(7));
    expect(simulate(7)).not.toEqual(simulate(8));
  });
});
