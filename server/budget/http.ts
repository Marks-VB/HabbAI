// Rotas do orçamento: GET /api/budget (configuração + estado atual) e PUT /api/budget (salva os limites).
// A trava "só pelo próprio computador" é conferida em http/app.ts, como no Habblaud World; aqui só o método e o corpo.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpError, readJson, sendJson } from '../http/app';
import { tr } from '../../shared/i18n';
import type { BudgetTracker } from './tracker';

function fail(res: ServerResponse, err: unknown): void {
  if (res.headersSent) return void res.destroy();
  if (err instanceof HttpError) sendJson(res, err.status, { error: err.message });
  else sendJson(res, 500, { error: tr('erro interno') });
}

function methodNotAllowed(res: ServerResponse, allow: string): void {
  res.setHeader('Allow', allow);
  sendJson(res, 405, { error: tr('método não permitido') });
}

export function createBudgetRoutes(tracker: BudgetTracker): (req: IncomingMessage, res: ServerResponse, path: string) => void {
  return (req, res, path) => {
    if (path !== '/api/budget') {
      req.resume();
      sendJson(res, 404, { error: tr('rota desconhecida') });
      return;
    }
    const method = req.method ?? 'GET';
    if (method === 'GET' || method === 'HEAD') {
      req.resume();
      sendJson(res, 200, tracker.get());
      return;
    }
    if (method !== 'PUT') {
      req.resume();
      methodNotAllowed(res, 'GET, PUT');
      return;
    }
    readJson(req)
      .then((body) => {
        const r = tracker.save(body);
        if (!r.ok) return sendJson(res, 400, { error: r.error });
        sendJson(res, 200, r.response);
      })
      .catch((err) => fail(res, err));
  };
}
