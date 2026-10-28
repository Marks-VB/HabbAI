// Ponto de entrada do cliente: primeiro o dicionário do idioma ativo (só ele vai para o navegador), depois o app
// (client/src/app.ts), porque vários módulos chamam tr() ao carregar. Se o dicionário não carregar, fica em português.
import { getLocale, registerDictionary, type Locale } from '../../shared/i18n';

const LOADERS: Partial<Record<Locale, () => Promise<Readonly<Record<string, string>>>>> = {
  en: () => import('../../shared/locales/en').then((m) => m.EN),
  es: () => import('../../shared/locales/es').then((m) => m.ES),
  fr: () => import('../../shared/locales/fr').then((m) => m.FR),
};

const locale = getLocale();
const load = LOADERS[locale];
const dictionary = load ? load().then((d) => registerDictionary(locale, d)).catch(() => undefined) : Promise.resolve();

/**
 * Service worker (client/public/sw.js): é o que deixa o app instalável e com uma tela offline. Só em produção —
 * em `npm run dev` o Vite serve os módulos soltos, e um sw.js de um build antigo atrapalharia. Registrar tarde
 * (depois do `load`) não atrasa a primeira pintura, e uma falha aqui nunca pode quebrar o app.
 */
function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const register = () => void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

void dictionary.then(() => import('./app')).then((app) => {
  app.start();
  registerServiceWorker();
});
