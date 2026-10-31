// Histórico da central de notificações: itens, estados, retenção, persistência e o cuidado com segredos/prompts.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { tempDir } from '../test/fixtures';
import { setQuiet } from '../log';
import { NotificationInbox, NOTIFICATION_LIMIT, parseNotificationItem } from './inbox';

setQuiet(true);

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function tmpFile(): string {
  const tmp = tempDir();
  cleanup = tmp.cleanup;
  return join(tmp.dir, '.habblaud', 'notifications.json');
}

describe('inbox de notificações', () => {
  it('grava, lista do mais novo para o mais antigo e conta os não lidos', () => {
    let now = 1_000;
    const inbox = new NotificationInbox(undefined, { now: () => now++ });
    const a = inbox.record({
      type: 'permission',
      title: 'Ana pede permissão',
      agentId: 'a:1',
      agentName: 'Ana',
      account: 'a',
      project: '/p/loja',
      tool: 'Bash',
    });
    const b = inbox.record({ type: 'question', title: 'Ana tem uma pergunta' });
    expect(a.id).not.toBe(b.id);
    const list = inbox.list();
    expect(list.notifications.map((n) => n.id)).toEqual([b.id, a.id]);
    expect(list).toMatchObject({ unread: 2, total: 2 });
    expect(list.notifications[1]).toMatchObject({
      type: 'permission',
      status: 'new',
      agentName: 'Ana',
      project: '/p/loja',
      tool: 'Bash',
    });
  });

  it('marca como lido (um por vez e todos) e resolve os itens de um agente', () => {
    const inbox = new NotificationInbox(undefined, { now: () => 1_000 });
    const a = inbox.record({ type: 'permission', title: 'a', agentId: 'a:1' });
    const b = inbox.record({ type: 'permission', title: 'b', agentId: 'a:1' });
    const c = inbox.record({ type: 'session-end', title: 'c', agentId: 'a:2' });
    expect(inbox.markRead('nao-existe')).toBeUndefined();
    expect(inbox.markRead(a.id)).toBe('read');
    expect(inbox.countUnread()).toBe(2);
    expect(inbox.resolveAgent('a:1')).toBe(2);
    expect(inbox.markRead(b.id)).toBe('resolved');
    expect(inbox.markAllRead()).toBe(1);
    expect(inbox.countUnread()).toBe(0);
    expect(inbox.list({ filter: 'unread' })).toMatchObject({ notifications: [], unread: 0, total: 3 });
    expect(inbox.resolve(c.id)).toBe('resolved');
    expect(inbox.resolve('nao-existe')).toBeUndefined();
  });

  it('limita o histórico e guarda só os itens mais novos', () => {
    const inbox = new NotificationInbox(undefined, { now: () => 2_000, limit: 3 });
    for (let i = 0; i < 5; i++) inbox.record({ type: 'waiting', title: `item ${i}` });
    const titles = inbox.all().map((n) => n.title);
    expect(titles).toEqual(['item 4', 'item 3', 'item 2']);
    expect(inbox.list({ limit: 2 }).notifications).toHaveLength(2);
    expect(inbox.list({ filter: 'all', limit: 1 }).total).toBe(3);
    // O limite padrão continua valendo para a central de verdade.
    const big = new NotificationInbox(undefined, { now: () => 2_000 });
    for (let i = 0; i < NOTIFICATION_LIMIT + 5; i++) big.record({ type: 'waiting', title: `n${i}` });
    expect(big.all()).toHaveLength(NOTIFICATION_LIMIT);
  });

  it('persiste no arquivo e recarrega com os mesmos itens', () => {
    const file = tmpFile();
    const inbox = new NotificationInbox(file, { now: () => 5_000 });
    const item = inbox.record({
      type: 'permission',
      title: 'Pedido',
      summary: 'Resumo curto',
      agentName: 'Bia',
      account: 'b',
      project: '/p/x',
      tool: 'Edit',
    });
    inbox.markRead(item.id);
    const again = new NotificationInbox(file);
    again.load();
    expect(again.all()).toEqual([
      expect.objectContaining({
        id: item.id,
        status: 'read',
        title: 'Pedido',
        summary: 'Resumo curto',
        agentName: 'Bia',
      }),
    ]);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({
      version: 1,
      items: [expect.objectContaining({ id: item.id })],
    });
  });

  it('nunca guarda prompt, comando ou segredo completo', () => {
    const file = tmpFile();
    const inbox = new NotificationInbox(file, { now: () => 9_000 });
    inbox.record({
      type: 'permission',
      title: 'Rodar comando',
      summary: `GITHUB_TOKEN=ghp_segredo1234567890\nnpm run deploy --token abc123456\n${'linha '.repeat(200)}`,
      agentName: 'Ana',
    });
    const saved = readFileSync(file, 'utf8');
    expect(saved).not.toContain('ghp_segredo');
    expect(saved).not.toContain('abc123456');
    const item = inbox.all()[0];
    expect(item.summary).toBeDefined();
    expect(item.summary!.length).toBeLessThanOrEqual(180);
    expect(item.summary).not.toContain('\n');
  });

  it('arquivo corrompido ou ausente começa vazio; item inválido é descartado', () => {
    const file = tmpFile();
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, '{quebrado');
    const inbox = new NotificationInbox(file);
    expect(() => inbox.load()).not.toThrow();
    expect(inbox.all()).toEqual([]);

    expect(parseNotificationItem({ id: 'x', at: 1, type: 'permission', status: 'new', title: 'ok' })).toBeDefined();
    expect(parseNotificationItem({ id: 'x', at: 1, type: 'outro', status: 'new', title: 'ok' })).toBeUndefined();
    expect(parseNotificationItem({ id: '', at: 1, type: 'permission', status: 'new', title: 'ok' })).toBeUndefined();
    expect(
      parseNotificationItem({ id: 'x', at: 'agora', type: 'permission', status: 'new', title: 'ok' }),
    ).toBeUndefined();
    expect(parseNotificationItem({ id: 'x', at: 1, type: 'permission', status: 'new', title: '   ' })).toBeUndefined();
    expect(parseNotificationItem(null)).toBeUndefined();
  });
});
