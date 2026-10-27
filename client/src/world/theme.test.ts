import { describe, expect, it } from 'vitest';
import { isWorldOfficeTheme, seasonalThemeFor } from './api';

describe('tema do escritório', () => {
  const at = (month: number, day: number, hour = 12) => new Date(2026, month - 1, day, hour);

  it('automático segue o calendário (hora local)', () => {
    expect(seasonalThemeFor('auto', at(9, 30, 23))).toBe('none');
    expect(seasonalThemeFor('auto', at(10, 1, 0))).toBe('halloween');
    expect(seasonalThemeFor('auto', at(10, 31, 23))).toBe('halloween');
    expect(seasonalThemeFor('auto', at(11, 1, 0))).toBe('christmas');
    expect(seasonalThemeFor('auto', at(12, 26, 23))).toBe('christmas');
    expect(seasonalThemeFor('auto', at(12, 27, 0))).toBe('none');
    expect(seasonalThemeFor('auto', at(1, 1))).toBe('none');
    expect(seasonalThemeFor('auto', at(7, 15))).toBe('none');
    // Sem preferência (opções antigas do mundo) vale o automático.
    expect(seasonalThemeFor(undefined, at(10, 13))).toBe('halloween');
  });

  it('escolha fixa vale o ano todo', () => {
    for (const date of [at(1, 1), at(10, 13), at(12, 1)]) {
      expect(seasonalThemeFor('none', date)).toBe('none');
      expect(seasonalThemeFor('christmas', date)).toBe('christmas');
      expect(seasonalThemeFor('halloween', date)).toBe('halloween');
      expect(seasonalThemeFor('cyberpunk', date)).toBe('cyberpunk');
      expect(seasonalThemeFor('retro', date)).toBe('retro');
      expect(seasonalThemeFor('orbital', date)).toBe('orbital');
      expect(seasonalThemeFor('spring', date)).toBe('spring');
      expect(seasonalThemeFor('autumn', date)).toBe('autumn');
      expect(seasonalThemeFor('junina', date)).toBe('junina');
    }
  });

  it('camada de estações segue o calendário do hemisfério sul', () => {
    expect(seasonalThemeFor('seasons', at(9, 23))).toBe('spring');
    expect(seasonalThemeFor('seasons', at(11, 15))).toBe('spring');
    expect(seasonalThemeFor('seasons', at(1, 10))).toBe('spring');
    expect(seasonalThemeFor('seasons', at(2, 28))).toBe('spring');
    expect(seasonalThemeFor('seasons', at(3, 1))).toBe('autumn');
    expect(seasonalThemeFor('seasons', at(5, 20))).toBe('autumn');
    expect(seasonalThemeFor('seasons', at(6, 12))).toBe('junina');
    expect(seasonalThemeFor('seasons', at(7, 24))).toBe('junina');
    expect(seasonalThemeFor('seasons', at(8, 3))).toBe('none');
  });

  it('só os temas sazonais vão para o prédio do World', () => {
    for (const theme of ['auto', 'none', 'christmas', 'halloween'] as const) expect(isWorldOfficeTheme(theme)).toBe(true);
    expect(isWorldOfficeTheme('cyberpunk')).toBe(false);
    expect(isWorldOfficeTheme('retro')).toBe(false);
    expect(isWorldOfficeTheme('orbital')).toBe(false);
    expect(isWorldOfficeTheme('seasons')).toBe(false);
    expect(isWorldOfficeTheme(undefined)).toBe(false);
  });
});
