// Histórico do Gemini CLI (HistoryProvider 'gemini'):
// lista as conversas recentes de chats/ em ~/.gemini/tmp/*/chats/
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { RecentSession } from '../../../shared/types';
import type { AccountEntry } from '../../accounts/service';
import type { HistoryProvider, HistoryResolveResult } from '../source';
import { createGeminiTerminalParser } from './terminal';
import { tr } from '../../../shared/i18n';

export interface GeminiHistoryOptions {
  accounts: () => readonly AccountEntry[];
}

export class GeminiHistory implements HistoryProvider {
  readonly provider = 'gemini';

  constructor(private readonly opts: GeminiHistoryOptions) {}

  hasAccount(account: string): boolean {
    return this.opts.accounts().some((a) => a.id === account && a.provider === 'gemini');
  }

  async list(): Promise<RecentSession[]> {
    const out: RecentSession[] = [];
    const accounts = this.opts.accounts().filter((a) => a.provider === 'gemini');

    for (const acc of accounts) {
      const tmpDir = join(acc.dir, 'tmp');
      if (!existsSync(tmpDir)) continue;

      let projDirs: string[] = [];
      try {
        projDirs = readdirSync(tmpDir);
      } catch {
        continue;
      }

      for (const proj of projDirs) {
        const chatsDir = join(tmpDir, proj, 'chats');
        if (!existsSync(chatsDir)) continue;

        let files: string[] = [];
        try {
          files = readdirSync(chatsDir);
        } catch {
          continue;
        }

        for (const f of files) {
          if (!f.endsWith('.json') && !f.endsWith('.jsonl')) continue;
          const p = join(chatsDir, f);
          let st;
          try {
            st = statSync(p);
          } catch {
            continue;
          }

          if (Date.now() - st.mtimeMs > 7 * 86400_000) continue;

          const sid = f.replace(/\.(json|jsonl)$/, '');
          out.push({
            provider: 'gemini',
            account: acc.id,
            sessionId: sid,
            title: `Gemini CLI (${sid.slice(0, 8)})`,
            project: proj,
            projectDir: proj,
            firstAt: st.birthtimeMs || st.mtimeMs,
            lastAt: st.mtimeMs,
            size: st.size,
            open: false,
          });
        }
      }
    }

    return out.sort((a, b) => b.lastAt - a.lastAt).slice(0, 150);
  }

  resolve(account: string, sessionId: string): HistoryResolveResult {
    const acc = this.opts.accounts().find((a) => a.id === account && a.provider === 'gemini');
    if (!acc) return { status: 404, error: tr('conta desconhecida') };

    const tmpDir = join(acc.dir, 'tmp');
    if (existsSync(tmpDir)) {
      try {
        for (const proj of readdirSync(tmpDir)) {
          const cDir = join(tmpDir, proj, 'chats');
          if (existsSync(cDir)) {
            for (const f of readdirSync(cDir)) {
              if (f.startsWith(sessionId)) {
                return {
                  path: join(cDir, f),
                  createParser: () => createGeminiTerminalParser(),
                };
              }
            }
          }
        }
      } catch {
        // segue para 404
      }
    }

    return { status: 404, error: tr('sessão não encontrada') };
  }
}
