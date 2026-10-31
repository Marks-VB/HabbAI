// Modelo do trilho de andares da visita (PLANO.md, "Andares"): a lista de andares na ordem do prédio,
// a ocupação de cada um (trabalhando, esperando, de olho no terminal, à toa), o andar atual e os
// rótulos acessíveis. Funções puras (sem DOM), testadas em world/floors/rail.test.ts.
import { tr } from '../../../../shared/i18n';

/** Status que o trilho mostra (o mesmo vocabulário da visita, com 'empty' quando não há ninguém). */
export type FloorStatus = 'working' | 'waiting' | 'shell' | 'idle' | 'empty';

export type RailAgentStatus = 'working' | 'waiting' | 'idle' | 'shell';

/** O que o trilho precisa de uma sala/andar (VisitRoomRow satisfaz). */
export interface RailRoom {
  id: string;
  name: string;
  agents: readonly { status: string }[];
}

export interface RailFloor {
  /** Andar (0 = térreo). */
  index: number;
  roomId: string;
  /** Nome fictício do andar (o rótulo da sala). */
  name: string;
  /** Rótulo curto do item: "Térreo" ou o nome do andar. */
  label: string;
  /** Total de agentes no andar. */
  agents: number;
  working: number;
  waiting: number;
  shell: number;
  idle: number;
  /** Bolinha do item: o status que mais pede atenção (esperando > trabalhando > terminal > à toa). */
  status: FloorStatus;
  /** Frase para o leitor de tela ("Andar 4 de 6, Projeto Ipê, 2 agentes trabalhando"). */
  ariaLabel: string;
}

export interface RailModel {
  /** Andares na ordem do pacote (térreo primeiro). */
  floors: RailFloor[];
  current: number;
  total: number;
}

/** Status válidos da visita; um desconhecido vira 'idle' (mesma regra do painel). */
export function normalizeStatus(status: string): RailAgentStatus {
  return status === 'working' || status === 'waiting' || status === 'shell' ? status : 'idle';
}

/** O status que a bolinha do andar mostra. */
export function floorStatus(counts: { working: number; waiting: number; shell: number; idle: number }): FloorStatus {
  if (counts.waiting > 0) return 'waiting';
  if (counts.working > 0) return 'working';
  if (counts.shell > 0) return 'shell';
  if (counts.idle > 0) return 'idle';
  return 'empty';
}

/** "2 agentes trabalhando", "1 agente esperando você", "sem agentes". */
export function occupancyText(counts: {
  agents: number;
  working: number;
  waiting: number;
  shell: number;
  idle: number;
}): string {
  if (counts.agents <= 0) return tr('sem agentes');
  if (counts.working > 0 && counts.waiting > 0)
    return tr('{0} trabalhando, {1} esperando', [counts.working, counts.waiting]);
  if (counts.working > 0)
    return counts.working === 1 ? tr('1 agente trabalhando') : tr('{0} agentes trabalhando', [counts.working]);
  if (counts.waiting > 0)
    return counts.waiting === 1 ? tr('1 agente esperando você') : tr('{0} agentes esperando você', [counts.waiting]);
  if (counts.shell > 0)
    return counts.shell === 1
      ? tr('1 agente de olho no terminal')
      : tr('{0} agentes de olho no terminal', [counts.shell]);
  return counts.idle === 1 ? tr('1 agente à toa') : tr('{0} agentes à toa', [counts.idle]);
}

/** Rótulo acessível do andar (o texto que a região viva anuncia ao trocar de andar). */
export function floorAriaLabel(
  index: number,
  total: number,
  name: string,
  counts: Parameters<typeof occupancyText>[0],
): string {
  const occupancy = occupancyText(counts);
  return index === 0
    ? tr('Térreo, {0}, {1}', [name, occupancy])
    : tr('Andar {0} de {1}, {2}, {3}', [index, total, name, occupancy]);
}

/** Andar válido (0..total-1); sem andares, 0. */
export function clampFloor(floor: number, total: number): number {
  if (total <= 0) return 0;
  if (!Number.isFinite(floor)) return 0;
  return Math.max(0, Math.min(total - 1, Math.floor(floor)));
}

/** Monta o modelo do trilho a partir das salas (na ordem do pacote) e do andar atual. */
export function buildRail(rooms: readonly RailRoom[], current: number): RailModel {
  const total = rooms.length;
  const floors: RailFloor[] = rooms.map((room, index) => {
    const counts = { agents: room.agents.length, working: 0, waiting: 0, shell: 0, idle: 0 };
    for (const a of room.agents) counts[normalizeStatus(a.status)]++;
    return {
      index,
      roomId: room.id,
      name: room.name,
      label: index === 0 ? tr('Térreo') : room.name,
      ...counts,
      status: floorStatus(counts),
      ariaLabel: floorAriaLabel(index, total, room.name, counts),
    };
  });
  return { floors, current: clampFloor(current, total), total };
}

/** Andar visível acima (índice + 1) / abaixo (índice - 1). */
export function floorUp(current: number, total: number): number {
  return clampFloor(current + 1, total);
}

export function floorDown(current: number, total: number): number {
  return clampFloor(current - 1, total);
}

/** Teclas que navegam o trilho; null para uma tecla que não navega (ou sem andares). */
export function nextFloor(current: number, total: number, key: string): number | null {
  if (total <= 0) return null;
  const cur = clampFloor(current, total);
  switch (key) {
    case 'ArrowUp':
      return floorUp(cur, total);
    case 'ArrowDown':
      return floorDown(cur, total);
    case 'Home':
      return total - 1;
    case 'End':
      return 0;
    case 'PageUp':
      return clampFloor(cur + 5, total);
    case 'PageDown':
      return clampFloor(cur - 5, total);
    default:
      return null;
  }
}
