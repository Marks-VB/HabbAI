// Configurações (popover): opções do escritório, avisos, modo demonstração e Sobre (versão). O Habblaud World tem a
// janela própria (ui/world/world-dialog.ts); daqui só sai a dica do tema em Aparência, que também vai para o prédio.
import { access, remoteLogout } from '../net/access';
import { budgetState, loadBudget, saveBudget } from '../net/budget';
import { type BudgetConfig, type BudgetLimit, type BudgetScopeLimits } from '../../../shared/budget';
import type { UiComponent, UiContext } from './context';
import { h, iconButton, setAttr, setHidden, setText } from './dom';
import { ICONS, scenarioIcon, themeIcon } from './icons';
import { notificationState, type Notifier } from './notify';
import type { UiPrefs } from './prefs';
import { SoundSettingsGroup } from './settings-sound';
import type { SoundControl } from './sound';
import { AboutGroup } from './version';
import type { WorldThemeLink } from './world/world-dialog';
import { LOCALE_STORAGE_KEY, LOCALES, normalizeLocale, tr, type Locale } from '../../../shared/i18n';

type LanguageChoice = 'auto' | Locale;

/** Campo numérico da seção Orçamento. */
type BudgetField = { key: 'dayCost' | 'dayTokens' | 'monthCost' | 'monthTokens'; label: string; input: HTMLInputElement; tokens: boolean };

/** Idioma escolhido nas Configurações ("auto" = o do navegador). */
function savedLanguage(): LanguageChoice {
  try {
    return normalizeLocale(localStorage.getItem(LOCALE_STORAGE_KEY)) ?? 'auto';
  } catch {
    return 'auto';
  }
}

/** Salva a escolha e recarrega: os textos são montados uma vez, ao carregar a página. */
function pickLanguage(v: LanguageChoice): void {
  if (v === savedLanguage()) return;
  try {
    if (v === 'auto') localStorage.removeItem(LOCALE_STORAGE_KEY);
    else localStorage.setItem(LOCALE_STORAGE_KEY, v);
  } catch {
    return;
  }
  location.reload();
}

type BoolPref = { [K in keyof UiPrefs]: UiPrefs[K] extends boolean ? K : never }[keyof UiPrefs];

interface SwitchRefs {
  btn: HTMLButtonElement;
  hint: HTMLElement;
}

export function switchRow(label: string, hintText: string, onToggle: () => void): SwitchRefs & { row: HTMLElement } {
  const id = `ui-sw-${label.replace(/\W+/g, '-').toLowerCase()}`;
  const btn = h('button', { class: 'ui-switch', type: 'button', role: 'switch', attrs: { 'aria-checked': 'false', 'aria-labelledby': id } }, h('span', { class: 'ui-switch__knob' }));
  btn.addEventListener('click', onToggle);
  const hint = h('span', { class: 'ui-set__hint', text: hintText });
  const row = h('div', { class: 'ui-set' }, h('div', { class: 'ui-set__text' }, h('span', { class: 'ui-set__label', text: label, attrs: { id } }), hint), btn);
  return { row, btn, hint };
}

export function segmented<T extends string>(
  label: string,
  options: readonly [T, string, string?][],
  onPick: (v: T) => void,
  opts: { tiles?: boolean } = {},
): { row: HTMLElement; set(v: T): void } {
  const group = h('div', {
    class: opts.tiles ? 'ui-seg ui-seg--tiles' : 'ui-seg',
    role: 'radiogroup',
    attrs: { 'aria-label': label },
  });
  const buttons = options.map(([value, text, icon]) => {
    const b = h('button', { class: 'ui-seg__opt', type: 'button', role: 'radio', attrs: { 'aria-checked': 'false' } });
    if (icon) {
      const glyph = h('span', { class: 'ui-seg__icon' });
      glyph.innerHTML = icon;
      b.append(glyph);
    }
    b.append(h('span', { class: 'ui-seg__opt-label', text }));
    b.addEventListener('click', () => onPick(value));
    b.addEventListener('keydown', (e) => {
      // Setas navegam entre as opções (padrão de radiogroup).
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      e.stopPropagation();
      const i = options.findIndex(([v]) => v === value);
      const next = options[(i + (e.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length];
      onPick(next[0]);
      buttons[options.indexOf(next)].focus();
    });
    group.append(b);
    return b;
  });
  const row = h('div', { class: 'ui-set ui-set--stack' }, h('span', { class: 'ui-set__label', text: label }), group);
  return {
    row,
    set(v: T) {
      options.forEach(([value], i) => {
        const on = value === v;
        setAttr(buttons[i], 'aria-checked', String(on));
        buttons[i].tabIndex = on ? 0 : -1;
      });
    },
  };
}

/** Valor guardado para um campo da seção Orçamento. */
function budgetValue(limits: BudgetScopeLimits, key: BudgetField['key']): number | undefined {
  const period = key.startsWith('day') ? limits.day : limits.month;
  if (!period) return undefined;
  return key.endsWith('Tokens') ? period.tokens : period.costUSD;
}

export class SettingsPopover implements UiComponent {
  readonly el: HTMLElement;
  private switches = new Map<BoolPref | 'demo', SwitchRefs>();
  private bubbles: ReturnType<typeof segmented<UiPrefs['bubbles']>>;
  private liveliness: ReturnType<typeof segmented<UiPrefs['liveliness']>>;
  private daylight: ReturnType<typeof segmented<UiPrefs['daylight']>>;
  private theme: ReturnType<typeof segmented<UiPrefs['theme']>>;
  private scenario: ReturnType<typeof segmented<UiPrefs['scenario']>>;
  private language: ReturnType<typeof segmented<LanguageChoice>>;
  private soundGroup: SoundSettingsGroup;
  private budgetGroup: HTMLElement;
  private budgetFields: ReadonlyArray<BudgetField>;
  private budgetSave: HTMLButtonElement;
  private budgetStatus: HTMLElement;
  private budgetLoaded = false;
  private budgetLoading = false;
  private budgetFailed = false;
  private budgetBusy = false;
  private budgetError: string | null = null;
  private demoGroup: HTMLElement;
  /** Só na página do celular (porta remota com login): sair deste aparelho. */
  private remoteGroup: HTMLElement;
  private logoutBtn: HTMLButtonElement;
  private about: AboutGroup;
  private demoBusy = false;
  private anchor: HTMLElement | null = null;

  constructor(
    private ctx: UiContext,
    private notifier: Notifier,
    sound: SoundControl,
    /** A janela do Habblaud World: a dica do tema em Aparência e o envio do tema ao prédio. */
    private readonly world: WorldThemeLink,
  ) {
    const sw = (key: BoolPref | 'demo', label: string, hint: string, onToggle: () => void) => {
      const r = switchRow(label, hint, onToggle);
      this.switches.set(key, r);
      return r.row;
    };
    const flip = (key: BoolPref) => () => ctx.updatePrefs({ [key]: !ctx.prefs[key] } as Partial<UiPrefs>);

    this.bubbles = segmented<UiPrefs['bubbles']>(
      tr('Balões de atividade'),
      [
        ['all', tr('Todos')],
        ['important', tr('Importantes')],
        ['none', tr('Nenhum')],
      ],
      (v) => ctx.updatePrefs({ bubbles: v }),
    );
    this.liveliness = segmented<UiPrefs['liveliness']>(
      tr('Movimento pelo escritório'),
      [
        ['calm', tr('Calmo')],
        ['normal', tr('Normal')],
        ['lively', tr('Agitado')],
      ],
      (v) => ctx.updatePrefs({ liveliness: v }),
    );
    this.daylight = segmented<UiPrefs['daylight']>(
      tr('Ciclo dia/noite'),
      [
        ['auto', tr('Automático')],
        ['day', tr('Sempre dia')],
        ['night', tr('Sempre noite')],
      ],
      (v) => ctx.updatePrefs({ daylight: v }),
    );
    this.daylight.row.append(h('span', { class: 'ui-set__hint', text: tr('Automático: céu, luzes e sol nas janelas seguem a hora local.') }));
    this.theme = segmented<UiPrefs['theme']>(
      tr('Tema do escritório'),
      [
        ['auto', tr('Automático'), themeIcon('auto')],
        ['seasons', tr('Estações'), themeIcon('seasons')],
        ['none', tr('Nenhum'), themeIcon('none')],
        ['christmas', tr('Natal'), themeIcon('christmas')],
        ['halloween', tr('Halloween'), themeIcon('halloween')],
        ['spring', tr('Primavera'), themeIcon('spring')],
        ['autumn', tr('Outono'), themeIcon('autumn')],
        ['junina', tr('Festa Junina'), themeIcon('junina')],
        ['cyberpunk', tr('Cyberpunk'), themeIcon('cyberpunk')],
        ['retro', tr('Retrô'), themeIcon('retro')],
        ['orbital', tr('Estação Orbital'), themeIcon('orbital')],
      ],
      (v) => {
        ctx.updatePrefs({ theme: v });
        // Com o World ligado e a conta aprovada, o tema também vai para o prédio (clicar de novo reenvia).
        void this.world.onThemePicked(v);
      },
      { tiles: true },
    );
    this.theme.row.append(h('span', { class: 'ui-set__hint', text: tr('Automático: Halloween em outubro e Natal de 1º de novembro a 26 de dezembro; no resto do ano, o visual original. Estações: primavera de setembro a fevereiro, outono de março a maio e festa junina em junho e julho. Nenhum: sempre o original. Os temas locais ficam só neste escritório: o prédio do World mantém o tema sazonal.') }));
    this.scenario = segmented<UiPrefs['scenario']>(
      tr('Cenário externo'),
      [
        ['city', tr('Cidade'), scenarioIcon('city')],
        ['forest', tr('Floresta'), scenarioIcon('forest')],
        ['cyberpunk', tr('Cyberpunk'), scenarioIcon('cyberpunk')],
        ['retro', tr('Retrô'), scenarioIcon('retro')],
        ['orbital', tr('Estação Orbital'), scenarioIcon('orbital')],
        ['snow', tr('Neve'), scenarioIcon('snow')],
        ['beach', tr('Praia'), scenarioIcon('beach')],
      ],
      (v) => ctx.updatePrefs({ scenario: v }),
      { tiles: true },
    );
    this.scenario.row.append(
      h('span', { class: 'ui-set__hint', text: tr('Altera o cenário e arredores do prédio (rua, árvores e janelas) sem modificar o interior do escritório.') }),
    );
    this.soundGroup = new SoundSettingsGroup(ctx, sound);

    // Orçamento: limites do escritório inteiro (dia/mês, custo/tokens). Os escopos por projeto e por conta só pelo
    // arquivo budget.json ou pelo PUT /api/budget — aqui o caso comum, em quatro campos.
    const budgetInput = (): HTMLInputElement =>
      h('input', { class: 'ui-budget__input', type: 'number', attrs: { min: '0', step: 'any', inputmode: 'decimal' } });
    const dayCost = budgetInput();
    const dayTokens = budgetInput();
    const monthCost = budgetInput();
    const monthTokens = budgetInput();
    this.budgetFields = [
      { key: 'dayCost', label: tr('Limite diário (US$)'), input: dayCost, tokens: false },
      { key: 'dayTokens', label: tr('Limite diário (tokens)'), input: dayTokens, tokens: true },
      { key: 'monthCost', label: tr('Limite mensal (US$)'), input: monthCost, tokens: false },
      { key: 'monthTokens', label: tr('Limite mensal (tokens)'), input: monthTokens, tokens: true },
    ];
    const budgetField = (f: BudgetField) => h('label', { class: 'ui-budget__field' }, h('span', { text: f.label }), f.input);
    this.budgetStatus = h('span', { class: 'ui-budget__status' });
    this.budgetSave = h('button', {
      class: 'ui-btn ui-btn--sm',
      type: 'button',
      text: tr('Salvar limites'),
      on: { click: () => void this.saveBudgetLimits() },
    }) as HTMLButtonElement;
    this.budgetGroup = h(
      'div',
      { class: 'ui-set-group' },
      h('h3', { text: tr('Orçamento') }),
      h('div', { class: 'ui-budget__grid' }, ...this.budgetFields.map(budgetField)),
      h('span', {
        class: 'ui-set__hint',
        text: tr(
          'Vazio = sem limite. Avisa ao passar de 80% e de 100%, uma vez por período. Tokens = entrada + saída. Limites por projeto e por conta ficam em budget.json.',
        ),
      }),
      h('div', { class: 'ui-budget__actions' }, this.budgetSave, this.budgetStatus),
    );

    // Nomes dos idiomas sempre na própria língua, para quem não entende o idioma atual achar o seu.
    this.language = segmented<LanguageChoice>(
      tr('Idioma da interface'),
      [['auto', tr('Automático')], ...LOCALES.map((l): [LanguageChoice, string] => [l.id, l.name])],
      (v) => pickLanguage(v),
    );
    this.language.row.append(
      h('span', { class: 'ui-set__hint', text: tr('Os textos das atividades vêm do servidor: seguem HABBLAUD_LANG ou o idioma do sistema onde o HabbAI roda (o inglês, só com HABBLAUD_LANG=en).') }),
    );

    this.demoGroup = h(
      'div',
      { class: 'ui-set-group' },
      h('h3', { text: tr('Dados') }),
      sw('demo', tr('Modo demonstração'), tr('Coloca agentes fictícios no escritório, junto com os reais.'), () => void this.toggleDemo()),
    );

    this.logoutBtn = h('button', { class: 'ui-btn', type: 'button', text: tr('Sair'), on: { click: () => void this.logout() } }) as HTMLButtonElement;
    this.remoteGroup = h(
      'div',
      { class: 'ui-set-group', hidden: true },
      h('h3', { text: tr('Acesso pelo celular') }),
      h(
        'div',
        { class: 'ui-set' },
        h(
          'div',
          { class: 'ui-set__text' },
          h('span', { class: 'ui-set__label', text: tr('Sair deste aparelho') }),
          h('span', { class: 'ui-set__hint', text: tr('Encerra o login aqui (uma cópia do cookie também deixa de valer). Para voltar, entre com usuário e senha.') }),
        ),
        this.logoutBtn,
      ),
    );

    this.theme.row.append(world.themeNote);
    this.about = new AboutGroup(ctx);

    const close = iconButton(ICONS.close, tr('Fechar configurações'), () => this.hide(), 'ui-icon-btn--sm');
    this.el = h(
      'div',
      { class: 'ui-popover ui-settings', role: 'dialog', tabIndex: -1, attrs: { 'aria-label': tr('Configurações'), id: 'ui-settings', popover: 'auto' } },
      h('div', { class: 'ui-popover__head' }, h('h2', { text: tr('Configurações') }), close),
      h('div', { class: 'ui-set-group' }, h('h3', { text: tr('Aparência') }), this.theme.row, this.scenario.row),
      h(
        'div',
        { class: 'ui-set-group' },
        h('h3', { text: tr('Escritório') }),
        sw('showNames', tr('Mostrar nomes'), tr('Etiqueta com o nome acima de cada personagem.'), flip('showNames')),
        this.bubbles.row,
        this.liveliness.row,
        this.daylight.row,
      ),
      h(
        'div',
        { class: 'ui-set-group' },
        h('h3', { text: tr('Avisos') }),
        sw('browserNotifications', tr('Notificações do navegador'), tr('Avisa quando alguém precisa de você e a aba está em segundo plano.'), () => void this.toggleNotifications()),
      ),
      this.budgetGroup,
      this.soundGroup.el,
      h('div', { class: 'ui-set-group' }, h('h3', { text: tr('Idioma') }), this.language.row),
      this.demoGroup,
      this.remoteGroup,
      this.about.el,
    );
    this.el.addEventListener('toggle', () => {
      this.anchor?.setAttribute('aria-expanded', String(this.isOpen));
      this.syncRootClass();
      if (this.isOpen) this.render();
    });
  }

  get isOpen(): boolean {
    try {
      return this.el.matches(':popover-open');
    } catch {
      return this.el.classList.contains('is-open');
    }
  }

  toggle(anchor: HTMLElement): void {
    this.anchor = anchor;
    if (this.isOpen) return this.hide();
    const r = anchor.getBoundingClientRect();
    this.el.style.top = `${Math.round(r.bottom + 8)}px`;
    this.el.style.right = `${Math.max(8, Math.round(innerWidth - r.right - 4))}px`;
    if (typeof this.el.showPopover === 'function') this.el.showPopover();
    else this.el.classList.add('is-open');
    anchor.setAttribute('aria-expanded', 'true');
    this.syncRootClass();
    // Leva o foco para dentro do popover (sem anel de foco num controle específico).
    this.el.focus();
  }

  /** Abre (se fechado) e leva até a seção "Sobre". */
  showAbout(anchor: HTMLElement): void {
    if (!this.isOpen) this.toggle(anchor);
    this.render();
    requestAnimationFrame(() => this.about.highlight());
  }

  hide(): void {
    if (typeof this.el.hidePopover === 'function' && this.isOpen) this.el.hidePopover();
    this.el.classList.remove('is-open');
    this.anchor?.setAttribute('aria-expanded', 'false');
    this.syncRootClass();
  }

  /** Com o popover aberto, os avisos recolhem (não aparecem por trás nem ao lado dele). */
  private syncRootClass(): void {
    this.ctx.root.classList.toggle('has-popover', this.isOpen);
  }

  private async logout(): Promise<void> {
    this.logoutBtn.disabled = true;
    if (!(await remoteLogout())) {
      this.logoutBtn.disabled = false;
      this.ctx.announce(tr('Não foi possível sair: sem resposta do servidor.'));
    }
  }

  render(): void {
    const p = this.ctx.prefs;
    for (const [key, r] of this.switches) {
      const on = key === 'demo' ? !!this.ctx.store.liveSnapshot?.meta.demo : p[key];
      setAttr(r.btn, 'aria-checked', String(on));
      r.btn.disabled = key === 'demo' && this.demoBusy;
    }
    this.bubbles.set(p.bubbles);
    this.liveliness.set(p.liveliness);
    this.daylight.set(p.daylight);
    this.theme.set(p.theme);
    this.scenario.set(p.scenario);
    this.language.set(savedLanguage());
    this.soundGroup.render();
    setHidden(this.demoGroup, this.ctx.store.mock || access().remote);
    setHidden(this.remoteGroup, !access().remote);
    const budgetLocal = !this.ctx.store.mock && !access().remote && access().local;
    setHidden(this.budgetGroup, !budgetLocal);
    if (budgetLocal) this.ensureBudgetLoaded();
    setText(this.budgetStatus, this.budgetStatusText());
    this.budgetSave.disabled = this.budgetBusy || !budgetState();
    this.about.render();

    const notif = this.switches.get('browserNotifications')!;
    const state = notificationState();
    const hint =
      state === 'unsupported'
        ? tr('Este navegador não oferece notificações.')
        : state === 'denied'
          ? tr('Bloqueadas pelo navegador: libere nas permissões do site.')
          : tr('Avisa quando alguém precisa de você e a aba está em segundo plano.');
    setText(notif.hint, hint);
    notif.btn.disabled = state === 'unsupported';
  }

  /** Carrega os limites uma vez (o banner também busca; aqui só preenche os campos quando a resposta chega). */
  private ensureBudgetLoaded(): void {
    const state = budgetState();
    if (state) {
      if (!this.budgetLoaded) {
        this.budgetLoaded = true;
        this.applyBudgetConfig(state.config);
      }
      return;
    }
    if (this.budgetLoading || this.budgetFailed) return;
    this.budgetLoading = true;
    void loadBudget().then(() => {
      this.budgetLoading = false;
      const next = budgetState();
      if (!next) this.budgetFailed = true;
      else if (!this.budgetLoaded) {
        this.budgetLoaded = true;
        this.applyBudgetConfig(next.config);
      }
      this.ctx.invalidate();
    });
  }

  private applyBudgetConfig(config: BudgetConfig): void {
    for (const f of this.budgetFields) {
      const value = budgetValue(config.limits, f.key);
      f.input.value = value === undefined ? '' : String(value);
      f.input.classList.remove('is-invalid');
    }
    this.budgetError = null;
  }

  private budgetStatusText(): string {
    if (this.budgetError) return this.budgetError;
    const state = budgetState();
    if (!state) return this.budgetFailed ? tr('Não foi possível carregar os limites.') : '';
    if (!state.status.metrics.length) return tr('Nenhum limite definido.');
    if (state.status.level === 'over') return tr('Algum limite estourado.');
    if (state.status.level === 'warn') return tr('Algum limite passou de 80%.');
    return tr('Dentro do orçamento.');
  }

  private async saveBudgetLimits(): Promise<void> {
    if (this.budgetBusy) return;
    // Sem a configuração atual não dá para preservar os escopos por projeto/conta: melhor não salvar nada.
    const current = budgetState();
    if (!current) {
      this.budgetError = tr('Não foi possível carregar os limites.');
      this.ctx.announce(this.budgetError);
      this.ctx.invalidate();
      return;
    }
    const values: Partial<Record<BudgetField['key'], number>> = {};
    for (const f of this.budgetFields) {
      f.input.classList.remove('is-invalid');
      const raw = f.input.value.trim();
      if (!raw) continue;
      const value = Number(raw.replace(',', '.'));
      if (!Number.isFinite(value) || value < 0 || (f.tokens && !Number.isInteger(value))) {
        f.input.classList.add('is-invalid');
        this.budgetError = tr('Valor inválido em "{0}": use um número maior ou igual a zero.', [f.label]);
        this.ctx.announce(this.budgetError);
        this.ctx.invalidate();
        return;
      }
      values[f.key] = value;
    }
    const day: BudgetLimit = {};
    if (values.dayCost !== undefined) day.costUSD = values.dayCost;
    if (values.dayTokens !== undefined) day.tokens = values.dayTokens;
    const month: BudgetLimit = {};
    if (values.monthCost !== undefined) month.costUSD = values.monthCost;
    if (values.monthTokens !== undefined) month.tokens = values.monthTokens;
    const limits: BudgetScopeLimits = {};
    if (day.costUSD !== undefined || day.tokens !== undefined) limits.day = day;
    if (month.costUSD !== undefined || month.tokens !== undefined) limits.month = month;
    // Os escopos por projeto/conta não têm campos aqui: vão como vieram do servidor.
    const base = current.config;
    const config: BudgetConfig = { version: 1, limits };
    if (base.projects) config.projects = base.projects;
    if (base.accounts) config.accounts = base.accounts;
    this.budgetBusy = true;
    this.budgetError = null;
    this.ctx.invalidate();
    try {
      const r = await saveBudget(config);
      if (!r.ok) {
        this.budgetError = tr('Não foi possível salvar os limites: {0}', [r.error]);
        this.ctx.announce(this.budgetError);
        return;
      }
      this.applyBudgetConfig(r.response.config);
      this.ctx.announce(tr('Limites salvos.'));
    } finally {
      this.budgetBusy = false;
      this.ctx.invalidate();
    }
  }

  private async toggleNotifications(): Promise<void> {
    if (this.ctx.prefs.browserNotifications) {
      this.ctx.updatePrefs({ browserNotifications: false });
      return;
    }
    const state = await this.notifier.enableBrowserNotifications();
    this.ctx.updatePrefs({ browserNotifications: state === 'granted' });
    if (state === 'denied') this.ctx.announce(tr('Notificações bloqueadas pelo navegador.'));
  }

  private async toggleDemo(): Promise<void> {
    if (this.demoBusy) return;
    this.demoBusy = true;
    this.render();
    const enable = !this.ctx.store.snapshot?.meta.demo;
    try {
      const ok = await this.ctx.store.setDemo(enable);
      this.ctx.announce(ok ? (enable ? tr('Modo demonstração ligado.') : tr('Modo demonstração desligado.')) : tr('Não foi possível mudar o modo demonstração.'));
    } catch {
      this.ctx.announce(tr('Não foi possível falar com o servidor.'));
    } finally {
      this.demoBusy = false;
      this.ctx.invalidate();
    }
  }
}
