// Modelo do trilho de andares: ordem, ocupação por status, rótulos acessíveis, clamp e teclas.
import { describe, expect, it } from 'vitest';
import {
  buildRail,
  clampFloor,
  floorDown,
  floorStatus,
  floorUp,
  nextFloor,
  normalizeStatus,
  occupancyText,
} from './rail';

const room = (id: string, name: string, statuses: string[]) => ({
  id,
  name,
  agents: statuses.map((status) => ({ status })),
});
const ROOMS = [
  room('f_0', 'Projeto Ipê', ['working', 'working']),
  room('f_1', 'Projeto Jade', ['waiting', 'shell']),
  room('f_2', 'Projeto Aurora', ['idle']),
  room('f_3', 'Projeto Cedro', []),
];

describe('buildRail', () => {
  it('lista os andares na ordem do pacote, com o térreo primeiro e o atual validado', () => {
    const m = buildRail(ROOMS, 2);
    expect(m.total).toBe(4);
    expect(m.current).toBe(2);
    expect(m.floors.map((f) => f.roomId)).toEqual(['f_0', 'f_1', 'f_2', 'f_3']);
    expect(m.floors.map((f) => f.label)).toEqual(['Térreo', 'Projeto Jade', 'Projeto Aurora', 'Projeto Cedro']);
    expect(m.floors.map((f) => f.index)).toEqual([0, 1, 2, 3]);
    // andar fora do intervalo é encostado no válido mais próximo
    expect(buildRail(ROOMS, 99).current).toBe(3);
    expect(buildRail(ROOMS, -2).current).toBe(0);
    expect(buildRail([], 3).current).toBe(0);
  });

  it('conta a ocupação por status e escolhe a bolinha que mais pede atenção', () => {
    const m = buildRail(ROOMS, 0);
    const [ground, waiting, idle, empty] = m.floors;
    expect(ground).toMatchObject({ agents: 2, working: 2, waiting: 0, shell: 0, idle: 0, status: 'working' });
    expect(waiting).toMatchObject({ agents: 2, working: 0, waiting: 1, shell: 1, idle: 0, status: 'waiting' });
    expect(idle).toMatchObject({ agents: 1, idle: 1, status: 'idle' });
    expect(empty).toMatchObject({ agents: 0, status: 'empty' });
  });

  it('os rótulos acessíveis dizem o andar, o nome, quantos e o que fazem', () => {
    const m = buildRail(ROOMS, 0);
    expect(m.floors[0].ariaLabel).toBe('Térreo, Projeto Ipê, 2 agentes trabalhando');
    expect(m.floors[1].ariaLabel).toBe('Andar 1 de 4, Projeto Jade, 1 agente esperando você');
    expect(m.floors[2].ariaLabel).toBe('Andar 2 de 4, Projeto Aurora, 1 agente à toa');
    expect(m.floors[3].ariaLabel).toBe('Andar 3 de 4, Projeto Cedro, sem agentes');
  });
});

describe('status e ocupação (puros)', () => {
  it('o status desconhecido vira ocioso', () => {
    expect(normalizeStatus('working')).toBe('working');
    expect(normalizeStatus('waiting')).toBe('waiting');
    expect(normalizeStatus('shell')).toBe('shell');
    expect(normalizeStatus('idle')).toBe('idle');
    expect(normalizeStatus('done')).toBe('idle');
    expect(normalizeStatus('')).toBe('idle');
  });

  it('a bolinha prioriza esperando > trabalhando > terminal > à toa > vazio', () => {
    expect(floorStatus({ working: 1, waiting: 1, shell: 1, idle: 1 })).toBe('waiting');
    expect(floorStatus({ working: 1, waiting: 0, shell: 1, idle: 1 })).toBe('working');
    expect(floorStatus({ working: 0, waiting: 0, shell: 1, idle: 1 })).toBe('shell');
    expect(floorStatus({ working: 0, waiting: 0, shell: 0, idle: 1 })).toBe('idle');
    expect(floorStatus({ working: 0, waiting: 0, shell: 0, idle: 0 })).toBe('empty');
  });

  it('a frase de ocupação cobre singular, plural, mistura e vazio', () => {
    expect(occupancyText({ agents: 0, working: 0, waiting: 0, shell: 0, idle: 0 })).toBe('sem agentes');
    expect(occupancyText({ agents: 1, working: 1, waiting: 0, shell: 0, idle: 0 })).toBe('1 agente trabalhando');
    expect(occupancyText({ agents: 3, working: 3, waiting: 0, shell: 0, idle: 0 })).toBe('3 agentes trabalhando');
    expect(occupancyText({ agents: 2, working: 1, waiting: 1, shell: 0, idle: 0 })).toBe('1 trabalhando, 1 esperando');
    expect(occupancyText({ agents: 1, working: 0, waiting: 1, shell: 0, idle: 0 })).toBe('1 agente esperando você');
    expect(occupancyText({ agents: 1, working: 0, waiting: 0, shell: 1, idle: 0 })).toBe(
      '1 agente de olho no terminal',
    );
    expect(occupancyText({ agents: 1, working: 0, waiting: 0, shell: 0, idle: 1 })).toBe('1 agente à toa');
  });
});

describe('navegação do trilho', () => {
  it('clamp, subir e descer nunca passam dos limites', () => {
    expect(clampFloor(0, 3)).toBe(0);
    expect(clampFloor(2.9, 3)).toBe(2);
    expect(clampFloor(-1, 3)).toBe(0);
    expect(clampFloor(8, 3)).toBe(2);
    expect(clampFloor(Number.NaN, 3)).toBe(0);
    expect(clampFloor(1, 0)).toBe(0);
    expect(floorUp(0, 3)).toBe(1);
    expect(floorUp(2, 3)).toBe(2);
    expect(floorDown(2, 3)).toBe(1);
    expect(floorDown(0, 3)).toBe(0);
  });

  it('teclas: ↑/↓ andam um andar, Home/End vão ao topo e ao térreo, PageUp/PageDown cinco', () => {
    expect(nextFloor(0, 6, 'ArrowUp')).toBe(1);
    expect(nextFloor(1, 6, 'ArrowDown')).toBe(0);
    expect(nextFloor(2, 6, 'Home')).toBe(5);
    expect(nextFloor(2, 6, 'End')).toBe(0);
    expect(nextFloor(0, 9, 'PageUp')).toBe(5);
    expect(nextFloor(8, 9, 'PageDown')).toBe(3);
    expect(nextFloor(7, 9, 'PageUp')).toBe(8);
    expect(nextFloor(1, 9, 'PageDown')).toBe(0);
    expect(nextFloor(1, 6, 'Enter')).toBeNull();
    expect(nextFloor(1, 0, 'ArrowUp')).toBeNull();
    // sem andares, nenhuma tecla navega
    expect(nextFloor(0, 0, 'Home')).toBeNull();
  });
});
