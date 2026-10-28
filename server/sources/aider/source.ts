// Fonte de agentes do Aider (AgentSource 'aider'):
// Observa sessões ativas do Aider através dos arquivos .aider.chat.history.md nos projetos e no diretório home.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import type { AgentStatus, SourceInfo } from '../../../shared/types';
import type { AccountsService } from '../../accounts/service';
import type { Office } from '../../model/office';
import type { AgentSource } from '../source';
import { truncate } from '../../../shared/activity';

export interface AiderSourceOptions {
  accounts: AccountsService;
  office: Office;
  searchRoots?: string[];
  pollMs?: number;
}

interface ActiveAiderSession {
  agentId: string;
  sessionId: string;
  historyPath: string;
  cwd: string;
  projectName: string;
  lastMtime: number;
  status: AgentStatus;
  model?: string;
  toolCalls: number;
  tokensIn: number;
  tokensOut: number;
  costUSD?: number;
}

export class AiderSource implements AgentSource {
  readonly provider = 'aider' as const;
  private readonly searchRoots: string[] = [];
  private readonly sessions = new Map<string, ActiveAiderSession>();
  private running = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly opts: AiderSourceOptions) {
    const home = homedir();
    if (opts.searchRoots && opts.searchRoots.length > 0) {
      this.searchRoots.push(...opts.searchRoots);
    } else {
      this.searchRoots.push(process.cwd());
      this.searchRoots.push(home);
      // Diretórios de trabalho habituais no Windows
      if (existsSync('Z:\\GitHub')) this.searchRoots.push('Z:\\GitHub');
      if (existsSync('Z:\\GitHub\\CLI')) this.searchRoots.push('Z:\\GitHub\\CLI');
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    this.opts.accounts.setProviderAccounts('aider', [
      {
        dir: join(homedir(), '.aider'),
        detected: {
          id: '.aider',
          name: 'Aider',
          short: 'Ai',
          color: '#10b981',
          configDir: join(homedir(), '.aider'),
          provider: 'aider',
        },
      },
    ]);

    this.scan();
    this.timer = setInterval(() => this.poll(), this.opts.pollMs ?? 3000);
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
        provider: 'aider',
        label: '.aider',
        path: join(homedir(), '.aider'),
        sessions: this.sessions.size,
        ok: true,
      },
    ];
  }

  transcriptPathOf(_agentId: string): string | undefined {
    return undefined;
  }

  private scan(): void {
    const now = Date.now();
    const foundPaths = new Set<string>();

    for (const root of this.searchRoots) {
      if (!existsSync(root)) continue;

      // 1. Verifica se a própria raiz tem .aider.chat.history.md
      const direct = join(root, '.aider.chat.history.md');
      if (existsSync(direct)) {
        foundPaths.add(direct);
      }

      // 2. Procura em subpastas imediatas (repositórios de projetos)
      try {
        const entries = readdirSync(root, { withFileTypes: true });
        for (const ent of entries) {
          if (!ent.isDirectory()) continue;
          if (ent.name === 'node_modules' || ent.name === '.git' || ent.name.startsWith('.')) continue;

          const p = join(root, ent.name, '.aider.chat.history.md');
          if (existsSync(p)) {
            foundPaths.add(p);
          }
        }
      } catch {
        // ignora erro de leitura
      }
    }

    for (const historyPath of foundPaths) {
      let st;
      try {
        st = statSync(historyPath);
      } catch {
        continue;
      }

      // Se modificado nos últimos 45 minutos, consideramos ativo
      if (now - st.mtimeMs > 45 * 60_000) continue;

      const cwd = dirname(historyPath);
      const safeId = cwd.replace(/[^a-zA-Z0-9_-]/g, '_');
      const agentId = `.aider:${safeId}`;

      if (!this.sessions.has(agentId)) {
        this.openSession(agentId, cwd, historyPath, st.mtimeMs);
      }
    }
  }

  private openSession(agentId: string, cwd: string, historyPath: string, mtime: number): void {
    const projectName = basename(cwd) || 'Projeto';
    const now = Date.now();
    const isWorking = now - mtime < 60_000;
    const status: AgentStatus = isWorking ? 'working' : 'idle';

    const s: ActiveAiderSession = {
      agentId,
      sessionId: basename(cwd),
      historyPath,
      cwd,
      projectName,
      lastMtime: mtime,
      status,
      toolCalls: 0,
      tokensIn: 0,
      tokensOut: 0,
    };
    this.sessions.set(agentId, s);

    this.opts.office.addMain({
      id: agentId,
      sessionId: s.sessionId,
      account: '.aider',
      provider: 'aider',
      role: 'Aider',
      cwd,
      status,
      startedAt: mtime - 60_000,
    });

    this.parseHistory(s, true);
  }

  private poll(): void {
    const now = Date.now();
    this.scan();

    for (const [agentId, s] of Array.from(this.sessions.entries())) {
      let st;
      try {
        st = statSync(s.historyPath);
      } catch {
        this.closeSession(agentId);
        continue;
      }

      if (now - st.mtimeMs > 45 * 60_000) {
        this.closeSession(agentId);
        continue;
      }

      const isWorking = now - st.mtimeMs < 60_000;
      const status: AgentStatus = isWorking ? 'working' : 'idle';
      if (status !== s.status) {
        s.status = status;
        this.opts.office.setStatus(agentId, status);
      }

      if (st.mtimeMs > s.lastMtime) {
        s.lastMtime = st.mtimeMs;
        this.parseHistory(s, false);
      }
    }
  }

  private parseHistory(s: ActiveAiderSession, isInitial: boolean): void {
    try {
      const content = readFileSync(s.historyPath, 'utf8');
      const lines = content.split('\n');

      let lastPrompt = '';
      let model = s.model;
      let toolCalls = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Modelo usado (ex: Aider chat started at ... with model ...)
        const matchModel = /Aider v[\d.]+\s+.*with\s+(?:model\s+)?([^\s,]+)/i.exec(line);
        if (matchModel) {
          model = matchModel[1];
        }

        // Prompt do usuário
        if (line.startsWith('#### ')) {
          lastPrompt = line.slice(5).trim();
        }

        // Aplicação de edições
        if (line.includes('Applied edit to ')) {
          toolCalls++;
          const matchFile = /Applied edit to ([^\s\r\n]+)/.exec(line);
          const file = matchFile ? matchFile[1] : 'arquivo';
          if (!isInitial) {
            this.opts.office.addActivity(
              s.agentId,
              {
                id: `aider-edit-${Date.now()}-${toolCalls}`,
                kind: 'edit',
                icon: '✏️',
                text: `Applied edit: ${truncate(file, 40)}`,
                detail: file,
                tool: 'edit',
                at: Date.now(),
              },
              true,
            );
          }
        }

        // Commit no git
        if (line.startsWith('Commit ') || line.includes('Commit ')) {
          toolCalls++;
          const msg = line.trim();
          if (!isInitial) {
            this.opts.office.addActivity(
              s.agentId,
              {
                id: `aider-commit-${Date.now()}-${toolCalls}`,
                kind: 'run',
                icon: '📦',
                text: truncate(msg, 60),
                detail: msg,
                tool: 'git',
                at: Date.now(),
              },
              true,
            );
          }
        }
      }

      s.toolCalls = toolCalls;
      s.model = model;

      this.opts.office.applyTranscript(s.agentId, {
        tasks: [],
        stats: {
          toolCalls,
          tokensIn: s.tokensIn,
          tokensOut: s.tokensOut,
          subagents: 0,
        },
        model,
        title: lastPrompt ? truncate(lastPrompt, 80) : undefined,
      });
    } catch {
      // ignora falha de leitura
    }
  }

  private closeSession(agentId: string): void {
    const s = this.sessions.get(agentId);
    if (!s) return;
    this.sessions.delete(agentId);
    this.opts.office.closeMain(agentId);
  }
}
