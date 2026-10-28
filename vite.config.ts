import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// RegExp de um caminho dentro do cliente, escrito com "/" (os ids dos módulos usam "\\" no Windows também).
const re = (p: string) => new RegExp(p.replace(/\//g, '[\\\\/]'));

// Um grupo de chunk: `nome` vira o nome do arquivo (bundle/<nome>-<hash>.js) e `match` casa com o caminho do módulo.
const group = (name: string, match: string) => ({ name, test: re(`^.*client/src/${match}`) });

// Cliente do Habblaud. Em `npm run dev` o servidor usa este config em middleware mode;
// `npm run dev:client` sobe só o Vite (use ?mock=1 para dados simulados no navegador).
export default defineConfig({
  root: r('./client'),
  // No navegador vai só o dicionário do idioma ativo (client/src/main.ts), não os três: ver shared/locales/all.ts.
  resolve: { alias: [{ find: /^\.\/locales\/all$/, replacement: r('./shared/locales/none.ts') }] },
  publicDir: r('./client/public'),
  build: {
    outDir: r('./dist/client'),
    emptyOutDir: true,
    // Arquivos gerados com hash vão para /bundle/ (cache immutable no servidor); /assets/ fica só
    // para client/public (nomes fixos, revalidados a cada acesso). Ver server/http/static.ts.
    assetsDir: 'bundle',
    assetsInlineLimit: 0,
    rolldownOptions: {
      input: { main: r('./client/index.html') },
      output: {
        // Chunks por área do cliente. `codeSplitting` é a API do Rolldown que substitui o antigo `manualChunks`
        // (https://rolldown.rs/in-depth/manual-code-splitting). A entrada (client/src/ui/index.ts) importa tudo de
        // forma estática, então estes chunks descem em paralelo já no primeiro acesso: o ganho é não ter um
        // arquivo único de ~790 kB. Baixar uma área só ao clicar exigiria trocar os imports por `import()`.
        codeSplitting: {
          // Cada grupo leva só os módulos que casam com o `test`; com o padrão (`true`) um grupo "puxa" tudo o que
          // ele importa e vira um chunk gigante. Em troca, sobram imports circulares entre os chunks (a interface, o
          // escritório e o World se importam de lado a lado), que o Rolldown resolve pelo chunk `rolldown-runtime`.
          includeDependenciesRecursively: false,
          groups: [
            // Base da interface (DOM, preferências, modelos, ícones), usada por todos os grupos abaixo: num chunk
            // próprio, os outros grupos não precisam depender do chunk de entrada.
            group('ui-core', 'ui/(dom|model|prefs|format|icons|widgets|context)\\.ts$'),
            // Editor de personagem: aparência, cabelo e ícone do avatar.
            group('character', 'art/character/|ui/(character-model|character-editor|appearance-fields|avatar)\\.ts$'),
            // Habblaud World na interface (diálogo, cartão, ajustes, resumos). A cidade em si continua sob demanda:
            // client/src/world/city e net/world-stream saem em chunk próprio pelo `import()` de app.ts.
            group('world-ui', 'ui/world/'),
            // Terminal interativo; o xterm em si (ptypane) já é um chunk sob demanda.
            group('terminal', 'ui/(terminal|termtabs|termtools|termactions|pty|ptyapi|ptypane)\\.ts$'),
            // Arte procedural do escritório (móveis, pisos, ícones, tema sazonal).
            group('art', 'art/'),
            // Desenho do escritório no canvas (piso, móveis, luz, partículas).
            group('office-render', 'world/render/'),
            // Simulação e montagem do escritório. Fora daqui: `city/` e `visit/`, que só a cidade do World usa e
            // precisam continuar no chunk carregado sob demanda.
            group('office', 'world/(?!city/|visit)'),
          ],
        },
      },
    },
  },
  server: {
    port: Number(process.env.VITE_PORT ?? 5173),
    proxy: {
      '/api': { target: `http://127.0.0.1:${process.env.HABBLAUD_PORT ?? 4747}` },
    },
  },
});
