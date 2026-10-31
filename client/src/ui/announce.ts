// Anúncios para leitor de tela: as transições do escritório que valem um aviso (um agente começou a esperar uma
// permissão, voltou a trabalhar, terminou; a conexão caiu) e uma fila que não deixa o leitor ser inundado.
// A decisão é uma função pura (`nextAnnouncements`), testada em ui/announce.test.ts; o DOM fica só na classe
// `LiveAnnouncer`, que usa o `announce()` do contexto (a região aria-live da interface).
import type { AgentInfo, AgentStatus, RoomInfo } from '../../../shared/types';
import type { ConnectionState } from '../net/store';
import type { UiContext } from './context';
import { AnnouncementQueue } from './announce-queue';
import { tr } from '../../../shared/i18n';

export { ANNOUNCE_INTERVAL_MS, ANNOUNCE_QUEUE_MAX, AnnouncementQueue } from './announce-queue';

export type AnnouncementKind = 'permission' | 'working' | 'done' | 'offline';

/** Uma transição a anunciar. O aviso de conexão não tem agente. */
export interface Announcement {
  kind: AnnouncementKind;
  agentName: string;
  roomName: string;
}

/** O que interessa de um agente entre dois snapshots. */
export interface AgentSignal {
  name: string;
  roomName: string;
  status: AgentStatus;
  /** Id do pedido de permissão pendente (null quando não há pedido). */
  permissionId: string | null;
}

export type SignalMap = ReadonlyMap<string, AgentSignal>;

/** Estado de uma leitura: os agentes e a conexão. */
export interface AnnounceState {
  agents: SignalMap;
  connection: ConnectionState;
}

/** Sinais dos agentes de um snapshot (nome da sala já resolvido, para o anúncio não depender do snapshot). */
export function signalsFrom(agents: readonly AgentInfo[], rooms: readonly RoomInfo[]): SignalMap {
  const roomNames = new Map(rooms.map((r) => [r.id, r.name]));
  return new Map(
    agents.map((a) => [
      a.id,
      {
        name: a.name,
        roomName: roomNames.get(a.roomId) ?? '',
        status: a.status,
        permissionId: a.permission?.id ?? null,
      } satisfies AgentSignal,
    ]),
  );
}

/**
 * Compara a leitura anterior com a nova e devolve o que anunciar (no máximo um aviso por agente) e o estado novo.
 * A primeira leitura (prev null) não anuncia nada: abrir a página não é uma transição. Quem entra no escritório
 * também não é anunciado, só quem muda de estado (sem inundar a abertura com todos os agentes).
 */
export function nextAnnouncements(prev: AnnounceState | null, next: AnnounceState): { events: Announcement[]; state: AnnounceState } {
  const events: Announcement[] = [];
  if (!prev) return { events, state: next };
  for (const [id, agent] of next.agents) {
    const before = prev.agents.get(id);
    if (!before) continue;
    const base = { agentName: agent.name, roomName: agent.roomName };
    if (agent.permissionId && agent.permissionId !== before.permissionId) {
      events.push({ kind: 'permission', ...base });
    } else if (before.status === 'waiting' && agent.status === 'working') {
      events.push({ kind: 'working', ...base });
    } else if (agent.status === 'done' && before.status !== 'done') {
      events.push({ kind: 'done', ...base });
    }
  }
  if (next.connection === 'closed' && prev.connection !== 'closed') {
    events.push({ kind: 'offline', agentName: '', roomName: '' });
  }
  return { events, state: next };
}

/** Texto do anúncio (PT, traduzido pelo tr()). */
export function formatAnnouncement(e: Announcement): string {
  const who = e.roomName ? tr('{0} ({1})', [e.agentName, e.roomName]) : e.agentName;
  switch (e.kind) {
    case 'permission':
      return tr('{0} está esperando você: pedido de permissão.', [who]);
    case 'working':
      return tr('{0} voltou a trabalhar.', [who]);
    case 'done':
      return tr('{0} terminou.', [who]);
    case 'offline':
      return tr('Sem conexão com o HabbAI: tentando reconectar.');
  }
}

/**
 * Liga os anúncios ao fluxo do store (snapshot e conexão). No timelapse o passado não vira aviso: o estado
 * acompanha em silêncio e a volta ao ao vivo também não dispara uma leva de anúncios atrasados.
 */
export class LiveAnnouncer {
  private state: AnnounceState | null = null;
  private readonly queue: AnnouncementQueue;
  private readonly off: (() => void)[] = [];
  private wasReplaying = false;

  constructor(private readonly ctx: Pick<UiContext, 'store' | 'announce'>) {
    this.queue = new AnnouncementQueue((text) => ctx.announce(text));
    const store = ctx.store;
    this.off.push(store.on('snapshot', () => this.refresh()), store.on('connection', () => this.refresh()));
    if (store.snapshot) this.refresh();
  }

  /** Para os testes e para o descarte da interface. */
  destroy(): void {
    for (const off of this.off) off();
    this.off.length = 0;
    this.queue.clear();
  }

  private refresh(): void {
    const store = this.ctx.store;
    const snap = store.snapshot;
    const next: AnnounceState = {
      agents: signalsFrom(snap?.agents ?? [], snap?.rooms ?? []),
      connection: store.connection,
    };
    const replaying = store.replaying;
    const { events, state } = nextAnnouncements(this.state, next);
    this.state = state;
    if (replaying || this.wasReplaying) {
      // Durante (e logo depois de) o timelapse só acompanha o estado: nada do passado é anunciado.
      this.wasReplaying = replaying;
      return;
    }
    for (const e of events) this.queue.push(formatAnnouncement(e));
  }
}
