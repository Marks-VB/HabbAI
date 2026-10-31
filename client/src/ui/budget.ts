// Aviso discreto de orçamento: aparece na barra de avisos quando um limite configurado passa de 80% (âmbar) ou de
// 100% (vermelho). O texto mostra o escopo e a métrica do limite mais apertado; "Dispensar" esconde o aviso até o
// próximo período (virada do dia/mês) ou até ele subir de faixa (80% -> estourado).
import { access } from '../net/access';
import { budgetState, BUDGET_POLL_MS, loadBudget, onBudgetChange } from '../net/budget';
import type { BudgetMetricState, BudgetStatus } from '../../../shared/budget';
import type { UiComponent, UiContext } from './context';
import { h, setHidden, setText } from './dom';
import { formatTokens, formatUSD } from './format';
import { safeLocalStorage } from './prefs';
import { tr } from '../../../shared/i18n';

const DISMISS_KEY = 'habblaud:budget-dismissed';
/** Primeira leitura depois de a página assentar (a interface abre antes de qualquer rede). */
const FIRST_LOAD_MS = 2_000;

function scopeLabel(m: BudgetMetricState): string {
  if (m.scope === 'global') return tr('escritório');
  const name = m.name ?? m.id ?? '';
  return m.scope === 'project' ? tr('projeto {0}', [name]) : tr('conta {0}', [name]);
}

function amount(metric: BudgetMetricState['metric'], v: number): string {
  return metric === 'costUSD' ? formatUSD(v) : formatTokens(v);
}

/** O limite mais apertado do estado (maior percentual). */
function worstOf(status: BudgetStatus): BudgetMetricState | undefined {
  let worst: BudgetMetricState | undefined;
  for (const m of status.metrics) if (!worst || m.percent > worst.percent) worst = m;
  return worst;
}

export class BudgetBanner implements UiComponent {
  readonly el: HTMLElement;
  private readonly text: HTMLElement;
  private dismissed: string | null;
  private firstLoad: ReturnType<typeof setTimeout> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly ctx: UiContext) {
    const storage = safeLocalStorage();
    try {
      this.dismissed = storage?.getItem(DISMISS_KEY) ?? null;
    } catch {
      this.dismissed = null;
    }
    this.text = h('span', { class: 'ui-banner__text' });
    const adjust = h('button', { class: 'ui-btn ui-btn--sm', type: 'button', text: tr('Ajustar limites'), on: { click: () => this.ctx.toggleSettings() } });
    const dismiss = h('button', {
      class: 'ui-btn ui-btn--sm',
      type: 'button',
      text: tr('Dispensar'),
      title: tr('Dispensar aviso de orçamento'),
      on: { click: () => this.dismiss() },
    });
    this.el = h(
      'div',
      { class: 'ui-banner ui-banner--budget', role: 'status', hidden: true },
      h('span', { class: 'ui-banner__dot', attrs: { 'aria-hidden': 'true' } }),
      this.text,
      adjust,
      dismiss,
    );
    onBudgetChange(() => this.render());
    // Só busca quando a página é local: no celular e no modo demonstração o servidor não tem (ou não expõe) o
    // orçamento. A primeira leitura espera a interface assentar; depois, um poll por minuto.
    const load = () => {
      if (this.firstLoad) {
        clearTimeout(this.firstLoad);
        this.firstLoad = null;
      }
      if (this.ctx.store.mock || access().remote || !access().local) return;
      void loadBudget().then(
        () => this.ctx.invalidate(),
        () => undefined,
      );
    };
    this.firstLoad = setTimeout(load, FIRST_LOAD_MS);
    this.timer = setInterval(() => {
      if (!document.hidden) load();
    }, BUDGET_POLL_MS);
  }

  render(): void {
    const state = budgetState();
    if (!state || this.ctx.store.mock || access().remote || !access().local) {
      setHidden(this.el, true);
      return;
    }
    const worst = worstOf(state.status);
    if (!worst || worst.percent < 80) {
      setHidden(this.el, true);
      return;
    }
    const signature = `${state.status.dayKey}:${state.status.level}`;
    if (this.dismissed === signature) {
      setHidden(this.el, true);
      return;
    }
    const scope = scopeLabel(worst);
    const period = worst.period === 'day' ? tr('diário') : tr('mensal');
    const metric = worst.metric === 'costUSD' ? tr('custo') : tr('tokens');
    const used = amount(worst.metric, worst.used);
    const limit = amount(worst.metric, worst.limit);
    const percent = Math.round(worst.percent);
    setText(
      this.text,
      worst.exceeded
        ? tr('Orçamento estourado: {0} ({1}, {2}) passou do limite: {3} de {4}.', [scope, period, metric, used, limit])
        : tr('Orçamento: {0} ({1}, {2}) chegou a {3}% do limite: {4} de {5}.', [scope, period, metric, percent, used, limit]),
    );
    this.el.classList.toggle('is-over', state.status.level === 'over');
    setHidden(this.el, false);
  }

  private dismiss(): void {
    const state = budgetState();
    if (!state) return;
    this.dismissed = `${state.status.dayKey}:${state.status.level}`;
    try {
      safeLocalStorage()?.setItem(DISMISS_KEY, this.dismissed);
    } catch {
      // sem armazenamento: o aviso volta ao recarregar
    }
    setHidden(this.el, true);
  }
}
