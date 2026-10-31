// Mundo do escritório: liga a simulação (sim/), o desenho (render/), a câmera e a entrada,
// e implementa o contrato WorldApi consumido pela UI.
import * as artModule from '../art';
import { TILE, type ArtModule } from '../art/api';
import type { OfficeStore } from '../net/store';
import { DEFAULT_WORLD_OPTIONS, seasonalThemeFor, type Selection, type SocialEvent, type SoundCue, type WorldApi, type WorldOptions, type WorldPlayback } from './api';
import { loadWorldAssets, type WorldAssets } from './assets';
import { Camera, overviewFrame } from './camera';
import { createDebug, type WorldDebug } from './debug';
import { BUILDING_H, COL_W } from './constants';
import { RECEPTION_ID } from './layout/core';
import { inRect } from './layout/geometry';
import { attachInput, type Hit } from './input';
import { navigationOrder, nextNavIndex, statusText } from './nav';
import type { AgentInfo } from '../../../shared/types';
import { rebaseSnapshot } from './playback';
import { Overlay } from './render/overlay';
import { Renderer } from './render/renderer';
import { Sim, type VisitLight } from './sim/sim';
import { NO_INTENT, VISITOR_ID, visitorInfo, type VisitorIntent } from './sim/visitor';
import { SoundCues } from './sound-cues';
import { tr } from '../../../shared/i18n';

export * from './api';
export type { WorldDebug } from './debug';

const art: ArtModule = artModule;

/** O que a cena Visita usa do mundo dela (createWorld com `visit: true`). */
export interface VisitWorld {
  /** O meu personagem entra pelo elevador (null tira). */
  setVisitor(me: { name: string; look: 'f' | 'm'; parts?: AgentInfo['parts'] } | null): void;
  /** O teclado: para onde o visitante anda. */
  setIntent(intent: VisitorIntent): void;
  /** Luzes do prédio (apagado, discreto, ao vivo). */
  setLight(mode: VisitLight): void;
  /** Perto de um elevador, livre para sair? */
  atExit(): boolean;
  /** Anda até o elevador mais perto, entra e some; `done` quando a porta fecha. */
  exit(done: () => void): boolean;
  /** Posição do visitante na tela (px CSS), para a dica "Sair (E)"; null fora da tela ou sem visitante. */
  visitorScreen(): { x: number; y: number } | null;
  /** O quadro da parede da recepção na tela (px CSS): o lugar do quadro de carimbos da portaria; null fora da tela. */
  boardScreen(): { x: number; y: number; w: number; h: number } | null;
}

export interface CreateWorldOptions {
  /**
   * Visita a um prédio do mundo (cena Visita): `Sim` sem nada que dependa do tempo do status (SimMode.visit), o
   * visitante andando com o teclado e o clique (a câmera o segue) e as carteiras da vida social na chave `world:`.
   */
  visit?: boolean;
}

export function createWorld(canvas: HTMLCanvasElement, store: OfficeStore, o: CreateWorldOptions = {}): WorldApi & { debug: WorldDebug; visit: VisitWorld } {
  let options: WorldOptions = { ...DEFAULT_WORLD_OPTIONS };
  const visitMode = !!o.visit;
  const camera = new Camera();
  // Simulação e desenho são recriados quando o timelapse entra, pula ou sai (rebuild).
  let sim = new Sim(art, () => options, undefined, { visit: visitMode });
  let renderer = new Renderer(canvas, art, sim, camera);
  let overlay = new Overlay(renderer.ctx, sim, renderer, camera);
  let assets: WorldAssets | null = null;
  /** Timelapse ligado: relógio próprio do mundo (`worldNow`), acelerado pelo fator de animação. */
  let playback: WorldPlayback | null = null;
  let worldNow = 0;
  const selectCbs = new Set<(s: Selection) => void>();
  const hoverCbs = new Set<(id: string | null) => void>();
  const socialCbs = new Set<(e: SocialEvent) => void>();
  const soundCbs = new Set<(c: SoundCue) => void>();
  const roomMenuCbs = new Set<(roomId: string, at: { x: number; y: number }) => void>();
  const deskClickCbs = new Set<(roomId: string, folder?: string) => void>();
  let cues = new SoundCues(sim, camera);
  let selection: Selection = null;
  let hover: string | null = null;
  /** A seleção atual veio do teclado: além do anel do mouse, o agente selecionado ganha o anel de foco. */
  let navFocused = false;
  let mouse: { x: number; y: number } | null = null;
  let raf = 0;
  let lastTs = 0;
  let hiddenAt = 0;
  /** Escritório fora da tela (cidade aberta): sem laço de desenho nem teclado da câmera. */
  let suspended = false;
  let suspendedAt = 0;
  let userMoved = false;
  let framed = false;
  let lastCols = -1;
  const abort = new AbortController();

  // ------------------------------------------------------------------ leitor de tela
  // O canvas é um "application" com uma lista oculta de agentes (aria-owns): as setas percorrem a lista, Enter
  // abre os detalhes e Esc limpa a seleção. Quem recebeu o foco é anunciado pela região viva (aria-live).
  // Sem DOM (os testes do mundo rodam no Node) a navegação por teclado continua funcionando, sem a camada ARIA.

  const canUseDom =
    !visitMode &&
    typeof document !== 'undefined' &&
    typeof document.createElement === 'function' &&
    typeof canvas.setAttribute === 'function' &&
    typeof canvas.after === 'function';
  const a11y = canUseDom ? document.createElement('div') : null;
  const liveRegion = canUseDom ? document.createElement('div') : null;
  const worldHelp = canUseDom ? document.createElement('p') : null;
  if (a11y && liveRegion && worldHelp) {
    a11y.id = 'world-a11y';
    a11y.className = 'ui-sr';
    a11y.setAttribute('role', 'listbox');
    a11y.setAttribute('aria-label', tr('Agentes no escritório'));
    liveRegion.id = 'world-live';
    liveRegion.className = 'ui-sr';
    liveRegion.setAttribute('role', 'status');
    liveRegion.setAttribute('aria-live', 'polite');
    worldHelp.id = 'world-help';
    worldHelp.className = 'ui-sr';
    worldHelp.textContent = tr('Setas: percorrer os agentes. Enter: abrir os detalhes. Esc: limpar a seleção.');
    canvas.after(a11y, liveRegion, worldHelp);
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-label', tr('Escritório'));
    canvas.setAttribute('aria-describedby', 'world-help');
    canvas.setAttribute('aria-owns', 'world-a11y');
  }

  /** Id da opção oculta de um agente (só letras, números e `_`: o id do agente tem `:`). */
  const agentOptionId = (id: string) => `world-agent-${encodeURIComponent(id).replace(/%/g, '_')}`;

  const roomNameOf = (roomId: string) => store.snapshot?.rooms.find((r) => r.id === roomId)?.name ?? tr('sem sala');

  let a11ySig = '';
  /** Lista oculta e atributos ARIA do canvas: quem está no escritório e quem está em foco. */
  const syncA11y = () => {
    if (!a11y) return;
    const agents = navigationOrder(store.snapshot?.agents ?? [], store.snapshot?.rooms ?? []);
    const rooms = new Map((store.snapshot?.rooms ?? []).map((r) => [r.id, r.name]));
    const sig = agents.map((a) => `${a.id}|${a.name}|${a.status}|${a.roomId}`).join('\n');
    if (sig !== a11ySig) {
      a11ySig = sig;
      a11y.replaceChildren(
        ...agents.map((a) => {
          const option = document.createElement('div');
          option.id = agentOptionId(a.id);
          option.setAttribute('role', 'option');
          option.setAttribute('aria-selected', 'false');
          option.textContent = tr('{0}, {1}: {2}', [a.name, rooms.get(a.roomId) ?? tr('sem sala'), statusText(a.status)]);
          return option;
        }),
      );
    }
    const active = selection?.type === 'agent' ? agentOptionId(selection.id) : null;
    if (active) canvas.setAttribute('aria-activedescendant', active);
    else canvas.removeAttribute('aria-activedescendant');
    for (const option of a11y.querySelectorAll('[role="option"]')) option.setAttribute('aria-selected', String(option.id === active));
  };

  let liveTimer: ReturnType<typeof setTimeout> | null = null;
  /** Fala uma frase na região viva (o texto é limpo antes para a mesma frase ser relida). */
  const announceLive = (text: string) => {
    if (!liveRegion) return;
    if (liveTimer) clearTimeout(liveTimer);
    liveRegion.textContent = '';
    liveTimer = setTimeout(() => {
      liveTimer = null;
      if (liveRegion) liveRegion.textContent = text;
    }, 30);
  };

  // ------------------------------------------------------------------ tamanho/DPR

  const resize = () => {
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    const pw = Math.floor(w * dpr);
    const ph = Math.floor(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    camera.setView(w, h, dpr);
    updateBounds();
  };

  const buildingRect = () => ({ x: 0, y: 0, w: sim.building.cols * COL_W * TILE, h: BUILDING_H * TILE });

  const updateBounds = () => {
    const b = buildingRect();
    camera.bounds = { x: b.x - 7 * TILE, y: b.y - 6 * TILE, w: b.w + 14 * TILE, h: b.h + 18 * TILE };
    const fit = camera.fitZoom(b, 16);
    camera.minZoom = Math.min(1, Math.max(0.25, fit));
    camera.clamp();
  };

  const overviewTarget = () => {
    const f = overviewFrame(buildingRect(), camera.viewW, camera.viewH, camera.insets);
    const fit = Math.max(camera.minZoom, f.zoom);
    const snapped = camera.snapZoom(fit, 'down');
    const zoom = snapped >= fit * 0.82 ? snapped : fit;
    const z = Math.min(zoom, 4);
    const c = camera.centerFor(f.cx, f.cy, z);
    // as margens de tela (pílulas acima, meio-fio abaixo) não são simétricas
    return { x: c.x, y: c.y - f.dy / z, zoom: z };
  };

  const overview = (animate = true) => {
    camera.follow = null;
    const o = overviewTarget();
    if (animate) camera.animateTo(o.x, o.y, o.zoom, Date.now(), 420);
    else {
      camera.stop();
      camera.x = o.x;
      camera.y = o.y;
      camera.zoom = o.zoom;
      camera.clamp();
    }
  };

  // ------------------------------------------------------------------ seleção e foco

  const emitSelect = () => selectCbs.forEach((cb) => cb(selection));

  const sameSelection = (a: Selection, b: Selection) => a === b || (!!a && !!b && a.type === b.type && a.id === b.id);

  const setSelection = (sel: Selection, focus = false) => {
    const same = sameSelection(sel, selection);
    selection = sel;
    // sem seleção não há anel de foco do teclado
    if (!sel) navFocused = false;
    // com "seguir selecionado" ligado, a câmera acompanha o agente escolhido (ou para de seguir)
    if (options.followSelected) camera.follow = sel?.type === 'agent' ? sel.id : null;
    if (focus && sel) {
      if (sel.type === 'agent') focusAgent(sel.id, { follow: options.followSelected });
      else focusRoom(sel.id);
    }
    if (!same) emitSelect();
    syncA11y();
  };

  const focusAgent = (id: string, opts: { follow?: boolean } = {}) => {
    const ch = sim.person(id);
    if (!ch) return;
    userMoved = true;
    const zoom = Math.max(camera.zoom, camera.snapZoom(3));
    const c = camera.centerFor(ch.x, ch.y - 12, zoom);
    camera.animateTo(c.x, c.y, zoom, Date.now(), 420);
    camera.follow = opts.follow ? id : null;
  };

  const focusRoom = (id: string) => {
    const room = sim.rooms.get(id);
    if (!room) return;
    userMoved = true;
    camera.follow = null;
    const r = room.layout.rect;
    const rect = { x: r.x * TILE, y: r.y * TILE - 8, w: r.w * TILE, h: r.h * TILE + 16 };
    const fit = camera.fitZoom(rect, 40);
    const zoom = Math.min(4, Math.max(camera.minZoom, camera.snapZoom(fit, 'down')));
    const c = camera.centerFor(rect.x + rect.w / 2, rect.y + rect.h / 2, zoom);
    camera.animateTo(c.x, c.y, zoom, Date.now(), 420);
  };

  const zoomStep = (steps: number, sx = camera.viewW / 2, sy = camera.viewH / 2) => {
    userMoved = true;
    camera.zoomAt(camera.stepZoom(steps), sx, sy, Date.now(), true);
  };

  // ------------------------------------------------------------------ teclado do escritório

  /** Agentes na ordem da navegação (sala e depois nome), sem quem está saindo. */
  const navAgents = () => navigationOrder(store.snapshot?.agents ?? [], store.snapshot?.rooms ?? []);

  const selectByKeyboard = (agent: AgentInfo, index: number, total: number) => {
    navFocused = true;
    setSelection({ type: 'agent', id: agent.id }, true);
    const room = roomNameOf(agent.roomId);
    announceLive(
      total > 1
        ? tr('Agente {0} de {1}: {2}, {3}, {4}.', [index + 1, total, agent.name, room, statusText(agent.status)])
        : tr('{0}, {1}, {2}.', [agent.name, room, statusText(agent.status)]),
    );
  };

  /**
   * Setas/Home/End percorrem os agentes, Enter abre os detalhes do agente em foco (a gaveta) e Esc limpa a
   * seleção. Devolve true quando tratou a tecla (o canvas está focado: ver input.ts).
   */
  const onNavKey = (key: string): boolean => {
    const list = navAgents();
    if (key === 'Enter') {
      if (!list.length) {
        announceLive(tr('Nenhum agente no escritório agora.'));
        return true;
      }
      const selectedId = selection?.type === 'agent' ? selection.id : null;
      const current = selectedId ? list.findIndex((a) => a.id === selectedId) : -1;
      const agent = list[Math.max(0, current)];
      navFocused = true;
      setSelection({ type: 'agent', id: agent.id }, true);
      announceLive(tr('Detalhes de {0}.', [agent.name]));
      return true;
    }
    if (key === 'Escape') {
      if (!selection) return true;
      setSelection(null);
      announceLive(tr('Seleção limpa.'));
      return true;
    }
    const selectedId = selection?.type === 'agent' ? selection.id : null;
    const current = selectedId ? list.findIndex((a) => a.id === selectedId) : -1;
    const index = nextNavIndex(current >= 0 ? current : null, list.length, key);
    if (index === null) return false;
    selectByKeyboard(list[index], index, list.length);
    return true;
  };

  // ------------------------------------------------------------------ hit-test

  const pick = (sx: number, sy: number): Hit => {
    const w = camera.screenToWorld(sx, sy);
    let best: string | null = null;
    let bestDepth = Number.NEGATIVE_INFINITY;
    const slack = Math.max(1, 3 / camera.zoom);
    for (const [id, h] of renderer.heads) {
      if (!h.visible || id === VISITOR_ID) continue;
      if (w.x < h.bx - slack || w.x > h.bx + h.bw + slack || w.y < h.by - slack || w.y > h.by + h.bh + slack) continue;
      if (h.depth > bestDepth) {
        bestDepth = h.depth;
        best = id;
      }
    }
    if (best) return { type: 'agent', id: best };
    if (sim.pet?.x && Math.hypot(w.x - sim.pet.x, w.y - (sim.pet.y - 4)) < 12) return { type: 'pet', id: 'pet' };
    const tx = Math.floor(w.x / TILE);
    const ty = Math.floor(w.y / TILE);
    for (const room of sim.rooms.values()) {
      if (room.present && !room.ghost && inRect(room.layout.rect, tx, ty)) {
        const deskSpot = room.layout.spots.find(
          (s) => s.kind === 'desk' && ((s.tx === tx && s.ty === ty) || (s.side === 'S' && s.tx === tx && s.ty - 1 === ty) || (s.side === 'N' && s.tx === tx && s.ty + 1 === ty))
        );
        if (deskSpot && sim.spots.isFree(deskSpot.id)) return { type: 'desk', id: deskSpot.id, roomId: room.id, folder: room.info.path };
        return { type: 'room', id: room.id };
      }
    }
    return null;
  };

  const setHover = (id: string | null) => {
    if (id === hover) return;
    hover = id;
    canvas.style.cursor = id ? 'pointer' : 'grab';
    hoverCbs.forEach((cb) => cb(id));
  };

  /** Visita: um toque no chão leva o visitante até lá (num agente, abre o cartão dele). */
  const visitClick = (hit: Hit, at: { x: number; y: number }) => {
    if (hit?.type === 'agent') return setSelection(hit);
    setSelection(null);
    const w = camera.screenToWorld(at.x, at.y);
    if (sim.visitorWalkTo(Math.floor(w.x / TILE), Math.floor(w.y / TILE))) followVisitor();
  };
  const followVisitor = () => {
    if (!sim.visitor) return;
    userMoved = true;
    camera.follow = VISITOR_ID;
  };

  const detachInput = attachInput(canvas, camera, {
    pick,
    click: (hit, at) => {
      navFocused = false;
      if (hit?.type === 'pet') return void sim.pet.pet();
      if (hit?.type === 'desk') return void deskClickCbs.forEach((cb) => cb(hit.roomId, hit.folder));
      return visitMode ? visitClick(hit, at) : setSelection(hit);
    },
    doubleClick: (hit) => {
      navFocused = false;
      if (hit?.type === 'agent') {
        setSelection(hit);
        focusAgent(hit.id, { follow: true });
      } else if (hit?.type === 'room') focusRoom(hit.id);
    },
    hover: (sx, sy, inside) => {
      mouse = inside ? { x: sx, y: sy } : null;
      if (!inside) setHover(null);
    },
    interact: () => {
      userMoved = true;
      camera.follow = null;
      camera.stop();
    },
    overview: () => overview(true),
    zoomStep,
    active: () => !suspended,
    keys: () => !visitMode,
    nav: onNavKey,
  });

  // ------------------------------------------------------------------ dados

  const onSnapshot = () => {
    const snap = store.snapshot;
    if (!snap) return;
    try {
      // No timelapse, os horários do snapshot vão para o relógio do mundo (world/playback.ts).
      if (playback) sim.applySnapshot(rebaseSnapshot(snap, worldNow - snap.serverTime), worldNow);
      else sim.applySnapshot(snap, Date.now());
    } catch (err) {
      console.error('[mundo] snapshot inválido ignorado', err);
    }
    syncA11y();
  };
  const offSnapshot = store.on('snapshot', onSnapshot);
  if (store.snapshot) onSnapshot();

  void loadWorldAssets(abort.signal).then((a) => {
    if (!a) return;
    assets = a;
    renderer.setAssets(a);
  });

  // medições de texto em cache: refaz quando alguma fonte termina de carregar
  if (document.fonts) document.fonts.addEventListener?.('loadingdone', () => overlay.resetCaches(), { signal: abort.signal });

  // ------------------------------------------------------------------ laço

  const loop = (ts: number) => {
    raf = requestAnimationFrame(loop);
    const real = Date.now();
    const realDt = lastTs ? Math.min(0.1, Math.max(0, (ts - lastTs) / 1000)) : 1 / 60;
    lastTs = ts;
    // Timelapse: simulação e desenho no relógio do mundo (acelerado ou parado); a câmera segue no tempo real.
    const k = playback ? Math.max(0, playback.scale()) : 1;
    const dt = realDt * k;
    if (playback) worldNow += dt * 1000;
    const now = playback ? worldNow : real;
    try {
      const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
      if (canvas.clientWidth !== camera.viewW || canvas.clientHeight !== camera.viewH || dpr !== camera.dpr) resize();
      sim.update(dt, now);
      // partidas e apostas resolvidas: para o feed (as do timelapse são encenação do passado: ficam fora)
      const events = sim.social.events;
      if (events.length) {
        if (!playback) for (const e of events) for (const cb of socialCbs) cb(e);
        events.length = 0;
      }
      renderer.sync(seasonalThemeFor(options.theme, new Date()), options.scenario ?? 'city');
      if (sim.building.cols !== lastCols) {
        lastCols = sim.building.cols;
        updateBounds();
        if (!framed && sim.initialized) {
          overview(false);
          framed = true;
        } else if (!userMoved) overview(true);
      }
      // visita: andando pelo teclado, a câmera vai junto
      if (visitMode && sim.visitor && (sim.visitorIntent.dx || sim.visitorIntent.dy) && camera.follow !== VISITOR_ID) followVisitor();
      const followCh = camera.follow ? sim.person(camera.follow) : undefined;
      if (camera.follow && !followCh) camera.follow = null;
      camera.update(real, followCh ? camera.centerFor(followCh.x, followCh.y - 12, camera.zoom) : null, realDt);
      renderer.frame(now, dt, options, { agent: selection?.type === 'agent' ? selection.id : null, room: selection?.type === 'room' ? selection.id : null, hover, keyboard: navFocused });
      overlay.draw(now, options, { agent: selection?.type === 'agent' ? selection.id : null, room: selection?.type === 'room' ? selection.id : null, hover });
      renderer.pruneHeads();
      // No timelapse o mundo fica mudo: o teclado e o elevador em alta velocidade só fariam barulho.
      if (soundCbs.size && !playback) cues.update(now, (c) => soundCbs.forEach((cb) => cb(c)));
      if (mouse) {
        const hit = pick(mouse.x, mouse.y);
        setHover(hit?.type === 'agent' ? hit.id : null);
      }
      // seleção de quem já foi embora
      if (selection?.type === 'agent' && !sim.chars.has(selection.id)) setSelection(null);
      if (selection?.type === 'room' && !sim.rooms.has(selection.id)) setSelection(null);
    } catch (err) {
      console.error('[mundo] erro no frame', err);
    }
  };

  const onVisibility = () => {
    if (suspended) return;
    if (document.hidden) {
      hiddenAt = Date.now();
      return;
    }
    lastTs = 0;
    if (hiddenAt && Date.now() - hiddenAt > 5000) sim.fastForward(playback ? worldNow : Date.now());
    hiddenAt = 0;
  };

  // Botão direito numa sala (ou num agente dentro dela): a UI oferece renomear a sala.
  const onContextMenu = (e: MouseEvent) => {
    if (!roomMenuCbs.size) return;
    const r = canvas.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    const hit = pick(sx, sy);
    const w = camera.screenToWorld(sx, sy);
    const roomId =
      hit?.type === 'room'
        ? hit.id
        : hit?.type === 'agent'
          ? (sim.chars.get(hit.id)?.roomId ?? null)
          : ([...sim.rooms.values()].find((room) => room.present && !room.ghost && inRect(room.layout.rect, Math.floor(w.x / TILE), Math.floor(w.y / TILE)))?.id ?? null);
    if (!roomId || !sim.rooms.has(roomId)) return;
    e.preventDefault();
    roomMenuCbs.forEach((cb) => cb(roomId, { x: e.clientX, y: e.clientY }));
  };
  canvas.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', onVisibility);
  resize();
  raf = requestAnimationFrame(loop);

  // ------------------------------------------------------------------ depuração

  const markMoved = () => (userMoved = true);
  let debug = createDebug(sim, renderer, camera, markMoved);

  // ------------------------------------------------------------------ timelapse

  /**
   * Recomeça simulação e desenho do zero (o próximo snapshot é a carga inicial: todos já no lugar).
   * No timelapse as carteiras ficam só em memória, sem tocar nas moedinhas guardadas no navegador.
   */
  const rebuild = () => {
    // As carteiras ao vivo gravam a cada 5 s: não perde o que mudou desde a última vez (no replay, não grava nada).
    sim.social.wallets.save(Date.now());
    sim = new Sim(art, () => options, playback ? null : undefined, { visit: visitMode });
    renderer = new Renderer(canvas, art, sim, camera);
    if (assets) renderer.setAssets(assets);
    if (playback) {
      const p = playback;
      renderer.clock = () => p.clock();
    }
    overlay = new Overlay(renderer.ctx, sim, renderer, camera);
    debug = createDebug(sim, renderer, camera, markMoved);
    cues = new SoundCues(sim, camera);
    lastCols = -1;
    setHover(null);
  };

  return {
    select: (sel, opts) => setSelection(sel, !!opts?.focus),
    getSelection: () => selection,
    onDeskClick: (cb: (roomId: string, folder?: string) => void) => {
      deskClickCbs.add(cb);
      return () => void deskClickCbs.delete(cb);
    },
    onSelect: (cb) => {
      selectCbs.add(cb);
      return () => void selectCbs.delete(cb);
    },
    onHover: (cb) => {
      hoverCbs.add(cb);
      return () => void hoverCbs.delete(cb);
    },
    focusAgent,
    focusRoom,
    overview: () => {
      userMoved = false;
      overview(true);
    },
    zoomBy: (factor) => {
      if (!Number.isFinite(factor) || factor <= 0 || factor === 1) return;
      const target = camera.snapZoom(camera.zoom * factor, factor > 1 ? 'up' : 'down');
      if (Math.abs(target - camera.zoom) < 1e-3) zoomStep(factor > 1 ? 1 : -1);
      else {
        userMoved = true;
        camera.zoomAt(target, camera.viewW / 2, camera.viewH / 2, Date.now(), true);
      }
    },
    getOptions: () => ({ ...options }),
    setOptions: (o) => {
      options = { ...options, ...o };
      if (o.followSelected !== undefined) camera.follow = o.followSelected && selection?.type === 'agent' ? selection.id : null;
    },
    setViewInsets: (ins) => {
      const v = (n: number | undefined, cur: number) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, n) : cur);
      const cur = camera.insets;
      camera.insets = { top: v(ins.top, cur.top), right: v(ins.right, cur.right), bottom: v(ins.bottom, cur.bottom), left: v(ins.left, cur.left) };
      updateBounds();
      if (!userMoved && framed) overview(true);
    },
    screenPositionOf: (id) => {
      const h = renderer.heads.get(id);
      if (!h || !h.visible) return null;
      const p = camera.worldToScreen(h.x, h.y - 2);
      if (p.x < 0 || p.y < 0 || p.x > camera.viewW || p.y > camera.viewH) return null;
      return p;
    },
    social: (id) => sim.social.info(id),
    onRoomContextMenu: (cb) => {
      roomMenuCbs.add(cb);
      return () => void roomMenuCbs.delete(cb);
    },
    onSocialEvent: (cb) => {
      socialCbs.add(cb);
      return () => void socialCbs.delete(cb);
    },
    setPlayback: (p) => {
      playback = p;
      worldNow = p ? p.clock() : 0;
      rebuild();
    },
    onSound: (cb) => {
      soundCbs.add(cb);
      return () => void soundCbs.delete(cb);
    },
    setSuspended: (on) => {
      if (on === suspended) return;
      suspended = on;
      if (on) {
        cancelAnimationFrame(raf);
        suspendedAt = Date.now();
        setHover(null);
        mouse = null;
        return;
      }
      lastTs = 0;
      if (suspendedAt && Date.now() - suspendedAt > 5000) sim.fastForward(playback ? worldNow : Date.now());
      suspendedAt = 0;
      hiddenAt = 0;
      raf = requestAnimationFrame(loop);
    },
    destroy: () => {
      cancelAnimationFrame(raf);
      abort.abort();
      offSnapshot();
      detachInput();
      if (liveTimer) clearTimeout(liveTimer);
      a11y?.remove();
      liveRegion?.remove();
      worldHelp?.remove();
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('visibilitychange', onVisibility);
      selectCbs.clear();
      hoverCbs.clear();
      socialCbs.clear();
      soundCbs.clear();
    },
    get debug() {
      return debug;
    },
    visit: {
      setVisitor: (me) => {
        if (!visitMode) return;
        sim.setVisitor(me ? visitorInfo(me, Date.now()) : null, Date.now());
      },
      setIntent: (intent) => {
        sim.visitorIntent = visitMode ? { ...intent } : { ...NO_INTENT };
      },
      setLight: (mode) => {
        if (!visitMode || sim.visitLight === mode) return;
        sim.visitLight = mode;
        sim.applyVisitLight(Date.now());
      },
      atExit: () => visitMode && !!sim.visitorElevator(),
      exit: (done) => {
        if (!visitMode || !sim.visitorExit(done)) return false;
        followVisitor();
        return true;
      },
      visitorScreen: () => {
        const h = renderer.heads.get(VISITOR_ID);
        if (!h || !h.visible) return null;
        const p = camera.worldToScreen(h.x, h.y - 2);
        if (p.x < 0 || p.y < 0 || p.x > camera.viewW || p.y > camera.viewH) return null;
        return p;
      },
      boardScreen: () => {
        const r = visitMode ? renderer.paintingRect(RECEPTION_ID) : null;
        if (!r) return null;
        const a = camera.worldToScreen(r.x, r.y);
        const b = camera.worldToScreen(r.x + r.w, r.y + r.h);
        if (b.x < 0 || b.y < 0 || a.x > camera.viewW || a.y > camera.viewH) return null;
        return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
      },
    },
  };
}
