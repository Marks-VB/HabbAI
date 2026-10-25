// Rota unificada de eventos de agentes (POST /api/agents/events):
// Recebe eventos vindos dos hooks/plugins locais do Antigravity, Gemini CLI e opencode.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Provider } from '../../shared/types';
import { HttpError, readJson, sendJson } from './app';
import { isLoopbackHost } from './guard';
import { tr } from '../../shared/i18n';

export interface AgentHookDispatcher {
  applyHookEvent(provider: Provider, account: string | undefined, event: Record<string, unknown>): boolean;
}

export function createAgentEventRoutes(dispatcher: AgentHookDispatcher): (req: IncomingMessage, res: ServerResponse, path: string) => void {
  return async (req: IncomingMessage, res: ServerResponse, path: string) => {
    if (path !== '/api/agents/events') return;

    if ((req.method ?? 'GET') !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { error: tr('método não permitido') });
    }

    if (!isLoopbackHost(req.headers.host)) {
      return sendJson(res, 403, { error: tr('acesso permitido apenas pelo host local') });
    }

    let body: Record<string, unknown>;
    try {
      body = (await readJson(req)) as Record<string, unknown>;
    } catch {
      return sendJson(res, 400, { error: tr('JSON inválido') });
    }

    const provider = body.provider as Provider;
    if (!provider || typeof provider !== 'string') {
      return sendJson(res, 400, { error: tr('campo "provider" obrigatório') });
    }

    const event = (body.event && typeof body.event === 'object' ? body.event : body) as Record<string, unknown>;
    const account = typeof body.account === 'string' ? body.account : undefined;

    const ok = dispatcher.applyHookEvent(provider, account, event);
    sendJson(res, 200, { ok });
  };
}
