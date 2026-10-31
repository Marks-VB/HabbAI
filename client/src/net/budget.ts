// Orçamento no navegador: lê e grava GET/PUT /api/budget (só pela página do próprio computador; no celular o
// servidor responde 403 e a interface esconde o recurso). O estado é pequeno e muda devagar: um poll por minuto
// basta, além de cada gravação feita nas Configurações.
import type { BudgetConfig, BudgetResponse } from '../../../shared/budget';
import { tr } from '../../../shared/i18n';

/** Intervalo do poll do banner (o servidor também reavalia a cada 30 s). */
export const BUDGET_POLL_MS = 60_000;
/** Prazo do GET/PUT (a página não fica esperando um servidor travado). */
export const BUDGET_TIMEOUT_MS = 5_000;

let current: BudgetResponse | null = null;
const listeners = new Set<() => void>();

/** Última resposta válida do servidor (null = ainda não carregou ou está indisponível). */
export function budgetState(): BudgetResponse | null {
  return current;
}

/** Avisa quando o estado muda (o banner e as Configurações se atualizam). Devolve a função que cancela. */
export function onBudgetChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

function publish(next: BudgetResponse): void {
  current = next;
  for (const cb of listeners) {
    try {
      cb();
    } catch {
      // um ouvinte quebrado não impede os outros
    }
  }
}

function isResponse(v: unknown): v is BudgetResponse {
  const o = v as Partial<BudgetResponse> | null;
  return !!o && !!o.config && !!o.status && Array.isArray(o.status.metrics) && typeof o.status.level === 'string';
}

/** GET /api/budget. Devolve o estado atual (mesmo quando a resposta não muda nada) ou null. */
export async function loadBudget(fetchImpl: typeof fetch = fetch): Promise<BudgetResponse | null> {
  try {
    const res = await fetchImpl('/api/budget', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(BUDGET_TIMEOUT_MS) });
    if (!res.ok) return current;
    const body: unknown = await res.json();
    if (!isResponse(body)) return current;
    publish(body);
    return body;
  } catch {
    return current;
  }
}

export type BudgetSaveResult = { ok: true; response: BudgetResponse } | { ok: false; error: string };

/** PUT /api/budget com a configuração inteira (os escopos vêm da última leitura). */
export async function saveBudget(config: BudgetConfig, fetchImpl: typeof fetch = fetch): Promise<BudgetSaveResult> {
  try {
    const res = await fetchImpl('/api/budget', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
      credentials: 'same-origin',
      cache: 'no-store',
      signal: AbortSignal.timeout(BUDGET_TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      const error = (body as { error?: unknown } | null)?.error;
      return { ok: false, error: typeof error === 'string' ? error : `HTTP ${res.status}` };
    }
    if (!isResponse(body)) return { ok: false, error: tr('resposta inválida do servidor') };
    publish(body);
    return { ok: true, response: body };
  } catch {
    return { ok: false, error: tr('sem resposta do servidor') };
  }
}

/** Só para testes. */
export function setBudgetState(v: BudgetResponse | null): void {
  current = v;
}
