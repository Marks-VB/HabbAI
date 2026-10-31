import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { copyBudgetConfig } from '../../shared/budget';
import { setQuiet } from '../log';
import { tempDir } from '../test/fixtures';
import { BUDGET_FILE_MAX, BudgetStore, MAX_LIMIT_COST, MAX_LIMIT_TOKENS, MAX_SCOPE_ID, MAX_SCOPES, parseBudgetConfig } from './limits';

setQuiet(true);

const valid = {
  version: 1,
  limits: { day: { costUSD: 5, tokens: 2_000_000 }, month: { costUSD: 80 } },
  projects: { '/p/loja': { day: { costUSD: 2 } } },
  accounts: { '.claude': { month: { tokens: 10_000_000 } } },
};

describe('parseBudgetConfig', () => {
  it('aceita o formato completo e normaliza a cópia', () => {
    const r = parseBudgetConfig(valid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual(valid);
    const copy = copyBudgetConfig(r.value);
    copy.limits.day!.costUSD = 999;
    copy.projects!['/p/loja'].day!.costUSD = 999;
    expect(r.value.limits.day?.costUSD).toBe(5);
    expect(r.value.projects?.['/p/loja'].day?.costUSD).toBe(2);
  });

  it('aceita configuração vazia (sem nenhum limite)', () => {
    const r = parseBudgetConfig({});
    expect(r).toEqual({ ok: true, value: { version: 1, limits: {} } });
    expect(parseBudgetConfig({ version: 1, limits: {} }).ok).toBe(true);
  });

  it('recusa valores fora do formato: negativos, infinitos, texto, vazio e desconhecidos', () => {
    const bad: unknown[] = [
      null,
      [],
      'x',
      { version: 2, limits: {} },
      { limits: { day: { costUSD: -1 } } },
      { limits: { day: { costUSD: Number.NaN } } },
      { limits: { day: { costUSD: Number.POSITIVE_INFINITY } } },
      { limits: { day: { costUSD: '10' } } },
      { limits: { day: { costUSD: MAX_LIMIT_COST + 1 } } },
      { limits: { day: { tokens: MAX_LIMIT_TOKENS + 1 } } },
      { limits: { day: { tokens: 1.5 } } },
      { limits: { day: {} } },
      { limits: { day: { costUSD: 1, extra: 2 } } },
      { limits: { week: { costUSD: 1 } } },
      { limits: {}, limite: {} },
      { limits: { day: 3 } },
      { projects: [] },
      { projects: { '': { day: { costUSD: 1 } } } },
      { projects: { ['x'.repeat(MAX_SCOPE_ID + 1)]: { day: { costUSD: 1 } } } },
      { projects: { '/p': {} } },
      { projects: { '/p': { day: {} } } },
      { accounts: { '.claude': { month: { costUSD: -0.01 } } } },
    ];
    for (const raw of bad) {
      const r = parseBudgetConfig(raw);
      expect(r.ok, JSON.stringify(raw)).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(0);
    }
  });

  it('recusa chaves que mexem no protótipo', () => {
    const raw = JSON.parse('{"version":1,"limits":{},"projects":{"__proto__":{"day":{"costUSD":1}}}}');
    const r = parseBudgetConfig(raw);
    expect(r.ok).toBe(false);
  });

  it('limita a quantidade de escopos', () => {
    const projects: Record<string, unknown> = {};
    for (let i = 0; i <= MAX_SCOPES; i++) projects[`/p/${i}`] = { day: { costUSD: 1 } };
    expect(parseBudgetConfig({ version: 1, limits: {}, projects }).ok).toBe(false);
  });

  it('aceita limite zero (qualquer gasto estoura) e normaliza -0', () => {
    const r = parseBudgetConfig({ limits: { day: { costUSD: -0, tokens: 0 } } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.is(r.value.limits.day?.costUSD, -0)).toBe(false);
    expect(r.value.limits.day).toEqual({ costUSD: 0, tokens: 0 });
  });
});

describe('BudgetStore', () => {
  it('grava de forma atômica e relê no boot', () => {
    const tmp = tempDir();
    try {
      const file = join(tmp.dir, 'budget.json');
      const store = new BudgetStore(file);
      store.load();
      expect(store.get()).toEqual({ version: 1, limits: {} });

      const r = store.save(valid);
      expect(r.ok).toBe(true);
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(valid);

      const again = new BudgetStore(file);
      again.load();
      expect(again.get()).toEqual(valid);
    } finally {
      tmp.cleanup();
    }
  });

  it('arquivo ausente, ilegível ou grande demais cai nos limites vazios', () => {
    const tmp = tempDir();
    try {
      const missing = new BudgetStore(join(tmp.dir, 'nao-existe.json'));
      missing.load();
      expect(missing.get()).toEqual({ version: 1, limits: {} });

      const broken = join(tmp.dir, 'quebrado.json');
      writeFileSync(broken, '{"version":1,"limits":');
      const s1 = new BudgetStore(broken);
      s1.load();
      expect(s1.get()).toEqual({ version: 1, limits: {} });

      const big = join(tmp.dir, 'grande.json');
      writeFileSync(big, `{"version":1,"limits":{},"x":"${'a'.repeat(BUDGET_FILE_MAX)}"}`);
      const s2 = new BudgetStore(big);
      s2.load();
      expect(s2.get()).toEqual({ version: 1, limits: {} });
    } finally {
      tmp.cleanup();
    }
  });

  it('gravação que falha mantém os limites anteriores e devolve o motivo', () => {
    const tmp = tempDir();
    try {
      // O "diretório" é um arquivo: o mkdir não consegue criar a pasta.
      const blocker = join(tmp.dir, 'bloqueio');
      writeFileSync(blocker, 'x');
      const store = new BudgetStore(join(blocker, 'budget.json'));
      store.load();
      const r = store.save(valid);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(0);
      expect(store.get()).toEqual({ version: 1, limits: {} });
    } finally {
      tmp.cleanup();
    }
  });

  it('valor inválido não é gravado', () => {
    const tmp = tempDir();
    try {
      const file = join(tmp.dir, 'budget.json');
      mkdirSync(tmp.dir, { recursive: true });
      const store = new BudgetStore(file);
      const r = store.save({ limits: { day: { costUSD: -5 } } });
      expect(r.ok).toBe(false);
      expect(store.get()).toEqual({ version: 1, limits: {} });
      expect(() => readFileSync(file, 'utf8')).toThrow();
    } finally {
      tmp.cleanup();
    }
  });
});
