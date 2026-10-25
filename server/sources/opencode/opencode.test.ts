import { describe, expect, it, vi } from 'vitest';
import { OpencodeSource } from './source';
import type { AccountsService } from '../../accounts/service';
import type { Office } from '../../model/office';

describe('OpencodeSource', () => {
  it('registra conta e gerencia ciclo de vida dos agentes via applyHookEvent', () => {
    const mockAccounts = {
      setProviderAccounts: vi.fn(),
    } as unknown as AccountsService;

    const mockOffice = {
      addMain: vi.fn(),
      addSub: vi.fn(),
      setStatus: vi.fn(),
      addActivity: vi.fn(),
      completeSub: vi.fn(),
      closeMain: vi.fn(),
    } as unknown as Office;

    const source = new OpencodeSource({
      accounts: mockAccounts,
      office: mockOffice,
      home: '/fake/home',
    });

    source.start();
    expect(mockAccounts.setProviderAccounts).toHaveBeenCalledWith('opencode', expect.any(Array));

    // session.created
    const handled = source.applyHookEvent('.opencode', {
      type: 'session.created',
      data: {
        sessionID: 'ses_123',
      },
      location: {
        directory: '/projects/test',
      },
    });
    expect(handled).toBe(true);
    expect(mockOffice.addMain).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '.opencode:ses_123',
        sessionId: 'ses_123',
        account: '.opencode',
        provider: 'opencode',
        cwd: '/projects/test',
        status: 'working',
      })
    );

    // tool call
    source.applyHookEvent('.opencode', {
      type: 'session.tool.input.started',
      data: {
        sessionID: 'ses_123',
        name: 'bash',
        id: 'call_1',
      },
    });
    expect(mockOffice.addActivity).toHaveBeenCalledWith(
      '.opencode:ses_123',
      expect.objectContaining({
        id: 'call_1',
        tool: 'bash',
        kind: 'run',
      }),
      true
    );

    // permission asked
    source.applyHookEvent('.opencode', {
      type: 'permission.asked',
      data: {
        sessionID: 'ses_123',
        action: 'run command',
      },
    });
    expect(mockOffice.setStatus).toHaveBeenCalledWith('.opencode:ses_123', 'waiting', 'run command');

    // session succeeded
    source.applyHookEvent('.opencode', {
      type: 'session.execution.succeeded',
      data: {
        sessionID: 'ses_123',
      },
    });
    expect(mockOffice.setStatus).toHaveBeenCalledWith('.opencode:ses_123', 'idle');

    // session deleted
    source.applyHookEvent('.opencode', {
      type: 'session.deleted',
      data: {
        sessionID: 'ses_123',
      },
    });
    expect(mockOffice.closeMain).toHaveBeenCalledWith('.opencode:ses_123');
  });
});
