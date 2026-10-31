import { describe, expect, it } from 'vitest';
import { navigationOrder, nextNavIndex, type NavAgent, type NavRoom } from './nav';

const rooms: NavRoom[] = [
  { id: 'b', name: 'Beta', slot: 2 },
  { id: 'a', name: 'Alfa', slot: 1 },
  { id: 'sem-vaga', name: 'Omega' },
];

function agent(id: string, name: string, roomId: string, status: NavAgent['status'] = 'working'): NavAgent {
  return { id, name, roomId, status };
}

describe('ordem dos agentes para a navegação', () => {
  it('percorre por sala (ordem de chegada) e depois por nome', () => {
    const order = navigationOrder(
      [
        agent('1', 'Zeca', 'b'),
        agent('2', 'Ana', 'b'),
        agent('3', 'Bruno', 'a'),
        agent('4', 'Caio', 'a'),
        agent('5', 'Dora', 'sem-vaga'),
      ],
      rooms,
    );
    expect(order.map((a) => a.name)).toEqual(['Bruno', 'Caio', 'Ana', 'Zeca', 'Dora']);
  });

  it('ignora quem está saindo do escritório', () => {
    const order = navigationOrder([agent('1', 'Ana', 'a'), agent('2', 'Bruno', 'a', 'offline')], rooms);
    expect(order.map((a) => a.name)).toEqual(['Ana']);
  });

  it('não muda a lista recebida e mantém a ordem original em caso de empate', () => {
    const input = [agent('2', 'Ana', 'a'), agent('1', 'Ana', 'a')];
    const order = navigationOrder(input, rooms);
    expect(order.map((a) => a.id)).toEqual(['2', '1']);
    expect(input.map((a) => a.id)).toEqual(['2', '1']);
  });

  it('sem salas conhecidas, usa só o nome', () => {
    const order = navigationOrder([agent('1', 'Zeca', 'x'), agent('2', 'Ana', 'y')], []);
    expect(order.map((a) => a.name)).toEqual(['Ana', 'Zeca']);
  });

  it('no escritório em andares, a sala vale pelo andar (e não pelo slot de chegada)', () => {
    const stacked: NavRoom[] = [
      { id: 't', name: 'Térreo', slot: 2, floor: 0 },
      { id: 'c', name: 'Projeto C', slot: 0, floor: 2 },
      { id: 'a', name: 'Projeto A', slot: 1, floor: 1 },
    ];
    const order = navigationOrder([agent('1', 'Zeca', 'c'), agent('2', 'Ana', 't'), agent('3', 'Bruno', 'a')], stacked);
    // térreo primeiro, depois andar 1 e andar 2, mesmo com slots fora de ordem
    expect(order.map((a) => a.name)).toEqual(['Ana', 'Bruno', 'Zeca']);
  });
});

describe('passo das setas na lista', () => {
  it('setas para a direita/baixo avançam e voltam ao começo no fim', () => {
    expect(nextNavIndex(null, 3, 'ArrowRight')).toBe(0);
    expect(nextNavIndex(null, 3, 'ArrowDown')).toBe(0);
    expect(nextNavIndex(0, 3, 'ArrowRight')).toBe(1);
    expect(nextNavIndex(1, 3, 'ArrowDown')).toBe(2);
    expect(nextNavIndex(2, 3, 'ArrowRight')).toBe(0);
  });

  it('setas para a esquerda/cima voltam e dão a volta no começo', () => {
    expect(nextNavIndex(null, 3, 'ArrowLeft')).toBe(2);
    expect(nextNavIndex(null, 3, 'ArrowUp')).toBe(2);
    expect(nextNavIndex(0, 3, 'ArrowLeft')).toBe(2);
    expect(nextNavIndex(2, 3, 'ArrowUp')).toBe(1);
  });

  it('Home e End vão ao primeiro e ao último', () => {
    expect(nextNavIndex(1, 3, 'Home')).toBe(0);
    expect(nextNavIndex(1, 3, 'End')).toBe(2);
  });

  it('lista vazia ou tecla que não navega: null', () => {
    expect(nextNavIndex(null, 0, 'ArrowRight')).toBeNull();
    expect(nextNavIndex(0, 3, 'Enter')).toBeNull();
    expect(nextNavIndex(0, 3, 'a')).toBeNull();
  });

  it('índice fora da lista entra pela ponta da tecla', () => {
    expect(nextNavIndex(-1, 3, 'ArrowRight')).toBe(0);
    expect(nextNavIndex(9, 3, 'ArrowLeft')).toBe(2);
  });
});
