import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentInfo, RoomInfo } from '../../../shared/types';
import type { ConnectionState, OfficeStore } from '../net/store';
import { AnnouncementQueue, formatAnnouncement, LiveAnnouncer, nextAnnouncements, signalsFrom, type AnnounceState } from './announce';

const rooms: RoomInfo[] = [{ id: 'r1', name: 'Projeto Alfa', path: 'C:\\alfa', slot: 1, seed: 1, createdAt: 0 }];

function agent(patch: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: 'a1',
    kind: 'main',
    roomId: 'r1',
    name: 'Marina',
    look: 'f',
    role: 'Agente principal',
    sessionId: 's1',
    account: '.claude',
    status: 'working',
    recent: [],
    tasks: [],
    startedAt: 0,
    lastEventAt: 0,
    statusSince: 0,
    stats: {} as AgentInfo['stats'],
    ...patch,
  } as AgentInfo;
}

function state(agents: AgentInfo[], connection: ConnectionState = 'open'): AnnounceState {
  return { agents: signalsFrom(agents, rooms), connection };
}

describe('decidir o que anunciar', () => {
  it('a primeira leitura não anuncia nada (abrir a página não é transição)', () => {
    const r = nextAnnouncements(null, state([agent()]));
    expect(r.events).toEqual([]);
  });

  it('pedido de permissão novo vira anúncio', () => {
    const prev = state([agent()]);
    const r = nextAnnouncements(prev, state([agent({ status: 'waiting', permission: { id: 'p1' } as AgentInfo['permission'] })]));
    expect(r.events).toEqual([{ kind: 'permission', agentName: 'Marina', roomName: 'Projeto Alfa' }]);
    expect(formatAnnouncement(r.events[0])).toBe('Marina (Projeto Alfa) está esperando você: pedido de permissão.');
  });

  it('o mesmo pedido visto de novo não repete o anúncio', () => {
    const waiting = agent({ status: 'waiting', permission: { id: 'p1' } as AgentInfo['permission'] });
    const prev = state([waiting]);
    expect(nextAnnouncements(prev, state([waiting])).events).toEqual([]);
  });

  it('voltou a trabalhar depois de esperar', () => {
    const prev = state([agent({ status: 'waiting', waitingFor: 'aprovar uma permissão' })]);
    const r = nextAnnouncements(prev, state([agent({ status: 'working' })]));
    expect(r.events.map((e) => e.kind)).toEqual(['working']);
    expect(formatAnnouncement(r.events[0])).toBe('Marina (Projeto Alfa) voltou a trabalhar.');
  });

  it('terminou (e só uma vez)', () => {
    const r = nextAnnouncements(state([agent()]), state([agent({ status: 'done' })]));
    expect(r.events.map((e) => e.kind)).toEqual(['done']);
    expect(formatAnnouncement(r.events[0])).toBe('Marina (Projeto Alfa) terminou.');
    expect(nextAnnouncements(state([agent({ status: 'done' })]), state([agent({ status: 'done' })])).events).toEqual([]);
  });

  it('quem chega no escritório não é anunciado', () => {
    const r = nextAnnouncements(state([agent()]), state([agent(), agent({ id: 'a2', name: 'Caio', permission: { id: 'p2' } as AgentInfo['permission'] })]));
    expect(r.events).toEqual([]);
  });

  it('quem sai do escritório não é anunciado', () => {
    const r = nextAnnouncements(state([agent(), agent({ id: 'a2', name: 'Caio' })]), state([agent()]));
    expect(r.events).toEqual([]);
  });

  it('no máximo um anúncio por agente na mesma leitura', () => {
    const waiting = agent({ status: 'waiting', permission: { id: 'p1' } as AgentInfo['permission'] });
    const r = nextAnnouncements(state([agent()]), state([waiting]));
    expect(r.events).toHaveLength(1);
  });

  it('queda de conexão é anunciada uma vez', () => {
    const prev = state([agent()], 'open');
    const r = nextAnnouncements(prev, state([agent()], 'closed'));
    expect(r.events).toEqual([{ kind: 'offline', agentName: '', roomName: '' }]);
    expect(formatAnnouncement(r.events[0])).toBe('Sem conexão com o HabbAI: tentando reconectar.');
    expect(nextAnnouncements(r.state, state([agent()], 'closed')).events).toEqual([]);
    expect(nextAnnouncements(state([agent()], 'open'), state([agent()], 'connecting')).events).toEqual([]);
  });

  it('sem sala conhecida, o anúncio fica só com o nome', () => {
    const lonely = agent({ roomId: 'outra' });
    const r = nextAnnouncements(state([agent({ roomId: 'outra' })]), state([agent({ roomId: 'outra', status: 'done' })]));
    expect(r.events[0]).toMatchObject({ agentName: lonely.name, roomName: '' });
    expect(formatAnnouncement(r.events[0])).toBe('Marina terminou.');
  });
});

describe('fila dos anúncios', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('o primeiro sai na hora e os outros esperam 2 s cada', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const said: string[] = [];
    const queue = new AnnouncementQueue((t) => said.push(t));
    queue.push('um');
    queue.push('dois');
    queue.push('três');
    expect(said).toEqual(['um']);
    expect(queue.size).toBe(2);
    vi.advanceTimersByTime(2_000);
    expect(said).toEqual(['um', 'dois']);
    vi.advanceTimersByTime(4_000);
    expect(said).toEqual(['um', 'dois', 'três']);
    expect(queue.size).toBe(0);
  });

  it('limita a fila: o excedente mais antigo é descartado', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const said: string[] = [];
    const queue = new AnnouncementQueue((t) => said.push(t));
    for (let i = 0; i < 30; i++) queue.push(`aviso ${i}`);
    expect(queue.size).toBe(20);
    expect(said).toEqual(['aviso 0']);
    vi.advanceTimersByTime(2_000);
    expect(said).toEqual(['aviso 0', 'aviso 10']);
  });

  it('clear() para a fila e o timer', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const said: string[] = [];
    const queue = new AnnouncementQueue((t) => said.push(t));
    queue.push('um');
    queue.push('dois');
    queue.clear();
    vi.advanceTimersByTime(10_000);
    expect(said).toEqual(['um']);
    expect(queue.size).toBe(0);
  });
});

describe('LiveAnnouncer ligado ao store', () => {
  it('anuncia a transição de uma leitura do store (sem DOM)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const listeners = new Map<string, Set<(v: unknown) => void>>();
    const store = {
      snapshot: { agents: [agent()], rooms } as OfficeStore['snapshot'],
      connection: 'open' as ConnectionState,
      replaying: false,
      on(event: string, cb: (v: unknown) => void) {
        const set = listeners.get(event) ?? new Set();
        set.add(cb);
        listeners.set(event, set);
        return () => void set.delete(cb);
      },
      emit(event: string) {
        for (const cb of listeners.get(event) ?? []) cb(undefined);
      },
    };
    const said: string[] = [];
    const announcer = new LiveAnnouncer({ store: store as unknown as OfficeStore, announce: (t: string) => said.push(t) });
    store.snapshot = { agents: [agent({ status: 'done' })], rooms } as OfficeStore['snapshot'];
    store.emit('snapshot');
    expect(said).toEqual(['Marina (Projeto Alfa) terminou.']);
    announcer.destroy();
    vi.useRealTimers();
  });

  it('não anuncia o passado durante o timelapse', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const listeners = new Map<string, Set<(v: unknown) => void>>();
    const store = {
      snapshot: { agents: [agent()], rooms } as OfficeStore['snapshot'],
      connection: 'open' as ConnectionState,
      replaying: false,
      on(event: string, cb: (v: unknown) => void) {
        const set = listeners.get(event) ?? new Set();
        set.add(cb);
        listeners.set(event, set);
        return () => void set.delete(cb);
      },
      emit(event: string) {
        for (const cb of listeners.get(event) ?? []) cb(undefined);
      },
    };
    const said: string[] = [];
    const announcer = new LiveAnnouncer({ store: store as unknown as OfficeStore, announce: (t: string) => said.push(t) });
    store.replaying = true;
    store.snapshot = { agents: [agent({ status: 'done' })], rooms } as OfficeStore['snapshot'];
    store.emit('snapshot');
    store.replaying = false;
    store.emit('snapshot');
    expect(said).toEqual([]);
    announcer.destroy();
    vi.useRealTimers();
  });
});
