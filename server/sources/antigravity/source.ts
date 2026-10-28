// Fonte de agentes do Antigravity (AgentSource 'antigravity'):
// Observa os transcripts ativos em ~/.gemini/antigravity/brain e ~/.gemini/antigravity-cli/brain,
// além de processar eventos instantâneos dos hooks (applyHookEvent).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { AgentStatus, SourceInfo, TaskItem } from '../../../shared/types';
import type { AccountsService } from '../../accounts/service';
import type { Office } from '../../model/office';
import type { AgentSource } from '../source';
import { FileTail } from '../tail';
import type { TerminalParser } from '../terminal';
import { createAntigravityTerminalParser } from './terminal';
import { parseAntigravityLine, parseMarkdownTasks } from './transcript';

export interface AntigravitySourceOptions {
  accounts: AccountsService;
  office: Office;
  home?: string;
  roots?: string[];
  pollMs?: number;
}

interface ActiveSession {
  account: string;
  convId: string;
  convDir: string;
  transcriptPath: string;
  tail: FileTail;
  agentId: string;
  lastMtime: number;
  status: AgentStatus;
  tokensIn: number;
  tokensOut: number;
  toolCalls: number;
  model?: string;
  title?: string;
}

export class AntigravitySource implements AgentSource {
  readonly provider = 'antigravity';
  private readonly home: string;
  private readonly roots: string[] = [];
  private readonly sessions = new Map<string, ActiveSession>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(private readonly opts: AntigravitySourceOptions) {
    this.home = opts.home ?? homedir();
    if (opts.roots && opts.roots.length > 0) {
      this.roots.push(...opts.roots);
    } else {
      const gDir = join(this.home, '.gemini');
      const app = join(gDir, 'antigravity');
      const cli = join(gDir, 'antigravity-cli');
      if (existsSync(app)) this.roots.push(app);
      if (existsSync(cli)) this.roots.push(cli);
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    // Registra as contas no AccountsService
    const acctInputs = this.roots.map((r) => {
      const isCli = r.endsWith('antigravity-cli');
      const id = isCli ? '.antigravity-cli' : '.antigravity';
      const name = isCli ? 'Antigravity CLI' : 'Antigravity';
      return {
        dir: r,
        detected: {
          id,
          name,
          short: isCli ? 'AC' : 'AG',
          color: isCli ? '#38d399' : '#2dd4bf',
          configDir: r,
          provider: 'antigravity' as const,
        },
      };
    });
    this.opts.accounts.setProviderAccounts('antigravity', acctInputs);

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
    return this.roots.map((r) => {
      const isCli = r.endsWith('antigravity-cli');
      const id = isCli ? '.antigravity-cli' : '.antigravity';
      let active = 0;
      for (const s of this.sessions.values()) {
        if (s.account === id) active++;
      }
      return {
        provider: 'antigravity',
        label: id,
        path: r,
        sessions: active,
        ok: true,
      };
    });
  }

  transcriptPathOf(agentId: string): string | undefined {
    return this.sessions.get(agentId)?.transcriptPath;
  }

  terminalParser(_agentId: string): TerminalParser {
    return createAntigravityTerminalParser();
  }

  applyHookEvent(account: string | undefined, event: Record<string, unknown>): boolean {
    const convId = typeof event.conversationId === 'string' ? event.conversationId : undefined;
    if (!convId) return false;

    const accId = account || '.antigravity';
    const agentId = `${accId}:${convId}`;
    const evName = typeof event.event === 'string' ? event.event : typeof event.hook_event_name === 'string' ? event.hook_event_name : '';

    let s = this.sessions.get(agentId);
    if (!s) {
      this.scan();
      s = this.sessions.get(agentId);
    }

    if (evName === 'PreToolUse') {
      const toolCall = event.toolCall as Record<string, unknown> | undefined;
      const toolName = typeof toolCall?.name === 'string' ? toolCall.name : 'tool';
      if (s) {
        s.status = toolName === 'ask_permission' || toolName === 'ask_question' ? 'waiting' : 'working';
        this.opts.office.setStatus(agentId, s.status, s.status === 'waiting' ? 'aprovar uma permissão' : undefined);
      }
    } else if (evName === 'Stop' || evName === 'SessionEnd') {
      if (s) {
        s.status = 'idle';
        this.opts.office.setStatus(agentId, 'idle');
      }
    }

    return true;
  }

  private scan(): void {
    const now = Date.now();
    for (const root of this.roots) {
      const isCli = root.endsWith('antigravity-cli');
      const accId = isCli ? '.antigravity-cli' : '.antigravity';
      const brain = join(root, 'brain');
      if (!existsSync(brain)) continue;

      let convDirs: string[] = [];
      try {
        convDirs = readdirSync(brain);
      } catch {
        continue;
      }

      for (const convId of convDirs) {
        const transcriptPath = join(brain, convId, '.system_generated', 'logs', 'transcript.jsonl');
        if (!existsSync(transcriptPath)) continue;

        let st;
        try {
          st = statSync(transcriptPath);
        } catch {
          continue;
        }

        // Se modificado nos últimos 30 minutos, consideramos sessão ativa
        if (now - st.mtimeMs > 30 * 60_000) continue;

        const agentId = `${accId}:${convId}`;
        if (!this.sessions.has(agentId)) {
          this.openSession(accId, convId, transcriptPath, st.mtimeMs);
        }
      }
    }
  }

  private openSession(account: string, convId: string, transcriptPath: string, mtime: number): void {
    const agentId = `${account}:${convId}`;
    const tail = new FileTail(transcriptPath);
    tail.seekTail(256 * 1024);
    const convDir = dirname(dirname(dirname(transcriptPath)));

    const session: ActiveSession = {
      account,
      convId,
      convDir,
      transcriptPath,
      tail,
      agentId,
      lastMtime: mtime,
      status: 'working',
      tokensIn: 0,
      tokensOut: 0,
      toolCalls: 0,
    };
    this.sessions.set(agentId, session);

    let detectedCwd = process.cwd();
    const readResult = tail.read();
    for (const line of readResult.lines) {
      const res = parseAntigravityLine(line);
      if (res) {
        if (res.cwd) detectedCwd = res.cwd;
        if (res.status) session.status = res.status;
        if (res.tokensIn) session.tokensIn += res.tokensIn;
        if (res.tokensOut) session.tokensOut += res.tokensOut;
        if (res.toolStarts.length) session.toolCalls += res.toolStarts.length;
        if (res.model) session.model = res.model;
        if (res.title) session.title = res.title;
      }
    }

    if (detectedCwd === process.cwd()) {
      try {
        const sample = readFileSync(transcriptPath, 'utf8').split('\n').slice(0, 50);
        for (const line of sample) {
          const res = parseAntigravityLine(line);
          if (res?.cwd) {
            detectedCwd = res.cwd;
            break;
          }
        }
      } catch {
        // ignora
      }
    }

    this.opts.office.addMain({
      id: agentId,
      sessionId: convId,
      account,
      provider: 'antigravity',
      role: 'Antigravity',
      cwd: detectedCwd,
      status: session.status,
      startedAt: Date.now() - 60_000,
    });

    const tasks = this.readSessionTasks(convDir);
    this.opts.office.applyTranscript(agentId, {
      tasks,
      stats: {
        toolCalls: session.toolCalls,
        tokensIn: session.tokensIn,
        tokensOut: session.tokensOut,
        subagents: 0,
      },
      model: session.model,
      title: session.title,
    });
  }

  private readSessionTasks(convDir: string): TaskItem[] {
    const candidates = ['implementation_plan.md', 'task.md', 'tasks.md'];
    for (const name of candidates) {
      const p = join(convDir, name);
      if (existsSync(p)) {
        try {
          const md = readFileSync(p, 'utf8');
          const tasks = parseMarkdownTasks(md);
          if (tasks.length > 0) return tasks;
        } catch {
          // ignora
        }
      }
    }
    return [];
  }

  private poll(): void {
    const now = Date.now();
    this.scan();

    for (const [agentId, s] of Array.from(this.sessions.entries())) {
      let st;
      try {
        st = statSync(s.transcriptPath);
      } catch {
        this.closeSession(agentId);
        continue;
      }

      // Se parado há mais de 45 minutos, fecha
      if (now - st.mtimeMs > 45 * 60_000) {
        this.closeSession(agentId);
        continue;
      }

      if (st.mtimeMs > s.lastMtime) {
        s.lastMtime = st.mtimeMs;
        const readResult = s.tail.read();
        for (const line of readResult.lines) {
          const res = parseAntigravityLine(line);
          if (!res) continue;

          if (res.tokensIn) {
            s.tokensIn += res.tokensIn;
          }
          if (res.tokensOut) {
            s.tokensOut += res.tokensOut;
          }
          if (res.toolStarts.length) {
            s.toolCalls += res.toolStarts.length;
          }
          if (res.model) s.model = res.model;
          if (res.title) s.title = res.title;

          for (const act of res.activities) {
            this.opts.office.addActivity(agentId, act, true);
          }

          if (res.status && res.status !== s.status) {
            s.status = res.status;
            this.opts.office.setStatus(agentId, res.status, res.waitingFor);
          }
        }
      }

      const tasks = this.readSessionTasks(s.convDir);
      this.opts.office.applyTranscript(agentId, {
        tasks,
        stats: {
          toolCalls: s.toolCalls,
          tokensIn: s.tokensIn,
          tokensOut: s.tokensOut,
          subagents: 0,
        },
        model: s.model,
        title: s.title,
      });
    }
  }

  private closeSession(agentId: string): void {
    const s = this.sessions.get(agentId);
    if (!s) return;
    this.sessions.delete(agentId);
    this.opts.office.closeMain(agentId);
  }
}
