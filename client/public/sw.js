// Service worker do HabbAI (JavaScript puro, servido de client/public/sw.js, sem build e sem dependências).
//
// O que ele faz — e o que não faz:
// - Navegação: rede primeiro; o index.html só vem do cache quando a rede falhou de verdade. Assim o app nunca
//   abre uma página antiga apontando para bundles que o servidor não tem mais.
// - /bundle/* (hash no nome, imutável) e /assets/* (nome fixo, pode mudar a cada build): stale-while-revalidate.
// - Nunca entra no cache: /api/*, métodos diferentes de GET, respostas fora de 2xx e respostas opacas.
// - Ativação: os caches de versões antigas são apagados. Não chamamos skipWaiting() de propósito: a versão nova
//   ativa no próximo carregamento, para não misturar o index.html novo com bundles já carregados pela página atual.
//
// Para publicar uma mudança de estratégia, troque VERSION: o cache antigo cai no activate.

const VERSION = '1';

/** Prefixo dos caches deste service worker; só ele é apagado no activate. */
const PREFIX = 'habblaud-';
const CACHE = `${PREFIX}${VERSION}`;
/** Chave do index.html cacheado (todas as rotas de navegação compartilham o mesmo documento). */
const INDEX = '/';
/** Quantas respostas ficam guardadas (o resto é descartado, das mais antigas para as mais novas). */
const MAX_ENTRIES = 100;
/** O que pré-carregamos no install: o documento e o manifesto (ícones entram sozinhos pelo /assets/*). */
const PRECACHE = [INDEX, '/manifest.webmanifest'];

/** Página de emergência: sem rede e sem index.html em cache. Mesmo tema escuro do app (#12151d). */
const OFFLINE_HTML = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="color-scheme" content="dark" />
    <meta name="theme-color" content="#12151d" />
    <title>HabbAI — sem conexão</title>
    <style>
      html, body { margin: 0; height: 100%; background: #12151d; color: #e6e9f0; }
      body { display: grid; place-items: center; text-align: center; padding: 24px;
        font: 16px/1.5 system-ui, sans-serif; }
      h1 { font-size: 20px; margin: 0 0 8px; }
      p { margin: 0 0 20px; color: #9aa4b8; }
      a { color: #7cc4ff; }
    </style>
  </head>
  <body>
    <main>
      <h1>Sem conexão</h1>
      <p>O escritório precisa do servidor do HabbAI para mostrar quem está trabalhando.<br />
      Verifique a rede e tente de novo.</p>
      <a href="/">Tentar de novo</a>
    </main>
  </body>
</html>`;

/** Pode guardar esta resposta? (GET da mesma origem, 2xx, não opaca, nunca /api/*) */
function cacheable(request, response) {
  if (!response || !response.ok || response.type === 'opaque' || response.type === 'opaqueredirect') return false;
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  return !url.pathname.startsWith('/api/');
}

/** Mantém o cache abaixo de MAX_ENTRIES, descartando as entradas mais antigas (ordem de inserção). */
async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_ENTRIES) return;
  for (const key of keys.slice(0, keys.length - MAX_ENTRIES)) await cache.delete(key);
}

/** Guarda uma resposta no cache (se puder) e poda o excesso. */
async function put(request, response) {
  if (!cacheable(request, response)) return;
  const cache = await caches.open(CACHE);
  await cache.put(request, response);
  await trim(cache);
}

/**
 * Navegação: rede primeiro. Se a rede respondeu (mesmo com erro HTTP), é a resposta dela que aparece — index.html
 * velho só serve para quando não houve resposta nenhuma. Sem cache, a página offline embutida.
 */
async function navigate(event) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(event.request);
    if (response.ok) {
      // O documento atual passa a ser o fallback das próximas aberturas offline. Se o cache recusar (sem espaço),
      // a resposta da rede continua valendo: guardar é só um extra.
      try {
        await cache.put(INDEX, response.clone());
        await trim(cache);
      } catch {
        // ignora
      }
    }
    return response;
  } catch {
    const cached = await cache.match(INDEX);
    if (cached) return cached;
    return new Response(OFFLINE_HTML, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
}

/** /bundle/* e /assets/*: entrega o cache na hora e busca a versão nova em segundo plano. */
async function staleWhileRevalidate(event) {
  const request = event.request;
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const network = fetch(request).then(
    async (response) => {
      // Se o cache recusar (sem espaço), a resposta da rede ainda serve.
      try {
        await put(request, response.clone());
      } catch {
        // ignora
      }
      return response;
    },
    () => undefined,
  );
  if (cached) {
    // A atualização continua depois da resposta; se falhar, fica o que já estava em cache.
    event.waitUntil(network);
    return cached;
  }
  const response = await network;
  if (response) return response;
  return new Response('', { status: 504, statusText: 'Gateway Timeout' });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        // Um a um: se um arquivo faltar no build, o install não falha por causa dele.
        Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => undefined))),
      ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      const old = names.filter((name) => name.startsWith(PREFIX) && name !== CACHE);
      await Promise.all(old.map((name) => caches.delete(name)));
    })(),
  );
  // Sem clients.claim(): a página aberta continua com o service worker antigo até o próximo carregamento.
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Dados ao vivo (SSE, snapshot, ações) nunca passam pelo cache.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigate(event));
    return;
  }
  if (url.pathname.startsWith('/bundle/') || url.pathname.startsWith('/assets/')) {
    event.respondWith(staleWhileRevalidate(event));
  }
});
