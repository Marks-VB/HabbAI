// Fonte de agentes do Gemini CLI (AgentSource 'gemini'):
// Observa sessões ativas e eventos dos hooks (SessionStart, BeforeTool, AfterTool, SessionEnd).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AgentStatus, SourceInfo } from '../../../shared/types';
import type { AccountsService } from '../../accounts/service';
import type { Office } from '../../model/office';
import type { AgentSource } from '../source';
import type { TerminalParser } from '../terminal';
import { createGeminiTerminalParser } from './terminal';
import { parseGeminiChat } from './transcript';

export interface GeminiSourceOptions {
  accounts: AccountsService;
  office: Office;
  home?: string;
  pollMs?: number;
}

interface GeminiSession {
  account: string;
  sessionId: string;
  chatPath?: string;
  agentId: string;
  lastMtime: number;
  status: AgentStatus;
}

export class GeminiSource implements AgentSource {
  readonly provider = 'gemini';
  private readonly home: string;
  private readonly geminiDir: string;
  private readonly sessions = new Map<string, GeminiSession>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(private readonly opts: GeminiSourceOptions) {
    this.home = opts.home ?? homedir();
    this.geminiDir = join(this.home, '.gemini');
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    if (existsSync(this.geminiDir)) {
      this.opts.accounts.setProviderAccounts('gemini', [
        {
          dir: this.geminiDir,
          detected: {
            id: '.gemini',
            name: 'Gemini CLI',
            short: 'GE',
            color: '#4da3ff',
            configDir: this.geminiDir,
            provider: 'gemini',
          },
        },
      ]);
    }

    this.scan();
    this.timer = setInterval(() => this.poll(), this.opts.pollMs ?? 2000);
    this.timer.unref?.();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    for (const s of this.sessions.values()) {
      this.opts.office.closeMain(s.agentId);
    }
    this.sessions.clear();
  }

  sources(): SourceInfo[] {
    return [
      {
        provider: 'gemini',
        label: '.gemini',
        path: this.geminiDir,
        sessions: this.sessions.size,
        ok: true,
      },
    ];
  }

  transcriptPathOf(agentId: string): string | undefined {
    return this.sessions.get(agentId)?.chatPath;
  }

  terminalParser(_agentId: string): TerminalParser {
    return createGeminiTerminalParser();
  }

  applyHookEvent(account: string | undefined, event: Record<string, unknown>): boolean {
    const sid = typeof event.session_id === 'string' ? event.session_id : undefined;
    if (!sid) return false;

    const accId = account || '.gemini';
    const agentId = `${accId}:${sid}`;
    const evName = typeof event.hook_event_name === 'string' ? event.hook_event_name : typeof event.event === 'string' ? event.event : '';
    const cwd = typeof event.cwd === 'string' ? event.cwd : process.cwd();

    let s = this.sessions.get(agentId);
    if (!s) {
      s = {
        account: accId,
        sessionId: sid,
        agentId,
        lastMtime: Date.now(),
        status: 'working',
      };
      this.sessions.set(agentId, s);
      this.opts.office.addMain({
        id: agentId,
        sessionId: sid,
        account: accId,
        provider: 'gemini',
        role: 'Gemini CLI',
        cwd,
        status: 'working',
        startedAt: Date.now(),
      });
    }

    if (evName === 'BeforeTool') {
      const tool = typeof event.tool_name === 'string' ? event.tool_name : 'tool';
      s.status = 'working';
      this.opts.office.addActivity(
        agentId,
        {
          id: `gem-hook-${Date.now()}`,
          kind: 'run',
          icon: '⚡',
          text: tool,
          at: Date.now(),
        },
        true,
      );
      this.opts.office.setStatus(agentId, 'working');
    } else if (evName === 'AfterAgent' || evName === 'Stop') {
      s.status = 'idle';
      this.opts.office.setStatus(agentId, 'idle');
    } else if (evName === 'SessionEnd') {
      this.opts.office.closeMain(agentId);
      this.sessions.delete(agentId);
    }

    return true;
  }

  private scan(): void {
    const tmpDir = join(this.geminiDir, 'tmp');
    if (!existsSync(tmpDir)) return;

    const now = Date.now();
    let projs: string[] = [];
    try {
      projs = readdirSync(tmpDir);
    } catch {
      return;
    }

    for (const p of projs) {
      const cDir = join(tmpDir, p, 'chats');
      if (!existsSync(cDir)) continue;

      let files: string[] = [];
      try {
        files = readdirSync(cDir);
      } catch {
        continue;
      }

      for (const f of files) {
        if (!f.endsWith('.json') && !f.endsWith('.jsonl')) continue;
        const filePath = join(cDir, f);
        let st;
        try {
          st = statSync(filePath);
        } catch {
          continue;
        }

        if (now - st.mtimeMs > 30 * 60_000) continue;

        const sid = f.replace(/\.(json|jsonl)$/, '');
        const agentId = `.gemini:${sid}`;

        if (!this.sessions.has(agentId)) {
          const session: GeminiSession = {
            account: '.gemini',
            sessionId: sid,
            chatPath: filePath,
            agentId,
            lastMtime: st.mtimeMs,
            status: 'working',
          };
          this.sessions.set(agentId, session);

          let detectedCwd = process.cwd();
          const rootFile = join(tmpDir, p, '.project_root');
          if (existsSync(rootFile)) {
            try {
              const rootContent = readFileSync(rootFile, 'utf8').trim();
              if (rootContent) detectedCwd = rootContent;
            } catch {
              // ignora
            }
          }
          try {
            const raw = readFileSync(filePath, 'utf8');
            const res = parseGeminiChat(raw, st.mtimeMs);
            if (res.cwd) detectedCwd = res.cwd;
            if (res.status) session.status = res.status;
          } catch {
            // ignora
          }

          this.opts.office.addMain({
            id: agentId,
            sessionId: sid,
            account: '.gemini',
            provider: 'gemini',
            role: 'Gemini CLI',
            cwd: detectedCwd,
            status: session.status,
            startedAt: st.birthtimeMs || st.mtimeMs,
          });
        }
      }
    }
  }

  private poll(): void {
    this.scan();
    const now = Date.now();

    for (const [agentId, s] of Array.from(this.sessions.entries())) {
      if (!s.chatPath) continue;
      let st;
      try {
        st = statSync(s.chatPath);
      } catch {
        this.opts.office.closeMain(agentId);
        this.sessions.delete(agentId);
        continue;
      }

      if (now - st.mtimeMs > 45 * 60_000) {
        this.opts.office.closeMain(agentId);
        this.sessions.delete(agentId);
        continue;
      }

      if (st.mtimeMs > s.lastMtime) {
        s.lastMtime = st.mtimeMs;
        try {
          const raw = readFileSync(s.chatPath, 'utf8');
          const res = parseGeminiChat(raw, st.mtimeMs);
          for (const act of res.activities) {
            this.opts.office.addActivity(agentId, act, true);
          }
          if (res.status && res.status !== s.status) {
            s.status = res.status;
            this.opts.office.setStatus(agentId, res.status, res.waitingFor);
          }
        } catch {
          // ignora
        }
      }
    }
  }
}
