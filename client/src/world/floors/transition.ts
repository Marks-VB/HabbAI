// Núcleo puro da transição entre andares (Fase 2: elevador). Sem DOM, sem timers e sem `Date.now()`: o tempo entra em
// `advance(state, dtMs)`, então o loop de render, os testes e qualquer passo fixo usam a mesma máquina de estados.
//
// Contrato de integração (Fase 1 + Fase 2):
// 1. `createTransition(andarAtual)` cria o estado `idle`; a cena/visita guarda esse objeto.
// 2. Clique no trilho lateral (ou no botão do elevador): `request(estado, alvo, { floorCount })`.
//    `started` diz se o clique virou transição. O `cue: 'doors'` sai uma única vez, aqui (porta fechando).
// 3. A cada frame: `const { state, floorChanged, done, cue, progress } = advance(state, dt)`.
//    - `state` substitui o anterior (o módulo não muta nada);
//    - `progress` (0..1, por fase) desenha a porta e o escurecimento;
//    - `floorChanged === true` acontece uma única vez, ao entrar em `arrive`: é a hora de mover a câmera, trocar o
//      andar do `sim`/`WorldBuildingDetail` e, se houver, tocar `cue: 'arrive'`;
//    - `done === true` no frame em que volta a `idle` (a cena já está no andar novo).
// 4. Áudio: `cue` nunca se repete a cada frame. `doors` é o fechamento e `arrive` é a chegada; a integração converte
//    os dois para o cue `elevator` de `client/src/world/sound-cues.ts` (com o gain/pan do elevador).
// 5. Movimento reduzido: `request(..., { instant: true })` resolve no mesmo clique, numa transição de duração 0, com
//    `floorChanged: true`, `done: true` e `cue: 'arrive'`; não há fase intermediária para desenhar.
// 6. `cancel(state)` volta a `idle` sem trocar a cena: no meio de `doors`/`fade` fica no andar de origem; já em
//    `arrive` (a cena trocou) fica no destino. Use quando o prédio fecha ou um andar some num `building.patch`; se o
//    destino deixou de existir, chame `cancel` antes do próximo `advance`.
// 7. `currentFloor(state)` é o andar que a cena deve mostrar agora: o de origem até `arrive`, o destino depois (em
//    `idle`, o andar em que se está). O destino é sempre validado contra `floorCount` no `request`.

/** Fases, na ordem: `idle` → `doors` → `fade` → `arrive` → `idle`. */
export type FloorTransitionPhase = 'idle' | 'doors' | 'fade' | 'arrive';

/** Eventos de som da transição, para tocar uma vez por fase (nunca a cada frame). */
export type TransitionCue = 'doors' | 'arrive';

/**
 * Duração de cada fase, em ms. A soma é a espera percebida: os valores de referência (180/250/180 = 610 ms) foram
 * reduzidos na mesma proporção (~30/40/30) para caber no limite de 300 ms, mantendo a ordem de grandeza (~100 ms por
 * fase). `instant` não usa estes tempos.
 */
export const TRANSITION_TIMINGS = { doors: 90, fade: 120, arrive: 90 } as const;

export interface FloorTransitionState {
  readonly phase: FloorTransitionPhase;
  /** Andar de onde a viagem partiu (o que a cena mostra até `arrive`). */
  readonly from: number;
  /** Andar pedido (destino). Em `idle` e `arrive`, é o andar atual. */
  readonly to: number;
  /** Tempo já decorrido na fase corrente (ms). */
  readonly elapsed: number;
  /** Duração da fase corrente (ms); 0 em `idle` e no pulo instantâneo. */
  readonly duration: number;
}

export interface TransitionOptions {
  /** Quantidade de andares do prédio: o destino válido é `0..floorCount-1`. */
  floorCount: number;
  /** Movimento reduzido: troca na hora, sem passar por `doors`/`fade`. */
  instant?: boolean;
}

export interface TransitionRequestResult {
  state: FloorTransitionState;
  /** O clique virou (ou trocou o destino de) uma transição. */
  started: boolean;
  /** Só no `instant`: a cena já mudou de andar nesta chamada. */
  floorChanged: boolean;
  /** Só no `instant`: a transição já terminou nesta chamada. */
  done: boolean;
  /** Evento de áudio para tocar uma vez, se houver. */
  cue?: TransitionCue;
}

export interface TransitionAdvanceResult {
  state: FloorTransitionState;
  /** A cena deve trocar de andar nesta chamada (uma única vez, ao entrar em `arrive`). */
  floorChanged: boolean;
  /** A transição voltou a `idle`. */
  done: boolean;
  /** 0..1 dentro da fase corrente (para o fade); 0 em `idle`. */
  progress: number;
  /** Evento de áudio para tocar uma vez, se houver. */
  cue?: TransitionCue;
}

/** Estado inicial: parado no andar informado (andar inválido vira o térreo). */
export function createTransition(floor = 0): FloorTransitionState {
  const at = Number.isInteger(floor) && floor >= 0 ? floor : 0;
  return idle(at);
}

/** O andar que a cena deve mostrar agora (em `doors`/`fade`, ainda o de origem). */
export function currentFloor(state: FloorTransitionState): number {
  return state.phase === 'doors' || state.phase === 'fade' ? state.from : state.to;
}

/**
 * Pede um andar. Destino inválido ou igual ao já pedido não muda nada (`started: false`). No meio de `doors`/`fade`
 * o último clique vence: só o destino troca, sem reiniciar a fase. Em `arrive` o andar novo já apareceu, então um
 * clique começa outra viagem a partir dele.
 */
export function request(
  state: FloorTransitionState,
  target: number,
  options: TransitionOptions,
): TransitionRequestResult {
  if (!validFloor(target, options.floorCount)) {
    return { state, started: false, floorChanged: false, done: false };
  }
  // `state.to` é o andar atual em `idle`/`arrive` e o já pedido em `doors`/`fade`: repetir o clique não faz nada.
  if (target === state.to) {
    return { state, started: false, floorChanged: false, done: false };
  }
  if (options.instant === true) {
    return { state: idle(target), started: true, floorChanged: true, done: true, cue: 'arrive' };
  }
  if (state.phase === 'idle' || state.phase === 'arrive') {
    return { state: starting(state.to, target), started: true, floorChanged: false, done: false, cue: 'doors' };
  }
  // `doors`/`fade`: o último clique vence, mantendo a fase e o tempo decorrido.
  return { state: { ...state, to: target }, started: true, floorChanged: false, done: false };
}

/**
 * Avança o relógio da transição. `dt` negativo, `NaN` ou infinito é ignorado. Um `dt` grande pode atravessar mais de
 * uma fase (aba em segundo plano): o resultado é o mesmo de vários frames pequenos, com no máximo um `floorChanged` e
 * um `cue` por chamada.
 */
export function advance(state: FloorTransitionState, dtMs: number): TransitionAdvanceResult {
  const unchanged: TransitionAdvanceResult = {
    state,
    floorChanged: false,
    done: false,
    progress: progressOf(state),
  };
  if (state.phase === 'idle') return unchanged;
  if (!Number.isFinite(dtMs) || dtMs <= 0) return unchanged;

  let phase: 'doors' | 'fade' | 'arrive' = state.phase;
  let elapsed = state.elapsed + dtMs;
  let duration = state.duration;
  let arrived = false;
  while (elapsed >= duration) {
    elapsed -= duration;
    if (phase === 'doors') {
      phase = 'fade';
      duration = TRANSITION_TIMINGS.fade;
    } else if (phase === 'fade') {
      phase = 'arrive';
      duration = TRANSITION_TIMINGS.arrive;
      arrived = true;
    } else {
      return {
        state: idle(state.to),
        floorChanged: arrived,
        done: true,
        progress: 0,
        ...(arrived ? { cue: 'arrive' as const } : {}),
      };
    }
  }
  return {
    state: { ...state, phase, elapsed, duration },
    floorChanged: arrived,
    done: false,
    progress: clamp01(duration > 0 ? elapsed / duration : 1),
    ...(arrived ? { cue: 'arrive' as const } : {}),
  };
}

/**
 * Cancela a transição sem trocar a cena: em `doors`/`fade` volta ao andar de origem; em `arrive` (a cena já trocou)
 * fica no destino. Em `idle` é inofensivo.
 */
export function cancel(state: FloorTransitionState): FloorTransitionState {
  if (state.phase === 'idle') return state;
  return idle(state.phase === 'arrive' ? state.to : state.from);
}

function idle(floor: number): FloorTransitionState {
  return { phase: 'idle', from: floor, to: floor, elapsed: 0, duration: 0 };
}

function starting(from: number, to: number): FloorTransitionState {
  return { phase: 'doors', from, to, elapsed: 0, duration: TRANSITION_TIMINGS.doors };
}

function validFloor(target: number, floorCount: number): boolean {
  return (
    Number.isInteger(target) && Number.isInteger(floorCount) && floorCount > 0 && target >= 0 && target < floorCount
  );
}

function progressOf(state: FloorTransitionState): number {
  if (state.phase === 'idle') return 0;
  return clamp01(state.duration > 0 ? state.elapsed / state.duration : 1);
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
