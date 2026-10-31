// Modelo puro da central de notificações no cliente: validação das respostas do servidor e o filtro local.
import { describe, expect, it } from 'vitest';
import {
  defaultClientPrefs,
  filterNotifications,
  parseNotificationItem,
  parseNotificationPrefs,
  parseNotifications,
  projectLabel,
} from './notifications';

describe('notificações no cliente', () => {
  it('valida um item e descarta o que não tem o formato', () => {
    expect(
      parseNotificationItem({
        id: 'n-1',
        at: 10,
        type: 'permission',
        status: 'new',
        title: 'Pedido',
        summary: 'Resumo',
        project: '/p/x',
      }),
    ).toMatchObject({
      id: 'n-1',
      at: 10,
      type: 'permission',
      status: 'new',
      title: 'Pedido',
      summary: 'Resumo',
      project: '/p/x',
    });
    for (const bad of [
      null,
      [],
      { id: 'n-1', at: 10, type: 'outro', status: 'new', title: 'x' },
      { id: 'n-1', at: 10, type: 'permission', status: 'outro', title: 'x' },
      { id: '', at: 10, type: 'permission', status: 'new', title: 'x' },
      { id: 'n-1', at: 'agora', type: 'permission', status: 'new', title: 'x' },
      { id: 'n-1', at: 10, type: 'permission', status: 'new', title: '   ' },
    ]) {
      expect(parseNotificationItem(bad), JSON.stringify(bad)).toBeUndefined();
    }
  });

  it('ordena do mais novo para o mais antigo e conta as não lidas', () => {
    const p = parseNotifications({
      notifications: [
        { id: 'a', at: 10, type: 'permission', status: 'read', title: 'a' },
        { id: 'b', at: 30, type: 'question', status: 'new', title: 'b' },
        { id: 'c', at: 20, type: 'session-end', status: 'new', title: 'c' },
        { invalido: true },
      ],
      unread: 2,
      total: 3,
      quiet: true,
    });
    expect(p.notifications.map((n) => n.id)).toEqual(['b', 'c', 'a']);
    expect(p).toMatchObject({ unread: 2, total: 3, quiet: true });
    expect(parseNotifications(null)).toEqual({ notifications: [], unread: 0, total: 0, quiet: false });
    // Sem contadores do servidor, conta os itens novos recebidos.
    expect(
      parseNotifications({ notifications: [{ id: 'a', at: 1, type: 'waiting', status: 'new', title: 'a' }] }),
    ).toMatchObject({ unread: 1, total: 1 });
  });

  it('filtro de não lidas e nome curto do projeto', () => {
    const list = parseNotifications({
      notifications: [
        { id: 'a', at: 3, type: 'permission', status: 'new', title: 'a' },
        { id: 'b', at: 2, type: 'permission', status: 'read', title: 'b' },
        { id: 'c', at: 1, type: 'permission', status: 'resolved', title: 'c' },
      ],
    }).notifications;
    expect(filterNotifications(list, 'all').map((n) => n.id)).toEqual(['a', 'b', 'c']);
    expect(filterNotifications(list, 'unread').map((n) => n.id)).toEqual(['a']);
    expect(projectLabel('/p/loja')).toBe('loja');
    expect(projectLabel('C:\\projetos\\loja\\')).toBe('loja');
    expect(projectLabel('')).toBe('');
  });

  it('preferências: padrões e validação da resposta', () => {
    expect(defaultClientPrefs()).toMatchObject({
      quiet: { enabled: false },
      appWindowOnly: false,
      types: { permission: true },
    });
    const prefs = parseNotificationPrefs({
      types: { permission: false, question: true, 'session-end': true, waiting: false },
      quiet: { enabled: true, start: '22:00', end: '07:00' },
      appWindowOnly: true,
      projects: { '/p/x': false, invalido: 'nao' },
      accounts: { a: true },
      tools: { Bash: false },
    });
    expect(prefs).toMatchObject({
      types: { permission: false, waiting: false },
      quiet: { enabled: true, start: '22:00', end: '07:00' },
      appWindowOnly: true,
      projects: { '/p/x': false },
      accounts: { a: true },
      tools: { Bash: false },
    });
    for (const bad of [
      null,
      {},
      { types: {}, quiet: {} },
      { types: {}, quiet: { enabled: 'sim' }, appWindowOnly: false },
    ]) {
      expect(parseNotificationPrefs(bad), JSON.stringify(bad)).toBeUndefined();
    }
  });
});
