## O que muda

<!-- O problema, a mudança e o efeito para quem usa o Habblaud. Se for visual, diga o que aparece de diferente. -->

## Como verifiquei

<!-- O que você rodou e o que olhou. Capturas são bem-vindas. -->

## Checklist

- [ ] Rodei `npm run typecheck`, `npm test` e `npm run build` (e `npm run lint` e `npm run i18n:check`, se mexi em
      código ou em textos).
- [ ] Se a mudança é visível para quem usa, atualizei a seção **Não lançado** do `CHANGELOG.md`.
- [ ] Textos novos estão dentro de `tr('texto em PT')` (com lacunas `{0}`, nunca template string), e atualizei as
      traduções em `shared/locales/` — ou deixei claro o que ficou sem tradução.
- [ ] Se toquei em `shared/world/` ou `server/world/`, descrevi abaixo o que muda no que sai da máquina e conferi a
      lista de `docs/world/privacidade.md`.
- [ ] Capturei as imagens/GIF no **modo demonstração** (`?mock=1` ou `npm run demo`), com dados fictícios.
- [ ] Não incluí dados pessoais, credenciais, caminhos de projetos nem conteúdo de sessões em capturas, exemplos,
      logs ou testes.
- [ ] Se alterei um plugin do Claude Code, validei com `claude plugin validate` e `claude plugin test` no plugin
      afetado.

## Habblaud World

<!-- Só se tocar em shared/world/ ou server/world/: o que muda no que sobe ao servidor do mundo (campo novo,
     removido, mudança de formato). Caso contrário, escreva "não mexe". -->

## Issue relacionada

<!-- Ex.: Closes #123 -->
