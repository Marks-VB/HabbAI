// Navegação por teclado no escritório: a ordem em que as setas percorrem os agentes e o passo de cada tecla.
// Funções puras (sem DOM), testadas em world/nav.test.ts. A ordem é estável: primeiro a sala (a ordem de chegada
// que o servidor atribui, `RoomInfo.slot`) e, dentro dela, o nome do agente.
import type { AgentStatus } from '../../../shared/types';
import { tr } from '../../../shared/i18n';

/** O que a navegação precisa saber de um agente (AgentInfo satisfaz). */
export interface NavAgent {
  id: string;
  name: string;
  roomId: string;
  status?: AgentStatus;
}

/** O que a navegação precisa saber de uma sala (RoomInfo satisfaz). */
export interface NavRoom {
  id: string;
  name: string;
  slot?: number;
}

/** Comparação de nomes estável e sem depender do locale do sistema. */
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

/**
 * Agentes na ordem da navegação por teclado: por sala (`slot`, e depois nome) e, dentro da sala, por nome.
 * Quem está saindo (`offline`) fica fora: não há personagem no escritório para o foco encontrar.
 */
export function navigationOrder<T extends NavAgent>(agents: readonly T[], rooms: readonly NavRoom[]): T[] {
  const roomRank = new Map(rooms.map((r) => [r.id, r.slot ?? Number.MAX_SAFE_INTEGER]));
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));
  const rank = (a: T) => roomRank.get(a.roomId) ?? Number.MAX_SAFE_INTEGER;
  return agents
    .filter((a) => a.status !== 'offline')
    .map((agent, index) => ({ agent, index }))
    .sort((x, y) => {
      const byRoom = rank(x.agent) - rank(y.agent) || collator.compare(roomName.get(x.agent.roomId) ?? '', roomName.get(y.agent.roomId) ?? '');
      if (byRoom !== 0) return byRoom;
      return collator.compare(x.agent.name, y.agent.name) || x.index - y.index;
    })
    .map((x) => x.agent);
}

/** Teclas que percorrem a lista (Home e End vão direto ao primeiro e ao último). */
export const NAV_KEYS = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'] as const;

/** Rótulo do status para o leitor de tela (os mesmos textos da gaveta; ver ui/model.ts). */
export function statusText(status: AgentStatus): string {
  switch (status) {
    case 'working':
      return tr('Trabalhando');
    case 'waiting':
      return tr('Precisa de você');
    case 'shell':
      return tr('Esperando o shell');
    case 'idle':
      return tr('Ocioso');
    case 'done':
      return tr('Concluído');
    case 'offline':
      return tr('Saindo');
  }
}

/**
 * Índice depois de uma tecla de navegação, com volta ao começo no fim da lista (e ao contrário). `current` é o
 * índice do agente em foco; null (nada selecionado) entra pela ponta: →/↓ no primeiro, ←/↑ no último.
 * Devolve null para uma tecla que não navega (ou lista vazia).
 */
export function nextNavIndex(current: number | null, length: number, key: string): number | null {
  if (length <= 0) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  const step = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 0;
  if (!step) return null;
  if (current === null || current < 0 || current >= length) return step > 0 ? 0 : length - 1;
  return (current + step + length) % length;
}
