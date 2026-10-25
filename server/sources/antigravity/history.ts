// Histórico de conversas do Antigravity (HistoryProvider 'antigravity'):
// lista as conversas recentes encontradas em ~/.gemini/antigravity/brain e ~/.gemini/antigravity-cli/brain.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { RecentSession } from '../../../shared/types';
import type { AccountEntry } from '../../accounts/service';
import type { HistoryProvider, HistoryResolveResult } from '../source';
import { createAntigravityTerminalParser } from './terminal';
import { tr } from '../../../shared/i18n';

export interface AntigravityHistoryOptions {
  accounts: () => readonly AccountEntry[];
  roots?: string[];
}

export class AntigravityHistory implements HistoryProvider {
  readonly provider = 'antigravity';

  constructor(private readonly opts: AntigravityHistoryOptions) {}

  hasAccount(account: string): boolean {
    return this.opts.accounts().some((a) => a.id === account && a.provider === 'antigravity');
  }

  async list(): Promise<RecentSession[]> {
    const out: RecentSession[] = [];
    const accounts = this.opts.accounts().filter((a) => a.provider === 'antigravity');

    for (const acc of accounts) {
      const brainDir = join(acc.dir, 'brain');
      if (!existsSync(brainDir)) continue;

      let convDirs: string[] = [];
      try {
        convDirs = readdirSync(brainDir);
      } catch {
        continue;
      }

      for (const convId of convDirs) {
        const transcriptPath = join(brainDir, convId, '.system_generated', 'logs', 'transcript.jsonl');
        if (!existsSync(transcriptPath)) continue;

        let st;
        try {
          st = statSync(transcriptPath);
        } catch {
          continue;
        }

        // Sessões dos últimos 7 dias
        if (Date.now() - st.mtimeMs > 7 * 86400_000) continue;

        out.push({
          provider: 'antigravity',
          account: acc.id,
          sessionId: convId,
          title: `Antigravity (${convId.slice(0, 8)})`,
          project: 'Antigravity',
          projectDir: 'antigravity',
          firstAt: st.birthtimeMs || st.mtimeMs,
          lastAt: st.mtimeMs,
          size: st.size,
          open: false,
        });
      }
    }

    return out.sort((a, b) => b.lastAt - a.lastAt).slice(0, 150);
  }

  resolve(account: string, sessionId: string): HistoryResolveResult {
    const acc = this.opts.accounts().find((a) => a.id === account && a.provider === 'antigravity');
    if (!acc) return { status: 404, error: tr('conta desconhecida') };

    const transcriptPath = join(acc.dir, 'brain', sessionId, '.system_generated', 'logs', 'transcript.jsonl');
    if (!existsSync(transcriptPath)) return { status: 404, error: tr('sessão não encontrada') };

    return {
      path: transcriptPath,
      createParser: () => createAntigravityTerminalParser(),
    };
  }
}
