// Fonte de agentes do opencode (AgentSource 'opencode'):
// Conecta ao serviço local do opencode (API + SSE) e também aceita eventos via POST /api/agents/events.
import { existsSync, readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AgentStatus, SourceInfo } from '../../../shared/types';
import type { AccountsService } from '../../accounts/service';
import type { Office } from '../../model/office';
import type { AgentSource } from '../source';

export interface OpencodeSourceOptions {
  accounts: AccountsService;
  office: Office;
  home?: string;
  pollMs?: number;
}

interface OpencodeSession {
  sessionId: string;
  parentSessionId?: string;
  agentId: string;
  cwd: string;
  status: AgentStatus;
  lastAt: number;
  toolCalls: number;
  tokensIn: number;
  tokensOut: number;
  costUSD?: number;
  model?: string;
}

interface OpencodeServiceConfig {
  url: string;
  password?: string;
  pid?: number;
}

export class OpencodeSource implements AgentSource {
  readonly provider = 'opencode';
  private readonly home: string;
  private readonly configDir: string;
  private readonly stateDir: string;
  private readonly sessions = new Map<string, OpencodeSession>();
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  private sseReq: any = null;
  private service: OpencodeServiceConfig | null = null;

  constructor(private readonly opts: OpencodeSourceOptions) {
    this.home = opts.home ?? homedir();
    this.configDir = join(this.home, '.config', 'opencode');
    this.stateDir = join(this.home, '.local', 'state', 'opencode');
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    this.opts.accounts.setProviderAccounts('opencode', [
      {
        dir: this.configDir,
        detected: {
          id: '.opencode',
          name: 'opencode',
          short: 'OC',
          color: '#f5c242',
          configDir: this.configDir,
          provider: 'opencode',
        },
      },
    ]);

    this.checkService();
    this.timer = setInterval(() => this.poll(), this.opts.pollMs ?? 3000);
    this.timer.unref?.();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.sseReq) {
      try {
        this.sseReq.destroy();
      } catch {
        // ignora
      }
      this.sseReq = null;
    }
    for (const s of this.sessions.values()) {
      if (s.parentSessionId) {
        this.opts.office.completeSub(s.agentId);
      } else {
        this.opts.office.closeMain(s.agentId);
      }
    }
    this.sessions.clear();
  }

  sources(): SourceInfo[] {
    return [
      {
        provider: 'opencode',
        label: '.opencode',
        path: this.configDir,
        sessions: this.sessions.size,
        ok: true,
      },
    ];
  }

  transcriptPathOf(_agentId: string): string | undefined {
    return undefined;
  }

  private checkService(): OpencodeServiceConfig | null {
    const candidates = [
      join(this.stateDir, 'service.json'),
      join(this.configDir, 'service.json'),
    ];

    for (const p of candidates) {
      if (existsSync(p)) {
        try {
          const raw = JSON.parse(readFileSync(p, 'utf8'));
          if (raw?.url) {
            this.service = {
              url: raw.url,
              password: raw.password,
              pid: raw.pid,
            };
            return this.service;
          }
        } catch {
          // ignora
        }
      }
    }
    return null;
  }

  private poll(): void {
    if (!this.running) return;
    const svc = this.service ?? this.checkService();
    if (!svc) return;

    this.fetchSessions(svc).catch(() => {});
    if (!this.sseReq) {
      this.connectEventStream(svc);
    }
  }

  private async fetchSessions(svc: OpencodeServiceConfig): Promise<void> {
    try {
      const headers: Record<string, string> = {};
      if (svc.password) {
        headers['Authorization'] = 'Basic ' + Buffer.from(`opencode:${svc.password}`).toString('base64');
      }

      const res = await fetch(`${svc.url}/api/session`, {
        headers,
        signal: AbortSignal.timeout(2000),
      });
      if (!res.ok) return;

      const body = (await res.json()) as { data?: Array<Record<string, any>> };
      if (!Array.isArray(body?.data)) return;

      const now = Date.now();
      const activeIds = new Set<string>();

      for (const item of body.data) {
        const sid = item.id;
        if (typeof sid !== 'string') continue;

        const updated = item.time?.updated || item.time?.created || 0;
        // Sessões ativas ou atualizadas nos últimos 30 minutos
        if (now - updated > 30 * 60_000) continue;

        const agentId = `.opencode:${sid}`;
        activeIds.add(agentId);

        const cwd = item.location?.directory || process.cwd();
        const role = typeof item.agent === 'string' ? item.agent : 'opencode';
        const isIdle = item.outcome === 'succeeded' || item.outcome === 'failed' || (now - updated > 60_000);
        const status: AgentStatus = isIdle ? 'idle' : 'working';

        const tokensIn = (item.tokens?.input ?? 0) + (item.tokens?.cache?.read ?? 0);
        const tokensOut = (item.tokens?.output ?? 0) + (item.tokens?.reasoning ?? 0);
        const costUSD = item.cost ?? 0;
        const model = item.model?.id;

        let s = this.sessions.get(agentId);
        if (!s) {
          s = {
            sessionId: sid,
            parentSessionId: item.parentID,
            agentId,
            cwd,
            status,
            lastAt: updated,
            toolCalls: 0,
            tokensIn,
            tokensOut,
            costUSD,
            model,
          };
          this.sessions.set(agentId, s);

          if (item.parentID) {
            this.opts.office.addSub({
              id: agentId,
              parentId: `.opencode:${item.parentID}`,
              sessionId: sid,
              role: `Sub (${role})`,
              background: false,
              startedAt: item.time?.created || now,
            });
          } else {
            this.opts.office.addMain({
              id: agentId,
              sessionId: sid,
              account: '.opencode',
              provider: 'opencode',
              role,
              cwd,
              status,
              startedAt: item.time?.created || now,
            });
          }
        } else {
          s.tokensIn = tokensIn;
          s.tokensOut = tokensOut;
          s.costUSD = costUSD;
          if (model) s.model = model;
          if (s.status !== status) {
            s.status = status;
            this.opts.office.setStatus(agentId, status);
          }
        }

        this.opts.office.applyTranscript(agentId, {
          tasks: [],
          stats: {
            toolCalls: s.toolCalls,
            tokensIn,
            tokensOut,
            costUSD,
            subagents: 0,
          },
          model: s.model,
          lastAt: updated,
        });
      }
    } catch {
      // falha silenciosa
    }
  }

  private connectEventStream(svc: OpencodeServiceConfig): void {
    if (this.sseReq || !this.running) return;

    try {
      const u = new URL('/api/event', svc.url);
      const isHttps = u.protocol === 'https:';
      const reqFn = isHttps ? httpsRequest : httpRequest;

      const headers: Record<string, string> = {
        Accept: 'text/event-stream',
      };
      if (svc.password) {
        headers['Authorization'] = 'Basic ' + Buffer.from(`opencode:${svc.password}`).toString('base64');
      }

      const req = reqFn(u, { headers }, (res) => {
        if (res.statusCode !== 200) {
          req.destroy();
          this.sseReq = null;
          return;
        }

        let buffer = '';
        res.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data:')) {
              try {
                const event = JSON.parse(trimmed.slice(5).trim());
                this.applyHookEvent('.opencode', event);
              } catch {
                // ignora json inválido
              }
            }
          }
        });

        res.on('close', () => {
          this.sseReq = null;
        });
      });

      req.on('error', () => {
        this.sseReq = null;
      });

      this.sseReq = req;
      req.end();
    } catch {
      this.sseReq = null;
    }
  }

  applyHookEvent(account: string | undefined, event: Record<string, unknown>): boolean {
    const type = typeof event.type === 'string' ? event.type : '';
    const data = (event.data && typeof event.data === 'object' ? event.data : {}) as Record<string, unknown>;
    const sid = typeof data.sessionID === 'string' ? data.sessionID : undefined;
    if (!sid) return false;

    const accId = account || '.opencode';
    const agentId = `${accId}:${sid}`;
    const loc = event.location as Record<string, unknown> | undefined;
    const cwd = typeof loc?.directory === 'string' ? loc.directory : process.cwd();
    const parentId = typeof data.parentID === 'string' ? data.parentID : undefined;

    if (type === 'session.created' || type === 'session.execution.started') {
      let s = this.sessions.get(agentId);
      if (!s) {
        s = {
          sessionId: sid,
          parentSessionId: parentId,
          agentId,
          cwd,
          status: 'working',
          lastAt: Date.now(),
          toolCalls: 0,
          tokensIn: 0,
          tokensOut: 0,
        };
        this.sessions.set(agentId, s);

        if (parentId) {
          const parentAgentId = `${accId}:${parentId}`;
          this.opts.office.addSub({
            id: agentId,
            parentId: parentAgentId,
            sessionId: sid,
            role: 'Subagente (opencode)',
            background: false,
            startedAt: Date.now(),
          });
        } else {
          this.opts.office.addMain({
            id: agentId,
            sessionId: sid,
            account: accId,
            provider: 'opencode',
            role: 'opencode',
            cwd,
            status: 'working',
            startedAt: Date.now(),
          });
        }
      } else {
        s.status = 'working';
        s.lastAt = Date.now();
        this.opts.office.setStatus(agentId, 'working');
      }
    } else if (type === 'session.step.started' || type === 'session.reasoning.delta') {
      let s = this.sessions.get(agentId);
      if (!s) {
        s = {
          sessionId: sid,
          parentSessionId: parentId,
          agentId,
          cwd,
          status: 'working',
          lastAt: Date.now(),
          toolCalls: 0,
          tokensIn: 0,
          tokensOut: 0,
        };
        this.sessions.set(agentId, s);
        this.opts.office.addMain({
          id: agentId,
          sessionId: sid,
          account: accId,
          provider: 'opencode',
          role: 'opencode',
          cwd,
          status: 'working',
          startedAt: Date.now(),
        });
      } else if (s.status !== 'working') {
        s.status = 'working';
        this.opts.office.setStatus(agentId, 'working');
      }
    } else if (type === 'session.tool.input.started' || type === 'session.tool.call') {
      const s = this.sessions.get(agentId);
      if (s) s.toolCalls++;
      const toolName = typeof data.name === 'string' ? data.name : typeof data.tool === 'string' ? data.tool : 'tool';
      const callId = typeof data.id === 'string' ? data.id : `oc-${Date.now()}`;
      const isSub = toolName === 'subagent';
      this.opts.office.addActivity(
        agentId,
        {
          id: callId,
          kind: isSub ? 'delegate' : 'run',
          icon: isSub ? '🤝' : '⚡',
          text: `opencode: ${toolName}`,
          tool: toolName,
          at: Date.now(),
        },
        true,
      );
    } else if (type === 'permission.asked') {
      const reason = typeof data.action === 'string' ? data.action : 'permissão';
      this.opts.office.setStatus(agentId, 'waiting', reason);
    } else if (
      type === 'session.execution.succeeded' ||
      type === 'session.execution.failed' ||
      type === 'session.execution.interrupted' ||
      type === 'session.idle'
    ) {
      const s = this.sessions.get(agentId);
      if (s) {
        s.status = 'idle';
        if (s.parentSessionId) {
          this.opts.office.completeSub(agentId);
        } else {
          this.opts.office.setStatus(agentId, 'idle');
        }
      }
    } else if (type === 'session.deleted') {
      const s = this.sessions.get(agentId);
      if (s) {
        if (s.parentSessionId) {
          this.opts.office.completeSub(agentId);
        } else {
          this.opts.office.closeMain(agentId);
        }
        this.sessions.delete(agentId);
      }
    }

    return true;
  }
}
