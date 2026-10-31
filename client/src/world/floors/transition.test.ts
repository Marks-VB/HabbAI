// Transição entre andares (Fase 2): estado inicial, destino inválido, último clique vence, `floorChanged` uma única
// vez, `done`, `instant`, `cancel`, `dt` inválido, progresso do fade e o orçamento de tempo (≤ 300 ms).
import { describe, expect, it } from 'vitest';
import { advance, cancel, createTransition, currentFloor, request, TRANSITION_TIMINGS } from './transition';

const FLOORS = { floorCount: 4 } as const;

function start(from: number, to: number, options: { floorCount: number; instant?: boolean } = FLOORS) {
  return request(createTransition(from), to, options);
}

describe('tempos da transição', () => {
  it('a soma das fases cabe nos 300 ms de espera percebida e mantém a ordem de grandeza', () => {
    const total = TRANSITION_TIMINGS.doors + TRANSITION_TIMINGS.fade + TRANSITION_TIMINGS.arrive;
    expect(total).toBeLessThanOrEqual(300);
    expect(total).toBeGreaterThan(0);
    for (const ms of Object.values(TRANSITION_TIMINGS)) {
      expect(Number.isInteger(ms)).toBe(true);
      expect(ms).toBeGreaterThanOrEqual(50);
      expect(ms).toBeLessThan(300);
    }
    // O fade é a fase mais longa, como nos valores de referência (30/40/30).
    expect(TRANSITION_TIMINGS.fade).toBeGreaterThan(TRANSITION_TIMINGS.doors);
    expect(TRANSITION_TIMINGS.fade).toBeGreaterThan(TRANSITION_TIMINGS.arrive);
  });
});

describe('início e destino inválido', () => {
  it('nasce idle no andar atual e não avança sozinho', () => {
    const state = createTransition(2);
    expect(state).toEqual({ phase: 'idle', from: 2, to: 2, elapsed: 0, duration: 0 });
    expect(currentFloor(state)).toBe(2);
    const r = advance(state, 1_000);
    expect(r.state).toBe(state);
    expect(r).toMatchObject({ floorChanged: false, done: false, progress: 0 });
    expect(r.cue).toBeUndefined();
    expect(createTransition().to).toBe(0);
    expect(createTransition(-3).to).toBe(0);
  });

  it('destino igual ao atual, fora do prédio ou não inteiro não muda nada', () => {
    const state = createTransition(2);
    for (const target of [2, -1, 4, 1.5, Number.NaN]) {
      const r = request(state, target, FLOORS);
      expect(r.started).toBe(false);
      expect(r.state).toBe(state);
      expect(r).toMatchObject({ floorChanged: false, done: false });
      expect(r.cue).toBeUndefined();
    }
    for (const floorCount of [0, -2, 2.5, Number.NaN]) {
      expect(request(state, 1, { floorCount }).started).toBe(false);
      expect(request(state, 1, { floorCount }).state).toBe(state);
    }
  });

  it('começa em doors, de from = andar atual para o destino, com um único cue de porta', () => {
    const r = start(0, 3);
    expect(r.started).toBe(true);
    expect(r).toMatchObject({ floorChanged: false, done: false, cue: 'doors' });
    expect(r.state).toEqual({ phase: 'doors', from: 0, to: 3, elapsed: 0, duration: TRANSITION_TIMINGS.doors });
    expect(currentFloor(r.state)).toBe(0);
  });
});

describe('avanço, floorChanged e done', () => {
  it('floorChanged dispara exatamente uma vez e done fecha a transição', () => {
    let state = start(0, 3).state;
    let changes = 0;
    let done = 0;
    const cues: string[] = [];
    for (let i = 0; i < 200; i++) {
      const r = advance(state, 16);
      if (r.floorChanged) changes++;
      if (r.done) done++;
      if (r.cue) cues.push(r.cue);
      state = r.state;
    }
    expect(changes).toBe(1);
    expect(done).toBe(1);
    expect(cues).toEqual(['arrive']);
    expect(state).toMatchObject({ phase: 'idle', from: 3, to: 3 });
    expect(currentFloor(state)).toBe(3);
  });

  it('as fronteiras exatas das fases trocam na hora certa e o cue sai só ao chegar', () => {
    let state = start(0, 2).state;
    let r = advance(state, TRANSITION_TIMINGS.doors - 1);
    expect(r.state).toMatchObject({ phase: 'doors', elapsed: TRANSITION_TIMINGS.doors - 1 });
    expect(r.cue).toBeUndefined();

    r = advance(r.state, 1);
    expect(r.state).toMatchObject({ phase: 'fade', elapsed: 0 });
    expect(r.progress).toBe(0);
    expect(r.floorChanged).toBe(false);
    expect(r.cue).toBeUndefined();

    r = advance(r.state, TRANSITION_TIMINGS.fade);
    expect(r.state).toMatchObject({ phase: 'arrive', elapsed: 0 });
    expect(r.floorChanged).toBe(true);
    expect(r.cue).toBe('arrive');
    expect(currentFloor(r.state)).toBe(2);

    r = advance(r.state, TRANSITION_TIMINGS.arrive);
    expect(r.state).toMatchObject({ phase: 'idle', from: 2, to: 2, duration: 0 });
    expect(r.done).toBe(true);
    expect(r.floorChanged).toBe(false);
    expect(r.cue).toBeUndefined();

    const again = advance(r.state, 500);
    expect(again.done).toBe(false);
    expect(again.floorChanged).toBe(false);
  });

  it('um dt grande atravessa as fases de uma vez, com um floorChanged e um cue', () => {
    const r = advance(start(1, 3).state, 10_000);
    expect(r.state).toMatchObject({ phase: 'idle', from: 3, to: 3 });
    expect(r.floorChanged).toBe(true);
    expect(r.done).toBe(true);
    expect(r.cue).toBe('arrive');
    expect(r.progress).toBe(0);
  });

  it('progress vai de 0 a 1 dentro de cada fase, para o fade', () => {
    let r = advance(start(0, 2).state, TRANSITION_TIMINGS.doors / 2);
    expect(r.state.phase).toBe('doors');
    expect(r.progress).toBeCloseTo(0.5);

    r = advance(r.state, TRANSITION_TIMINGS.doors / 2);
    expect(r.state.phase).toBe('fade');
    expect(r.progress).toBe(0);

    r = advance(r.state, TRANSITION_TIMINGS.fade / 4);
    expect(r.state.phase).toBe('fade');
    expect(r.progress).toBeCloseTo(0.25);

    r = advance(r.state, TRANSITION_TIMINGS.fade - TRANSITION_TIMINGS.fade / 4);
    expect(r.state.phase).toBe('arrive');
    expect(r.progress).toBe(0);

    r = advance(r.state, TRANSITION_TIMINGS.arrive / 2);
    expect(r.state.phase).toBe('arrive');
    expect(r.progress).toBeCloseTo(0.5);

    r = advance(r.state, TRANSITION_TIMINGS.arrive);
    expect(r.state.phase).toBe('idle');
    expect(r.progress).toBe(0);
  });
});

describe('último clique vence', () => {
  it('troca só o destino, sem reiniciar a fase nem empilhar transições', () => {
    const first = start(0, 1);
    let state = advance(first.state, 30).state;
    expect(state).toMatchObject({ phase: 'doors', elapsed: 30, to: 1 });

    const second = request(state, 3, FLOORS);
    expect(second).toMatchObject({ started: true, floorChanged: false, done: false });
    expect(second.cue).toBeUndefined();
    expect(second.state).toMatchObject({ phase: 'doors', from: 0, to: 3, elapsed: 30 });

    const third = request(second.state, 2, FLOORS);
    expect(third.state).toMatchObject({ phase: 'doors', from: 0, to: 2, elapsed: 30 });

    // repetir o destino já pedido não reinicia nada
    const same = request(third.state, 2, FLOORS);
    expect(same.started).toBe(false);
    expect(same.state).toBe(third.state);

    let r = advance(third.state, TRANSITION_TIMINGS.doors - 30);
    expect(r.state.phase).toBe('fade');
    r = advance(r.state, TRANSITION_TIMINGS.fade);
    expect(r.state.phase).toBe('arrive');
    expect(r.state.to).toBe(2);
    expect(r.floorChanged).toBe(true);
  });

  it('um clique já em arrive começa outra viagem a partir do andar novo', () => {
    let r = advance(start(0, 3).state, TRANSITION_TIMINGS.doors + TRANSITION_TIMINGS.fade);
    expect(r.state.phase).toBe('arrive');
    expect(r.floorChanged).toBe(true);

    const next = request(r.state, 1, FLOORS);
    expect(next).toMatchObject({ started: true, floorChanged: false, cue: 'doors' });
    expect(next.state).toMatchObject({ phase: 'doors', from: 3, to: 1, elapsed: 0 });
  });
});

describe('movimento reduzido (instant)', () => {
  it('troca de andar no mesmo clique, com floorChanged e done', () => {
    const r = start(0, 2, { floorCount: 4, instant: true });
    expect(r).toMatchObject({ started: true, floorChanged: true, done: true, cue: 'arrive' });
    expect(r.state).toEqual({ phase: 'idle', from: 2, to: 2, elapsed: 0, duration: 0 });
    expect(currentFloor(r.state)).toBe(2);

    const after = advance(r.state, 1_000);
    expect(after).toMatchObject({ floorChanged: false, done: false, progress: 0 });
  });

  it('vale também no meio de uma transição e ignora o destino repetido', () => {
    const state = advance(start(0, 1).state, TRANSITION_TIMINGS.doors + 10).state;
    expect(state.phase).toBe('fade');

    const jump = request(state, 3, { floorCount: 4, instant: true });
    expect(jump).toMatchObject({ started: true, floorChanged: true, done: true });
    expect(jump.state).toMatchObject({ phase: 'idle', from: 3, to: 3, duration: 0 });

    expect(request(jump.state, 3, { floorCount: 4, instant: true }).started).toBe(false);
  });
});

describe('cancelamento', () => {
  it('no meio de doors/fade volta ao andar de origem, sem trocar a cena', () => {
    const state = advance(start(4, 1, { floorCount: 5 }).state, TRANSITION_TIMINGS.doors + 1).state;
    expect(state.phase).toBe('fade');
    const idle = cancel(state);
    expect(idle).toEqual({ phase: 'idle', from: 4, to: 4, elapsed: 0, duration: 0 });
    expect(currentFloor(idle)).toBe(4);
    expect(advance(idle, 100).done).toBe(false);
  });

  it('em arrive fica no destino; em idle é inofensivo', () => {
    const arrived = advance(start(0, 2).state, TRANSITION_TIMINGS.doors + TRANSITION_TIMINGS.fade).state;
    expect(arrived.phase).toBe('arrive');
    expect(cancel(arrived)).toMatchObject({ phase: 'idle', from: 2, to: 2 });

    const idle = createTransition(1);
    expect(cancel(idle)).toBe(idle);
  });

  it('cancelar e pedir de novo funciona, mesmo com o destino antigo fora do prédio', () => {
    let state = advance(start(0, 3).state, 40).state;
    state = cancel(state);
    expect(state.phase).toBe('idle');
    const again = request(state, 1, { floorCount: 2 });
    expect(again.started).toBe(true);
    expect(again.state).toMatchObject({ phase: 'doors', from: 0, to: 1 });
  });
});

describe('dt inválido', () => {
  it('negativo, NaN, infinito e zero não quebram nem mexem no estado', () => {
    const state = advance(start(0, 3).state, 45).state;
    const progress = 45 / TRANSITION_TIMINGS.doors;
    for (const dt of [-16, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const r = advance(state, dt);
      expect(r.state).toBe(state);
      expect(r).toMatchObject({ floorChanged: false, done: false });
      expect(r.progress).toBeCloseTo(progress);
      expect(r.cue).toBeUndefined();
    }
    expect(advance(state, 0).state).toBe(state);
  });
});

describe('estado sempre válido', () => {
  it('uma sequência de cliques e dts arbitrários mantém fase, andar e progresso coerentes', () => {
    let state = createTransition(0);
    const dts = [7, 23, 0, 41, 16, 5, 99, 3, 58, 1, 120, 45];
    const targets = [2, 3, 3, 1, 0, 3, 2, 2, 1, 0, 3, 1];
    for (let i = 0; i < dts.length; i++) {
      const req = request(state, targets[i], FLOORS);
      expect(req.state.to).toBeGreaterThanOrEqual(0);
      expect(req.state.to).toBeLessThan(FLOORS.floorCount);
      state = req.state;
      const r = advance(state, dts[i]);
      expect(r.progress).toBeGreaterThanOrEqual(0);
      expect(r.progress).toBeLessThanOrEqual(1);
      expect(currentFloor(r.state)).toBeGreaterThanOrEqual(0);
      expect(currentFloor(r.state)).toBeLessThan(FLOORS.floorCount);
      state = r.state;
    }
    // ao final, cancelar sempre entrega um idle válido
    expect(cancel(state).phase).toBe('idle');
  });
});
