// Diálogo de ordem geral (Broadcast): envia uma mesma instrução para todos os agentes ativos.
import { tr } from '../../../shared/i18n';
import type { UiContext } from './context';
import { h, setText } from './dom';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    let err = `${res.status} ${res.statusText}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) err = j.error;
    } catch {
      // resposta não-JSON
    }
    throw new Error(err);
  }
  return (await res.json()) as T;
}

export class BroadcastDialog {
  readonly el: HTMLDialogElement;
  private readonly prompt: HTMLTextAreaElement;
  private readonly status: HTMLElement;
  private readonly sendBtn: HTMLButtonElement;
  private readonly countLabel: HTMLElement;

  constructor(private ctx: UiContext) {
    this.prompt = h('textarea', {
      class: 'ui-spawn__prompt',
      attrs: {
        rows: 3,
        placeholder: tr('Digite uma instrução para todos os agentes do escritório...'),
        maxlength: 20000,
      },
    }) as HTMLTextAreaElement;

    this.countLabel = h('p', { class: 'ui-spawn__help' });
    this.status = h('div', { class: 'ui-spawn__status', attrs: { role: 'status', 'aria-live': 'polite' } });

    this.sendBtn = h(
      'button',
      {
        class: 'ui-btn ui-btn--primary',
        type: 'button',
        text: tr('Transmitir ordem'),
        on: { click: () => void this.submit() },
      },
    ) as HTMLButtonElement;

    const cancelBtn = h('button', {
      class: 'ui-btn',
      type: 'button',
      text: tr('Cancelar'),
      on: { click: () => this.close() },
    });

    this.el = h(
      'dialog',
      { class: 'ui-dialog ui-dialog--broadcast' },
      h(
        'form',
        { attrs: { method: 'dialog' }, on: { submit: (e: Event) => { e.preventDefault(); void this.submit(); } } },
        h('h2', { class: 'ui-dialog__title', text: tr('Ordem geral para os agentes') }),
        this.countLabel,
        this.prompt,
        this.status,
        h('div', { class: 'ui-dialog__actions' }, cancelBtn, this.sendBtn),
      ),
    ) as HTMLDialogElement;

    this.prompt.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        void this.submit();
      }
    });
  }

  open(): void {
    const snap = this.ctx.store.snapshot;
    const count = snap?.agents.filter((a) => a.kind === 'main' && a.status !== 'offline').length ?? 0;
    setText(this.countLabel, tr('{0} agentes principais receberão esta mensagem.', [count]));
    setText(this.status, '');
    this.prompt.value = '';
    this.sendBtn.disabled = count === 0;
    if (typeof this.el.showModal === 'function') this.el.showModal();
    this.prompt.focus();
  }

  close(): void {
    if (typeof this.el.close === 'function') this.el.close();
  }

  private async submit(): Promise<void> {
    const text = this.prompt.value.trim();
    if (!text) {
      setText(this.status, tr('Digite uma instrução antes de enviar.'));
      return;
    }

    this.sendBtn.disabled = true;
    setText(this.status, tr('Transmitindo...'));

    try {
      const res = await api<{ sent: unknown[]; count: number }>('/api/messages/broadcast', {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      setText(this.status, tr('Ordem transmitida com sucesso para {0} agentes.', [res.count]));
      setTimeout(() => this.close(), 1200);
    } catch (err) {
      this.sendBtn.disabled = false;
      setText(this.status, tr('Falha ao transmitir ordem: {0}', [String(err)]));
    }
  }
}
