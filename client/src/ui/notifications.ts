// Central de notificações (sino da barra superior): histórico local do que pediu a sua atenção (permissão, pergunta,
// fim de sessão), filtro de não lidas e a aba de preferências (tipos, silêncio, "só na janela do app" e projetos).
// Dados de GET /api/notifications e GET/PUT /api/notifications/prefs (server/notifications/http.ts); só pelo próprio
// computador. Novas notificações são anunciadas por aria-live; o foco volta ao sino ao fechar; o item tem aria-label.
import type { NotificationItem, NotificationPrefs, NotificationStatus, NotificationType } from '../../../shared/types';
import { tr } from '../../../shared/i18n';
import { access } from '../net/access';
import type { UiComponent, UiContext } from './context';
import { h, iconButton, setAttr, setHidden, setText, setTitle } from './dom';
import { formatInt, relativeTime } from './format';
import { ICONS } from './icons';
import { segmented, switchRow } from './settings';

export const NOTIFICATIONS_URL = '/api/notifications';
export const NOTIFICATION_PREFS_URL = '/api/notifications/prefs';
/** Intervalo do poll do sino (não lidas e itens novos). */
const POLL_MS = 20_000;
const PAGE_LIMIT = 200;
const PROJECT_MAX = 200;

const TYPES: readonly NotificationType[] = ['permission', 'question', 'session-end', 'waiting'];
const STATUSES: readonly NotificationStatus[] = ['new', 'read', 'resolved'];

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  permission: tr('Permissão'),
  question: tr('Pergunta'),
  'session-end': tr('Fim de sessão'),
  waiting: tr('Aguardando'),
};

const TYPE_HINTS: Record<NotificationType, string> = {
  permission: tr('Pedido de permissão para usar uma ferramenta'),
  question: tr('Pergunta do agente esperando resposta'),
  'session-end': tr('Quando uma sessão termina'),
  waiting: tr('Agente esperando sem pedido de permissão'),
};

function rec(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function str(v: unknown, max = 240): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;
}

function boolMap(raw: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  const o = rec(raw);
  if (!o) return out;
  for (const [key, value] of Object.entries(o)) {
    const k = key.trim();
    if (k && k.length <= PROJECT_MAX && typeof value === 'boolean') out[k] = value;
  }
  return out;
}

/** Preferências padrão da interface (o servidor manda as de verdade; estas cobrem resposta antiga/incompleta). */
export function defaultClientPrefs(): NotificationPrefs {
  return {
    types: { permission: true, question: true, 'session-end': true, waiting: true },
    quiet: { enabled: false, start: '22:00', end: '07:00' },
    appWindowOnly: false,
    projects: {},
    accounts: {},
    tools: {},
  };
}

/** Um item válido da resposta de /api/notifications (o resto é ignorado). */
export function parseNotificationItem(raw: unknown): NotificationItem | undefined {
  const o = rec(raw);
  if (!o) return undefined;
  const id = str(o.id, 80);
  const at = typeof o.at === 'number' && Number.isFinite(o.at) ? o.at : undefined;
  const title = str(o.title, 120);
  const type = TYPES.includes(o.type as NotificationType) ? (o.type as NotificationType) : undefined;
  const status = STATUSES.includes(o.status as NotificationStatus) ? (o.status as NotificationStatus) : undefined;
  if (!id || at === undefined || !title || !type || !status) return undefined;
  const item: NotificationItem = { id, at, type, status, title };
  const summary = str(o.summary);
  const agentId = str(o.agentId);
  const agentName = str(o.agentName, 120);
  const account = str(o.account);
  const project = str(o.project);
  const tool = str(o.tool);
  if (summary) item.summary = summary;
  if (agentId) item.agentId = agentId;
  if (agentName) item.agentName = agentName;
  if (account) item.account = account;
  if (project) item.project = project;
  if (tool) item.tool = tool;
  return item;
}

export interface NotificationsPayload {
  notifications: NotificationItem[];
  unread: number;
  total: number;
  quiet: boolean;
}

/** Valida a resposta de GET /api/notifications (do mais novo para o mais antigo). */
export function parseNotifications(raw: unknown): NotificationsPayload {
  const o = rec(raw);
  const list = Array.isArray(o?.notifications) ? o.notifications : [];
  const notifications = list
    .map(parseNotificationItem)
    .filter((n): n is NotificationItem => !!n)
    .sort((a, b) => b.at - a.at);
  const unread =
    typeof o?.unread === 'number' && Number.isFinite(o.unread)
      ? Math.max(0, Math.floor(o.unread))
      : notifications.filter((n) => n.status === 'new').length;
  const total =
    typeof o?.total === 'number' && Number.isFinite(o.total)
      ? Math.max(notifications.length, Math.floor(o.total))
      : notifications.length;
  return { notifications, unread, total, quiet: o?.quiet === true };
}

/** Valida as preferências recebidas do servidor; undefined = resposta sem o formato esperado. */
export function parseNotificationPrefs(raw: unknown): NotificationPrefs | undefined {
  const o = rec(raw);
  if (!o) return undefined;
  const types = rec(o.types);
  const quiet = rec(o.quiet);
  if (!types || !quiet || typeof quiet.enabled !== 'boolean' || typeof o.appWindowOnly !== 'boolean') return undefined;
  const out = defaultClientPrefs();
  for (const type of TYPES) {
    if (typeof types[type] === 'boolean') out.types[type] = types[type];
  }
  const start = str(quiet.start, 5);
  const end = str(quiet.end, 5);
  if (start) out.quiet.start = start;
  if (end) out.quiet.end = end;
  out.quiet.enabled = quiet.enabled;
  out.appWindowOnly = o.appWindowOnly;
  out.projects = boolMap(o.projects);
  out.accounts = boolMap(o.accounts);
  out.tools = boolMap(o.tools);
  return out;
}

/** Nome curto do projeto (última pasta do caminho). */
export function projectLabel(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

/** Itens que o filtro mostra (o servidor manda todos; o filtro de não lidas é local). */
export function filterNotifications(list: readonly NotificationItem[], filter: 'all' | 'unread'): NotificationItem[] {
  return filter === 'unread' ? list.filter((n) => n.status === 'new') : list.slice();
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export class NotificationsPanel implements UiComponent {
  readonly el: HTMLElement;
  /** Botão do sino (index.ts o coloca no grupo dos painéis). */
  readonly button: HTMLButtonElement;
  private readonly badge: HTMLElement;
  private readonly headCount: HTMLElement;
  private readonly live: HTMLElement;
  private readonly listEl: HTMLElement;
  private readonly stateEl: HTMLElement;
  private readonly stateText: HTMLElement;
  private readonly retryBtn: HTMLButtonElement;
  private readonly footEl: HTMLElement;
  private readonly markAllBtn: HTMLButtonElement;
  private readonly prefsPanel: HTMLElement;
  private readonly prefsBody: HTMLElement;
  private readonly prefsState: HTMLElement;
  private readonly listPanel: HTMLElement;
  private readonly tabList: HTMLButtonElement;
  private readonly tabPrefs: HTMLButtonElement;
  private readonly filterSeg: ReturnType<typeof segmented>;
  private items: NotificationItem[] = [];
  private unread = 0;
  private total = 0;
  private quietNow = false;
  private filter: 'all' | 'unread' = 'all';
  private tab: 'list' | 'prefs' = 'list';
  private state: LoadState = 'idle';
  private error = '';
  private loading = false;
  private prefs: NotificationPrefs | null = null;
  private prefsError = '';
  private prefsLoading = false;
  private prefsBuilt = false;
  private known = new Set<string>();
  private hadLoad = false;
  private drawn = '';
  private closedAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly ctx: UiContext) {
    this.badge = h('span', { class: 'ui-notif-badge', hidden: true, attrs: { 'aria-hidden': 'true' } });
    this.button = iconButton(ICONS.bell, tr('Notificações'), () => this.toggle(), 'ui-btn-notif');
    this.button.setAttribute('aria-haspopup', 'dialog');
    this.button.setAttribute('aria-expanded', 'false');
    this.button.append(this.badge);

    const close = iconButton(ICONS.close, tr('Fechar notificações'), () => this.hide(), 'ui-icon-btn--sm');
    this.headCount = h('span', { class: 'ui-notif__count' });
    this.live = h('p', { class: 'ui-sr', attrs: { role: 'status', 'aria-live': 'polite' } });

    this.tabList = h('button', {
      class: 'ui-seg__opt',
      type: 'button',
      role: 'tab',
      text: tr('Notificações'),
      attrs: { 'aria-selected': 'true', 'aria-controls': 'ui-notif-list' },
    });
    this.tabPrefs = h('button', {
      class: 'ui-seg__opt',
      type: 'button',
      role: 'tab',
      text: tr('Preferências'),
      attrs: { 'aria-selected': 'false', 'aria-controls': 'ui-notif-prefs' },
    });
    this.tabList.addEventListener('click', () => this.setTab('list'));
    this.tabPrefs.addEventListener('click', () => this.setTab('prefs'));
    const tabs = h(
      'div',
      { class: 'ui-seg ui-notif__tabs', role: 'tablist', attrs: { 'aria-label': tr('Central de notificações') } },
      this.tabList,
      this.tabPrefs,
    );

    this.filterSeg = segmented<'all' | 'unread'>(
      tr('Filtrar notificações'),
      [
        ['all', tr('Todas')],
        ['unread', tr('Não lidas')],
      ],
      (v) => {
        this.filter = v;
        this.renderList();
      },
    );

    this.stateText = h('span');
    this.retryBtn = h('button', {
      class: 'ui-link-btn',
      type: 'button',
      text: tr('Tentar de novo'),
      hidden: true,
      on: { click: () => void this.load() },
    });
    this.stateEl = h('p', { class: 'ui-hist__state', role: 'status' }, this.stateText, this.retryBtn);

    this.listEl = h('ul', { class: 'ui-notif__list', attrs: { 'aria-label': tr('Notificações') } });
    this.listEl.addEventListener('keydown', (e) => this.onListKey(e));
    this.markAllBtn = h('button', {
      class: 'ui-btn ui-btn--sm',
      type: 'button',
      text: tr('Marcar todas como lidas'),
      on: { click: () => void this.markAllRead() },
    });
    this.footEl = h('p', { class: 'ui-notif__foot' });
    this.listPanel = h(
      'section',
      { class: 'ui-notif__panel', attrs: { id: 'ui-notif-list', role: 'tabpanel', 'aria-label': tr('Notificações') } },
      h('div', { class: 'ui-notif__toolbar' }, this.filterSeg.row, this.markAllBtn),
      this.stateEl,
      this.listEl,
      this.footEl,
    );

    this.prefsState = h('p', { class: 'ui-notif__prefs-state', attrs: { role: 'status', 'aria-live': 'polite' } });
    this.prefsBody = h('div', { class: 'ui-notif__prefs' });
    this.prefsPanel = h(
      'section',
      {
        class: 'ui-notif__panel',
        attrs: {
          id: 'ui-notif-prefs',
          role: 'tabpanel',
          'aria-label': tr('Preferências de notificação'),
          hidden: true,
        },
      },
      this.prefsState,
      this.prefsBody,
    );

    this.el = h(
      'div',
      {
        class: 'ui-popover ui-notif',
        role: 'dialog',
        tabIndex: -1,
        attrs: { 'aria-label': tr('Central de notificações'), id: 'ui-notifications', popover: 'auto' },
      },
      h('div', { class: 'ui-popover__head' }, h('h2', { text: tr('Notificações') }), this.headCount, close),
      h('p', {
        class: 'ui-notif__hint',
        text: tr('O que pediu a sua atenção: permissões, perguntas e fins de sessão. Só neste computador.'),
      }),
      tabs,
      this.listPanel,
      this.prefsPanel,
      this.live,
    );
    this.el.addEventListener('toggle', () => {
      const open = this.isOpen;
      setAttr(this.button, 'aria-expanded', String(open));
      this.button.classList.toggle('is-on', open);
      if (open) return;
      this.closedAt = performance.now();
      // Foco devolvido ao sino (light dismiss e Esc também passam por aqui).
      const active = document.activeElement;
      if (!active || active === document.body || this.el.contains(active)) this.button.focus();
    });
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.hide();
      }
    });

    // O sino acompanha o servidor mesmo fechado: o contador de não lidas aparece sem abrir o painel.
    setInterval(() => {
      if (!document.hidden && this.available) void this.load();
    }, POLL_MS);
  }

  get isOpen(): boolean {
    try {
      return this.el.matches(':popover-open');
    } catch {
      return this.el.classList.contains('is-open');
    }
  }

  private get available(): boolean {
    return !this.ctx.store.mock && !this.ctx.store.replaying && access().notifications === true;
  }

  toggle(): void {
    if (this.isOpen) return this.hide();
    if (!this.available) {
      this.ctx.announce(tr('A central de notificações só abre pelo próprio computador.'));
      return;
    }
    if (performance.now() - this.closedAt < 250) return;
    const r = this.button.getBoundingClientRect();
    this.el.style.top = `${Math.round(r.bottom + 8)}px`;
    this.el.style.right = `${Math.max(8, Math.round(innerWidth - r.right - 4))}px`;
    if (typeof this.el.showPopover === 'function') this.el.showPopover();
    else this.el.classList.add('is-open');
    setAttr(this.button, 'aria-expanded', 'true');
    this.button.classList.add('is-on');
    this.el.focus();
    void this.load();
    void this.loadPrefs();
    this.renderList();
  }

  hide(): void {
    if (typeof this.el.hidePopover === 'function' && this.isOpen) this.el.hidePopover();
    this.el.classList.remove('is-open');
    setAttr(this.button, 'aria-expanded', 'false');
    this.button.classList.remove('is-on');
  }

  render(): void {
    const available = this.available;
    setHidden(this.button, !available);
    setTitle(this.button, available ? tr('Notificações') : tr('Notificações: só pelo próprio computador'));
    setAttr(
      this.button,
      'aria-label',
      this.unread > 0 ? tr('Notificações: {0} não lidas', [formatInt(this.unread)]) : tr('Notificações'),
    );
    setHidden(this.badge, this.unread === 0);
    setText(this.badge, this.unread > 99 ? '99+' : formatInt(this.unread));
    if (!available && this.isOpen) this.hide();
    setText(this.headCount, this.unread > 0 ? tr('{0} não lidas', [formatInt(this.unread)]) : '');
    this.markAllBtn.disabled = this.unread === 0;
    this.filterSeg.set(this.filter);
    if (this.isOpen && this.tab === 'list') this.renderList();
  }

  private setTab(tab: 'list' | 'prefs'): void {
    this.tab = tab;
    const list = tab === 'list';
    setAttr(this.tabList, 'aria-selected', String(list));
    setAttr(this.tabPrefs, 'aria-selected', String(!list));
    this.tabList.tabIndex = list ? 0 : -1;
    this.tabPrefs.tabIndex = list ? -1 : 0;
    setHidden(this.listPanel, !list);
    setHidden(this.prefsPanel, list);
    if (list) this.renderList();
    else if (!this.prefs) void this.loadPrefs();
  }

  private async load(): Promise<void> {
    if (!this.available || this.loading) return;
    this.loading = true;
    if (!this.items.length) this.state = 'loading';
    this.renderList();
    try {
      const headers = { Accept: 'application/json' };
      const res = await fetch(`${NOTIFICATIONS_URL}?filter=all&limit=${PAGE_LIMIT}`, { headers, cache: 'no-store' });
      if (!res.ok) {
        this.error =
          res.status === 403
            ? tr('A central de notificações só abre pelo próprio computador.')
            : tr('Não foi possível carregar as notificações.');
        this.state = 'error';
      } else {
        const payload = parseNotifications(await res.json());
        const fresh = this.hadLoad
          ? payload.notifications.filter((n) => n.status === 'new' && !this.known.has(n.id))
          : [];
        this.items = payload.notifications;
        this.unread = payload.unread;
        this.total = payload.total;
        this.quietNow = payload.quiet;
        this.state = 'ready';
        this.error = '';
        if (fresh.length) this.announceNew(fresh);
        this.known = new Set(payload.notifications.map((n) => n.id));
        this.hadLoad = true;
      }
    } catch {
      this.error = tr('Não foi possível falar com o servidor.');
      this.state = this.items.length ? 'ready' : 'error';
    } finally {
      this.loading = false;
      this.renderList();
    }
  }

  private announceNew(fresh: readonly NotificationItem[]): void {
    const text =
      fresh.length === 1
        ? tr('Nova notificação: {0}', [fresh[0].title])
        : tr('{0} novas notificações', [formatInt(fresh.length)]);
    this.live.textContent = text;
    this.ctx.announce(text);
  }

  private renderList(): void {
    const shown = filterNotifications(this.items, this.filter);
    let stateText = '';
    if (this.state === 'error') stateText = this.error || tr('Não foi possível carregar as notificações.');
    else if (this.state === 'loading' && !this.items.length) stateText = tr('Carregando as notificações…');
    else if (!this.total) stateText = tr('Nenhuma notificação ainda.');
    else if (!shown.length) stateText = tr('Nenhuma notificação não lida.');
    setText(this.stateText, stateText);
    setHidden(this.stateEl, !stateText);
    setHidden(this.retryBtn, this.state !== 'error');
    setText(this.footEl, this.quietNow ? tr('Horário de silêncio: os alertas externos ficam guardados só aqui.') : '');
    setHidden(this.footEl, !this.quietNow);

    const sig = JSON.stringify([
      this.filter,
      shown.map((n) => [n.id, n.status, n.at, n.title, n.summary, relativeTime(n.at, this.ctx.now())]),
    ]);
    if (sig === this.drawn) return;
    const focused = (document.activeElement as HTMLElement | null)?.dataset?.notification;
    this.drawn = sig;
    const now = this.ctx.now();
    const frag = document.createDocumentFragment();
    for (const item of shown) frag.append(this.item(item, now));
    this.listEl.replaceChildren(frag);
    setHidden(this.listEl, shown.length === 0);
    if (focused) this.listEl.querySelector<HTMLButtonElement>(`[data-notification="${CSS.escape(focused)}"]`)?.focus();
  }

  private item(n: NotificationItem, now: number): HTMLElement {
    const type = NOTIFICATION_TYPE_LABELS[n.type];
    const isNew = n.status === 'new';
    const status = n.status === 'new' ? tr('não lida') : n.status === 'resolved' ? tr('resolvida') : tr('lida');
    const when = relativeTime(n.at, now);
    const project = n.project ? projectLabel(n.project) : '';
    const summary = n.summary ?? '';
    const btn = h(
      'button',
      {
        class: `ui-notif__item is-${n.type}${isNew ? ' is-new' : ''}`,
        type: 'button',
        attrs: { 'aria-disabled': isNew ? undefined : 'true' },
      },
      h('span', { class: `ui-notif__dot is-${n.type}`, attrs: { 'aria-hidden': 'true' } }),
      h(
        'span',
        { class: 'ui-notif__text' },
        h(
          'span',
          { class: 'ui-notif__meta' },
          h('span', { class: 'ui-notif__type', text: type }),
          project ? h('span', { class: 'ui-notif__project', text: project }) : null,
        ),
        h('span', { class: 'ui-notif__title', text: n.title }),
        summary ? h('span', { class: 'ui-notif__summary', text: summary }) : null,
      ),
      h('span', { class: 'ui-notif__when', text: when }),
    );
    btn.dataset.notification = n.id;
    setAttr(
      btn,
      'aria-label',
      tr('{0}: {1}. {2}. {3}. {4}', [type, n.title, summary || tr('sem resumo'), when, status]),
    );
    setTitle(
      btn,
      [
        n.title,
        summary,
        n.tool ? tr('Ferramenta: {0}', [n.tool]) : '',
        n.project ?? '',
        isNew ? tr('Clique para marcar como lida') : status,
      ]
        .filter(Boolean)
        .join('\n'),
    );
    if (isNew) btn.addEventListener('click', () => void this.markRead(n));
    return h('li', { class: 'ui-notif__row' }, btn);
  }

  private async markRead(item: NotificationItem): Promise<void> {
    if (item.status !== 'new' || !this.available) return;
    try {
      const res = await fetch(`${NOTIFICATIONS_URL}/${encodeURIComponent(item.id)}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { unread?: unknown };
      item.status = 'read';
      this.unread = typeof body.unread === 'number' ? body.unread : Math.max(0, this.unread - 1);
      this.drawn = '';
      this.renderList();
      this.ctx.announce(tr('Notificação marcada como lida.'));
    } catch {
      this.error = tr('Não foi possível marcar a notificação como lida.');
      this.state = 'error';
      this.renderList();
    }
  }

  private async markAllRead(): Promise<void> {
    if (!this.available || this.unread === 0) return;
    try {
      const res = await fetch(`${NOTIFICATIONS_URL}/read-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) throw new Error(String(res.status));
      for (const item of this.items) if (item.status === 'new') item.status = 'read';
      this.unread = 0;
      this.drawn = '';
      this.renderList();
      this.ctx.announce(tr('Todas as notificações foram marcadas como lidas.'));
    } catch {
      this.error = tr('Não foi possível marcar as notificações como lidas.');
      this.state = 'error';
      this.renderList();
    }
  }

  private async loadPrefs(): Promise<void> {
    if (!this.available || this.prefsLoading) return;
    this.prefsLoading = true;
    this.prefsError = '';
    setText(this.prefsState, tr('Carregando as preferências…'));
    try {
      const res = await fetch(NOTIFICATION_PREFS_URL, { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { prefs?: unknown; quiet?: unknown };
      const prefs = parseNotificationPrefs(body.prefs);
      if (!prefs) throw new Error('formato');
      this.prefs = prefs;
      this.quietNow = body.quiet === true;
      this.prefsBuilt = false;
      setText(this.prefsState, '');
      this.buildPrefs();
    } catch {
      this.prefsError = tr('Não foi possível carregar as preferências.');
      setText(this.prefsState, this.prefsError);
    } finally {
      this.prefsLoading = false;
    }
  }

  private buildPrefs(): void {
    const prefs = this.prefs;
    if (!prefs || this.prefsBuilt) return;
    this.prefsBuilt = true;
    const typeRows: HTMLElement[] = [];
    for (const type of TYPES) {
      const row = switchRow(NOTIFICATION_TYPE_LABELS[type], TYPE_HINTS[type], () => {
        prefs.types[type] = !prefs.types[type];
        setAttr(row.btn, 'aria-checked', String(prefs.types[type]));
      });
      setAttr(row.btn, 'aria-checked', String(prefs.types[type]));
      typeRows.push(row.row);
    }

    const quietRow = switchRow(
      tr('Horário de silêncio'),
      tr('Dentro da janela, os alertas externos ficam guardados só aqui.'),
      () => {
        prefs.quiet.enabled = !prefs.quiet.enabled;
        setAttr(quietRow.btn, 'aria-checked', String(prefs.quiet.enabled));
      },
    );
    setAttr(quietRow.btn, 'aria-checked', String(prefs.quiet.enabled));
    const start = h('input', {
      class: 'ui-notif__time',
      type: 'time',
      attrs: { 'aria-label': tr('Início do silêncio'), value: prefs.quiet.start },
    }) as HTMLInputElement;
    const end = h('input', {
      class: 'ui-notif__time',
      type: 'time',
      attrs: { 'aria-label': tr('Fim do silêncio'), value: prefs.quiet.end },
    }) as HTMLInputElement;
    start.addEventListener('change', () => {
      if (start.value) prefs.quiet.start = start.value;
    });
    end.addEventListener('change', () => {
      if (end.value) prefs.quiet.end = end.value;
    });
    const quietTimes = h(
      'div',
      { class: 'ui-notif__times' },
      h('label', { class: 'ui-notif__time-label' }, h('span', { text: tr('De') }), start),
      h('label', { class: 'ui-notif__time-label' }, h('span', { text: tr('Até') }), end),
    );

    const windowRow = switchRow(
      tr('Só na janela do app'),
      tr('Só manda alerta externo com o HabbAI aberto numa aba. O histórico continua aqui.'),
      () => {
        prefs.appWindowOnly = !prefs.appWindowOnly;
        setAttr(windowRow.btn, 'aria-checked', String(prefs.appWindowOnly));
      },
    );
    setAttr(windowRow.btn, 'aria-checked', String(prefs.appWindowOnly));

    const projects = [...new Set(this.items.map((n) => n.project).filter((p): p is string => !!p))].sort();
    const projectRows: HTMLElement[] = projects.map((project) => {
      const input = h('input', { class: 'ui-notif__check-input', type: 'checkbox' }) as HTMLInputElement;
      input.checked = prefs.projects[project] !== false;
      input.addEventListener('change', () => {
        prefs.projects[project] = input.checked;
      });
      const row = h(
        'label',
        { class: 'ui-notif__check' },
        input,
        h(
          'span',
          { class: 'ui-notif__check-text' },
          h('span', { class: 'ui-notif__check-name', text: projectLabel(project) }),
          h('span', { class: 'ui-notif__check-path', text: project }),
        ),
      );
      setTitle(row, project);
      return row;
    });

    const save = h('button', {
      class: 'ui-btn ui-btn--primary',
      type: 'button',
      text: tr('Salvar preferências'),
      on: { click: () => void this.savePrefs() },
    });
    this.prefsBody.replaceChildren(
      h('div', { class: 'ui-set-group' }, h('h3', { text: tr('Tipos') }), ...typeRows),
      h('div', { class: 'ui-set-group' }, h('h3', { text: tr('Silêncio') }), quietRow.row, quietTimes),
      h('div', { class: 'ui-set-group' }, windowRow.row),
      h(
        'div',
        { class: 'ui-set-group' },
        h('h3', { text: tr('Projetos') }),
        h('p', {
          class: 'ui-set__hint',
          text: tr('Desligar um projeto vale para os alertas externos; o histórico continua aqui.'),
        }),
        ...(projectRows.length
          ? projectRows
          : [h('p', { class: 'ui-set__hint', text: tr('Nenhum projeto nas notificações ainda.') })]),
      ),
      h('div', { class: 'ui-notif__save' }, save),
    );
    setText(
      this.prefsState,
      this.quietNow ? tr('Horário de silêncio agora: nada sai para o webhook ou o Telegram.') : '',
    );
  }

  private async savePrefs(): Promise<void> {
    const prefs = this.prefs;
    if (!prefs || !this.available) return;
    setText(this.prefsState, tr('Salvando as preferências…'));
    try {
      const res = await fetch(NOTIFICATION_PREFS_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { prefs?: unknown; quiet?: unknown };
      this.prefs = parseNotificationPrefs(body.prefs) ?? prefs;
      this.quietNow = body.quiet === true;
      this.prefsBuilt = false;
      this.buildPrefs();
      setText(this.prefsState, tr('Preferências salvas.'));
      this.ctx.announce(tr('Preferências salvas.'));
    } catch {
      setText(this.prefsState, tr('Não foi possível salvar as preferências.'));
      this.ctx.announce(tr('Não foi possível salvar as preferências.'));
    }
  }

  /** Setas, Home e End entre as notificações. */
  private onListKey(e: KeyboardEvent): void {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const items = [...this.listEl.querySelectorAll<HTMLButtonElement>('.ui-notif__item')];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? items.length - 1
          : Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
    items[next]?.focus();
  }
}
