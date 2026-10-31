// Rotas da central de notificações (server/notifications/inbox.ts e prefs.ts). A trava (bind local + Host local) já foi
// conferida em http/app.ts; o guard (http/guard.ts) exige JSON e Origin local nos POST/PUT (contra CSRF).
//
//   GET  /api/notifications            (página)  {notifications, unread, total, quiet}: ?filter=all|unread&limit=N
//   POST /api/notifications/:id/read   (página)  {ok, status, unread} ou 404
//   POST /api/notifications/read-all   (página)  {ok, read, unread}
//   GET  /api/notifications/prefs      (página)  {prefs, quiet}
//   PUT  /api/notifications/prefs      (página)  {prefs, quiet} ou 400 (corpo validado, no máximo 64 KB)
import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpError, readJson, sendJson } from '../http/app';
import { tr } from '../../shared/i18n';
import { isQuietAt, parsePrefsPatch, type NotificationPrefsStore } from './prefs';
import type { NotificationFilter, NotificationInbox } from './inbox';

const ITEM_READ = /^\/api\/notifications\/([^/]+)\/read$/;
/** Preferências são pequenas: um payload maior que isto é engano (ou abuso). */
export const PREFS_BODY_MAX = 64 * 1_024;

export interface NotificationRoutesOptions {
  inbox: NotificationInbox;
  prefs: NotificationPrefsStore;
  /** Relógio injetável (testes): decide se o horário de silêncio está valendo agora. */
  now?: () => number;
}

function methodNotAllowed(res: ServerResponse, allow: string): void {
  res.setHeader('Allow', allow);
  sendJson(res, 405, { error: tr('método não permitido') });
}

function fail(res: ServerResponse, err: unknown): void {
  if (res.headersSent) return void res.destroy();
  if (err instanceof HttpError) sendJson(res, err.status, { error: err.message });
  else sendJson(res, 500, { error: tr('erro interno') });
}

export function createNotificationRoutes(
  opts: NotificationRoutesOptions,
): (req: IncomingMessage, res: ServerResponse, path: string) => void {
  const { inbox, prefs } = opts;
  const now = opts.now ?? Date.now;

  const list = (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const filter: NotificationFilter = url.searchParams.get('filter') === 'unread' ? 'unread' : 'all';
    const rawLimit = Number(url.searchParams.get('limit'));
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : undefined;
    const result = inbox.list({ filter, limit });
    sendJson(res, 200, { ...result, quiet: isQuietAt(prefs.get().quiet, now()) });
  };

  const read = (req: IncomingMessage, res: ServerResponse, rawId: string) => {
    let id: string;
    try {
      id = decodeURIComponent(rawId);
    } catch {
      return sendJson(res, 400, { error: tr('id inválido') });
    }
    const status = inbox.markRead(id);
    if (!status) return sendJson(res, 404, { error: tr('notificação desconhecida: ela já saiu do histórico') });
    sendJson(res, 200, { ok: true, status, unread: inbox.countUnread() });
  };

  const readAll = (res: ServerResponse) => {
    const read = inbox.markAllRead();
    sendJson(res, 200, { ok: true, read, unread: inbox.countUnread() });
  };

  const getPrefs = (res: ServerResponse) => {
    sendJson(res, 200, { prefs: prefs.get(), quiet: isQuietAt(prefs.get().quiet, now()) });
  };

  const putPrefs = async (req: IncomingMessage, res: ServerResponse) => {
    const body = await readJson(req, PREFS_BODY_MAX);
    const next = parsePrefsPatch(body, prefs.get());
    if (!next)
      throw new HttpError(
        400,
        tr(
          'esperado {types?, quiet?, appWindowOnly?, projects?, accounts?, tools?} com os valores da central de notificações',
        ),
      );
    prefs.set(next);
    sendJson(res, 200, { prefs: prefs.get(), quiet: isQuietAt(prefs.get().quiet, now()) });
  };

  return (req, res, path) => {
    const method = req.method ?? 'GET';
    if (path === '/api/notifications') {
      if (method !== 'GET' && method !== 'HEAD') return methodNotAllowed(res, 'GET');
      return list(req, res);
    }
    if (path === '/api/notifications/read-all') {
      if (method !== 'POST') return methodNotAllowed(res, 'POST');
      return readAll(res);
    }
    if (path === '/api/notifications/prefs') {
      if (method === 'GET' || method === 'HEAD') return getPrefs(res);
      if (method !== 'PUT') return methodNotAllowed(res, 'GET, PUT');
      putPrefs(req, res).catch((err) => fail(res, err));
      return;
    }
    const m = ITEM_READ.exec(path);
    if (!m) return sendJson(res, 404, { error: tr('rota desconhecida') });
    if (method !== 'POST') return methodNotAllowed(res, 'POST');
    read(req, res, m[1]);
  };
}
