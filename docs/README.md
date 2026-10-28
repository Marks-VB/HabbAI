# Documentação

Esta pasta reúne o material que não cabe no [README](../README.md): a página de privacidade do Habblaud World, as
capturas usadas na documentação e este índice. O código de cada parte tem o seu próprio README.

## Por onde começar

| Se você quer… | Leia |
| --- | --- |
| Instalar e usar | [README](../README.md) (inglês), [README.pt-BR](../README.pt-BR.md), [README.es](../README.es.md) ou [README.fr](../README.fr.md) |
| Entender o código | [arquitetura.md](arquitetura.md) |
| Contribuir | [CONTRIBUTING.md](../CONTRIBUTING.md) |
| Relatar uma falha de segurança | [SECURITY.md](../SECURITY.md) |
| Saber o que saiu do computador | [world/privacidade.md](world/privacidade.md) |
| Ver o que mudou em cada versão | [CHANGELOG.md](../CHANGELOG.md) |

O README é a versão em inglês; as outras três são traduções completas, com os mesmos comandos e as mesmas capturas.
A documentação interna (arquitetura, privacidade do World e READMEs de código) é em português.

## O que tem em cada pasta

### `docs/world/`

- [`privacidade.md`](world/privacidade.md) — a lista fechada do que o Habblaud pode enviar ao Habblaud World, campo
  por campo, e o que nunca sai. É a página que a revisão de pull requests confere contra o código quando alguém mexe
  em `shared/world/` ou `server/world/`. O protocolo e as regras de mudança estão em
  [`shared/world/README.md`](../shared/world/README.md).

### `docs/screenshots/`

Imagens usadas no README e nas notas de versão. Todas foram feitas no **modo demonstração** (`?mock=1`), com
projetos, pessoas e contas fictícias.

| Grupo | Arquivos |
| --- | --- |
| Escritório | [`office.gif`](screenshots/office.gif), [`overview.png`](screenshots/overview.png), [`agent-details.png`](screenshots/agent-details.png), [`night.png`](screenshots/night.png), [`collab.png`](screenshots/collab.png), [`shell-wait.png`](screenshots/shell-wait.png), [`mobile.png`](screenshots/mobile.png) |
| Ciclo de uma sala | [`lifecycle-1.png`](screenshots/lifecycle-1.png), [`lifecycle-2.png`](screenshots/lifecycle-2.png), [`lifecycle-3.png`](screenshots/lifecycle-3.png), [`lifecycle-4.png`](screenshots/lifecycle-4.png) |
| Temas | [`seasonal-christmas.png`](screenshots/seasonal-christmas.png), [`seasonal-halloween.png`](screenshots/seasonal-halloween.png) |
| GitHub no escritório | [`github-party.png`](screenshots/github-party.png), [`github-alarm.png`](screenshots/github-alarm.png) |
| Vida social | [`social-drawer.png`](screenshots/social-drawer.png), [`social-kitchen.png`](screenshots/social-kitchen.png), [`social-lounge.gif`](screenshots/social-lounge.gif), [`social-mirror.png`](screenshots/social-mirror.png), [`social-rps.png`](screenshots/social-rps.png) |
| Habblaud World | [`world-sem-conta.png`](screenshots/world-sem-conta.png), [`world-lista-de-espera.png`](screenshots/world-lista-de-espera.png), [`world-personagem.png`](screenshots/world-personagem.png), [`world-predio.png`](screenshots/world-predio.png), [`world-enviado.png`](screenshots/world-enviado.png), [`world-cidade.png`](screenshots/world-cidade.png), [`world-cartao.png`](screenshots/world-cartao.png), [`world-visita.png`](screenshots/world-visita.png), [`world-visita-painel.png`](screenshots/world-visita-painel.png), [`world-social.png`](screenshots/world-social.png), [`world-praca.png`](screenshots/world-praca.png) |

Para refazer as do World: `npm run shots:world` (script [`scripts/world-shots.mjs`](../scripts/world-shots.mjs)).

## READMEs de código

| Arquivo | O que cobre |
| --- | --- |
| [`server/README.md`](../server/README.md) | Fontes de dados, API HTTP/SSE, terminal, permissões, mensagens, timelapse e o World no servidor. |
| [`shared/world/README.md`](../shared/world/README.md) | Protocolo do Habblaud World, os arquivos de `shared/world/` e as regras para mudá-lo. |
| [`mod/README.md`](../mod/README.md) | O mod e os plugins do Claude Code: eventos, arquivos e chamadas. |

## README em quatro idiomas

| Idioma | Arquivo |
| --- | --- |
| Inglês | [`README.md`](../README.md) |
| Português | [`README.pt-BR.md`](../README.pt-BR.md) |
| Espanhol | [`README.es.md`](../README.es.md) |
| Francês | [`README.fr.md`](../README.fr.md) |

Ao mudar algo visível, atualize os quatro READMEs quando a mudança aparecer neles, o `CHANGELOG.md` e as traduções
da interface (`shared/locales/`, conferidas por `npm run i18n:check`).
