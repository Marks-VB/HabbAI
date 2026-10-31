// Trilho de andares da visita (DOM sobre o canvas, no padrão de ui/drawer.ts): uma lista de andares
// com bolinha de status e contagem de agentes, o andar atual, teclado (↑/↓, Home/End, PageUp/PageDown)
// e anúncio por leitor de tela. O modelo é puro (world/floors/rail.ts); aqui é só a camada de DOM.
import { tr } from '../../../shared/i18n';
import {
  clampFloor,
  enterTarget,
  floorDown,
  floorUp,
  nextFloor,
  permissionBadgeText,
  permissionText,
  type RailModel,
} from '../world/floors/rail';
import { AnnouncementQueue } from './announce-queue';
import { h, setHidden, setText } from './dom';

export interface FloorRailOptions {
  /** O modelo agora (andares na ordem do pacote + andar atual). */
  model(): RailModel;
  /** Troca de andar (o mundo valida e move o visitante). */
  go(floor: number): void;
  /** Andar atual no mundo. */
  current(): number;
  /** `Enter` num andar com alguém esperando permissão: abre o agente (a visita é só leitura, mas seleciona). */
  openAgent?(agentId: string): void;
  /** Esc no trilho: devolve o foco ao canvas do mundo. */
  focusWorld(): void;
}

export interface FloorRail {
  readonly el: HTMLElement;
  update(): void;
  destroy(): void;
}

const optionId = (floor: number) => `ui-floor-opt-${floor}`;

/** Monta o trilho; o chamador anexa `el` à camada da visita. */
export function mountFloorRail(o: FloorRailOptions): FloorRail {
  const live = h('div', { class: 'ui-sr', attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' } });
  let liveTimer: ReturnType<typeof setTimeout> | null = null;
  const say = (text: string) => {
    if (liveTimer) clearTimeout(liveTimer);
    live.textContent = '';
    liveTimer = setTimeout(() => {
      liveTimer = null;
      live.textContent = text;
    }, 30);
  };
  const queue = new AnnouncementQueue(say);

  const totalEl = h('span', { class: 'ui-floor-rail__total' });
  const head = h(
    'div',
    { class: 'ui-floor-rail__head' },
    h('span', { class: 'ui-floor-rail__title', text: tr('Andares') }),
    totalEl,
  );
  const list = h('div', {
    class: 'ui-floor-rail__list',
    attrs: { role: 'listbox', 'aria-label': tr('Andares do prédio'), 'aria-orientation': 'vertical', tabindex: '0' },
  });
  const up = h('button', {
    class: 'ui-floor-rail__step',
    type: 'button',
    text: '▲',
    title: tr('Andar acima'),
    attrs: { 'aria-label': tr('Andar acima') },
    on: { click: () => step(1) },
  });
  const down = h('button', {
    class: 'ui-floor-rail__step',
    type: 'button',
    text: '▼',
    title: tr('Andar abaixo'),
    attrs: { 'aria-label': tr('Andar abaixo') },
    on: { click: () => step(-1) },
  });
  const el = h(
    'nav',
    { class: 'ui-floor-rail', attrs: { 'aria-label': tr('Andares do prédio') } },
    head,
    list,
    h('div', { class: 'ui-floor-rail__steps' }, up, down),
    live,
  );

  /** Itens por andar (índice do andar -> elemento) e a assinatura das salas (para recriar só quando muda). */
  const items = new Map<
    number,
    { el: HTMLElement; dot: HTMLElement; label: HTMLElement; badge: HTMLElement; count: HTMLElement; sr: HTMLElement }
  >();
  let signature = '';
  let lastCurrent: number | null = null;
  let latest: RailModel = { floors: [], current: 0, total: 0 };

  function choose(floor: number): void {
    const next = clampFloor(floor, latest.total);
    list.focus({ preventScroll: true });
    if (next === o.current()) return;
    o.go(next);
    update();
  }

  function step(dir: 1 | -1): void {
    choose(dir > 0 ? floorUp(o.current(), latest.total) : floorDown(o.current(), latest.total));
  }

  function rebuild(model: RailModel): void {
    items.clear();
    const nodes: HTMLElement[] = [];
    // na tela o andar mais alto fica em cima: a lista do modelo é térreo-primeiro
    for (let i = model.floors.length - 1; i >= 0; i--) {
      const f = model.floors[i];
      const dot = h('span', { class: `ui-floor-rail__dot is-${f.status}`, attrs: { 'aria-hidden': 'true' } });
      const label = h('span', { class: 'ui-floor-rail__label', text: f.label });
      // o selo de permissão: o número é informação, nunca só a cor (o aria-label do item diz o resto)
      const badge = h('span', { class: 'ui-floor-rail__badge', hidden: true, attrs: { 'aria-hidden': 'true' } });
      const count = h('span', { class: 'ui-floor-rail__count', text: String(f.agents) });
      // o mesmo aviso em texto oculto, para a lista não depender do selo visual
      const sr = h('span', { class: 'ui-sr' });
      const item = h(
        'div',
        {
          class: 'ui-floor-rail__option',
          attrs: { role: 'option', id: optionId(f.index), 'aria-selected': 'false', 'aria-label': f.ariaLabel },
          on: { click: () => choose(f.index) },
        },
        dot,
        label,
        badge,
        count,
        sr,
      );
      items.set(f.index, { el: item, dot, label, badge, count, sr });
      nodes.push(item);
    }
    list.replaceChildren(...nodes);
  }

  function update(): void {
    const model = o.model();
    latest = model;
    const total = model.total;
    setHidden(el, total <= 0);
    setText(totalEl, total <= 0 ? '' : total === 1 ? tr('1 andar') : tr('{0} andares', [total]));
    const current = clampFloor(model.current, total);
    const sig = model.floors.map((f) => `${f.index}:${f.roomId}:${f.label}:${f.name}`).join('|');
    if (sig !== signature) {
      signature = sig;
      rebuild(model);
    }
    for (const f of model.floors) {
      const it = items.get(f.index);
      if (!it) continue;
      it.el.setAttribute('aria-label', f.ariaLabel);
      it.el.title = f.ariaLabel;
      it.el.setAttribute('aria-selected', String(f.index === current));
      it.el.classList.toggle('is-current', f.index === current);
      it.dot.className = `ui-floor-rail__dot is-${f.status}`;
      setText(it.label, f.label);
      setText(it.count, String(f.agents));
      const badge = permissionBadgeText(f.permissions);
      setHidden(it.badge, badge === null);
      setText(it.badge, badge ?? '');
      setText(it.sr, f.permissions > 0 ? permissionText(f.permissions) : '');
      it.el.classList.toggle('has-permission', f.permissions > 0);
      it.el.classList.toggle('is-empty', f.agents === 0);
    }
    if (total > 0) list.setAttribute('aria-activedescendant', optionId(current));
    else list.removeAttribute('aria-activedescendant');
    up.disabled = total <= 0 || current >= total - 1;
    down.disabled = total <= 0 || current <= 0;
    // o andar atual mudou (clique, tecla ou o visitante andando no poço): fala o rótulo novo
    if (lastCurrent !== null && current !== lastCurrent) {
      const f = model.floors[current];
      if (f) queue.push(f.ariaLabel);
    }
    lastCurrent = current;
    const active = items.get(current)?.el;
    if (active?.isConnected && typeof active.scrollIntoView === 'function')
      active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      o.focusWorld();
      return;
    }
    // Enter vai ao primeiro agente esperando permissão no andar atual; sem ninguém, só garante o andar (sem selecionar)
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const target = enterTarget(latest, o.current());
      if (target && o.openAgent) {
        if (target.floor !== o.current()) choose(target.floor);
        o.openAgent(target.agentId);
      } else {
        choose(o.current());
      }
      return;
    }
    const next = nextFloor(o.current(), latest.total, e.key);
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    if (next !== o.current()) choose(next);
  };
  list.addEventListener('keydown', onKey);
  // Esc também devolve o foco quando ele está nos botões ▲/▼ (o resto do teclado é da lista)
  const onRailKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    o.focusWorld();
  };
  el.addEventListener('keydown', onRailKey);

  update();

  return {
    el,
    update,
    destroy() {
      list.removeEventListener('keydown', onKey);
      el.removeEventListener('keydown', onRailKey);
      queue.clear();
      if (liveTimer) clearTimeout(liveTimer);
      el.remove();
    },
  };
}
