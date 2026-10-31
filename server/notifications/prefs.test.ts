// Preferências da central: tipos, regras por projeto/conta/ferramenta, horário de silêncio (atravessa a meia-noite),
// modo "só na janela do app", validação do PUT e persistência.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { tempDir } from '../test/fixtures';
import { setQuiet } from '../log';
import {
  defaultNotificationPrefs,
  isQuietAt,
  MAX_RULES,
  minutesOfDay,
  notificationAllowed,
  NotificationPrefsStore,
  parseClock,
  parsePrefsPatch,
  sanitizePrefs,
} from './prefs';

setQuiet(true);

/** Instante no fuso local do servidor (o silêncio é em hora local). */
const at = (hours: number, minutes = 0): number => new Date(2026, 5, 15, hours, minutes, 0, 0).getTime();

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function tmpFile(): string {
  const tmp = tempDir();
  cleanup = tmp.cleanup;
  return join(tmp.dir, '.habblaud', 'notifications-prefs.json');
}

describe('horário de silêncio', () => {
  it('interpreta HH:MM e conta os minutos do dia', () => {
    expect(parseClock('00:00')).toBe(0);
    expect(parseClock('07:05')).toBe(425);
    expect(parseClock('23:59')).toBe(1_439);
    for (const bad of ['24:00', '7:00', '12:60', '12', '', 'doze', null])
      expect(parseClock(bad), String(bad)).toBeUndefined();
    expect(minutesOfDay(at(23, 30))).toBe(1_410);
  });

  it('atravessa a meia-noite (22:00 → 07:00) e respeita os limites', () => {
    const quiet = { enabled: true, start: '22:00', end: '07:00' };
    expect(isQuietAt(quiet, at(21, 59))).toBe(false);
    expect(isQuietAt(quiet, at(22, 0))).toBe(true);
    expect(isQuietAt(quiet, at(23, 30))).toBe(true);
    expect(isQuietAt(quiet, at(0, 0))).toBe(true);
    expect(isQuietAt(quiet, at(6, 59))).toBe(true);
    expect(isQuietAt(quiet, at(7, 0))).toBe(false);
    expect(isQuietAt(quiet, at(12, 0))).toBe(false);
  });

  it('janela dentro do mesmo dia e casos degenerados', () => {
    const day = { enabled: true, start: '09:00', end: '17:00' };
    expect(isQuietAt(day, at(8, 59))).toBe(false);
    expect(isQuietAt(day, at(9, 0))).toBe(true);
    expect(isQuietAt(day, at(16, 59))).toBe(true);
    expect(isQuietAt(day, at(17, 0))).toBe(false);
    expect(isQuietAt({ enabled: false, start: '09:00', end: '17:00' }, at(12, 0))).toBe(false);
    // Início igual ao fim não é "o dia inteiro".
    expect(isQuietAt({ enabled: true, start: '12:00', end: '12:00' }, at(12, 0))).toBe(false);
    expect(isQuietAt({ enabled: true, start: 'xx', end: '07:00' }, at(23, 0))).toBe(false);
  });
});

describe('filtros por tipo, projeto, conta e ferramenta', () => {
  it('tipo desligado ou regra false barram o alerta; ausente libera', () => {
    const prefs = defaultNotificationPrefs();
    expect(
      notificationAllowed(prefs, { type: 'permission', project: '/p/x', account: 'a', tool: 'Bash' }, at(12)),
    ).toBe(true);
    prefs.types.permission = false;
    expect(notificationAllowed(prefs, { type: 'permission' }, at(12))).toBe(false);
    expect(notificationAllowed(prefs, { type: 'question' }, at(12))).toBe(true);
    const rules = defaultNotificationPrefs();
    rules.projects['/p/x'] = false;
    rules.accounts.a = false;
    rules.tools.Bash = false;
    expect(notificationAllowed(rules, { type: 'permission', project: '/p/x' }, at(12))).toBe(false);
    expect(notificationAllowed(rules, { type: 'permission', account: 'a' }, at(12))).toBe(false);
    expect(notificationAllowed(rules, { type: 'permission', tool: 'Bash' }, at(12))).toBe(false);
    expect(
      notificationAllowed(rules, { type: 'permission', project: '/p/y', account: 'b', tool: 'Read' }, at(12)),
    ).toBe(true);
    rules.projects['/p/y'] = true;
    expect(notificationAllowed(rules, { type: 'permission', project: '/p/y' }, at(12))).toBe(true);
  });

  it('o silêncio vale por cima das regras', () => {
    const prefs = defaultNotificationPrefs();
    prefs.quiet = { enabled: true, start: '22:00', end: '07:00' };
    expect(notificationAllowed(prefs, { type: 'session-end' }, at(23, 0))).toBe(false);
    expect(notificationAllowed(prefs, { type: 'session-end' }, at(8, 0))).toBe(true);
  });
});

describe('validação e persistência', () => {
  it('aplica um PUT parcial e rejeita payload inválido', () => {
    const current = defaultNotificationPrefs();
    const next = parsePrefsPatch(
      { types: { question: false }, quiet: { enabled: true, start: '23:00', end: '06:30' }, appWindowOnly: true },
      current,
    );
    expect(next).toMatchObject({
      types: { permission: true, question: false },
      quiet: { enabled: true, start: '23:00', end: '06:30' },
      appWindowOnly: true,
    });
    expect(
      parsePrefsPatch({ projects: { '/p/x': false }, accounts: { a: true }, tools: { Bash: false } }, current),
    ).toMatchObject({
      projects: { '/p/x': false },
      accounts: { a: true },
      tools: { Bash: false },
    });

    for (const bad of [
      null,
      [],
      'texto',
      { outra: true },
      { types: { permission: 'sim' } },
      { types: { desconhecido: false } },
      { types: [] },
      { quiet: { enabled: true, start: '25:00', end: '07:00' } },
      { quiet: { enabled: 'sim' } },
      { quiet: 'logo' },
      { appWindowOnly: 'sim' },
      { projects: { '/p/x': 'nao' } },
      { projects: [] },
    ]) {
      expect(parsePrefsPatch(bad, current), JSON.stringify(bad)).toBeUndefined();
    }
    const many = Object.fromEntries(Array.from({ length: MAX_RULES + 1 }, (_, i) => [`p${i}`, false]));
    expect(parsePrefsPatch({ projects: many }, current)).toBeUndefined();
  });

  it('saneia o arquivo (campo inválido cai no padrão) e persiste com escrita atômica', () => {
    expect(sanitizePrefs(null)).toEqual(defaultNotificationPrefs());
    expect(
      sanitizePrefs({
        types: { permission: false, question: 'sim', 'session-end': true },
        quiet: { enabled: true, start: '25:00', end: '07:00' },
        appWindowOnly: true,
        projects: { '/p/x': false, invalido: 'nao' },
        accounts: { a: true },
        tools: { Bash: false },
      }),
    ).toMatchObject({
      types: { permission: false, question: true, 'session-end': true },
      quiet: { enabled: true, start: '22:00', end: '07:00' },
      appWindowOnly: true,
      projects: { '/p/x': false },
      accounts: { a: true },
      tools: { Bash: false },
    });

    const file = tmpFile();
    const store = new NotificationPrefsStore(file);
    store.load();
    expect(store.get()).toEqual(defaultNotificationPrefs());
    const saved = store.set({
      ...defaultNotificationPrefs(),
      appWindowOnly: true,
      quiet: { enabled: true, start: '22:00', end: '07:00' },
    });
    expect(saved.appWindowOnly).toBe(true);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({
      version: 1,
      appWindowOnly: true,
      quiet: { start: '22:00' },
    });

    const again = new NotificationPrefsStore(file);
    again.load();
    expect(again.get()).toEqual(store.get());
  });

  it('arquivo corrompido ou grande demais usa os padrões', () => {
    const file = tmpFile();
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, '{nao é json');
    const store = new NotificationPrefsStore(file);
    store.load();
    expect(store.get()).toEqual(defaultNotificationPrefs());

    writeFileSync(file, `{"x":"${'a'.repeat(300_000)}"}`);
    const big = new NotificationPrefsStore(file);
    big.load();
    expect(big.get()).toEqual(defaultNotificationPrefs());
  });
});
