# Segurança

O Habblaud roda na sua máquina, lê os arquivos que o Claude Code (e outras ferramentas de IA) já gravam e, por
padrão, só aceita conexões do próprio computador. Ainda assim, ele abre uma porta HTTP, pode abrir uma segunda porta
com login e TLS e instala plugins dentro das sessões — por isso relatos de segurança são bem-vindos e ajudam a
manter quem usa o Habblaud protegido.

O projeto é MIT e mantido por voluntários: não há programa de recompensas (bug bounty) nem prazo de resposta
garantido.

## Versões suportadas

| Versão | Suporte |
| --- | --- |
| 1.0.x (atual: 1.0.3, em [`package.json`](package.json)) | Recebe correções de segurança na versão mais recente da série. |
| Anterior a 1.0 (CodeTown e versões 0.x) | Sem suporte; atualize antes de relatar. |

As dependências de desenvolvimento são atualizadas semanalmente pelo Dependabot
([`.github/dependabot.yml`](.github/dependabot.yml)). O servidor não tem dependências de runtime obrigatórias.

## Como relatar em privado

Use os **GitHub Security Advisories** deste repositório:

1. Abra <https://github.com/marmottajr/habblaud/security/advisories/new> (ou a aba **Security** › **Report a
   vulnerability**).
2. Descreva o problema com o máximo de detalhe possível.

Não abra uma issue pública para um problema de segurança e não inclua dados reais de sessões, comandos, caminhos de
projetos, tokens ou credenciais no relato. Se precisar mostrar uma captura ou um log, use o modo demonstração
(`?mock=1` na URL ou `npm run demo`), que mostra só agentes fictícios, e apague o que for pessoal.

Um relato útil costuma trazer:

- a versão do Habblaud (aparece na barra do topo, em **Configurações › Sobre**, e em `GET /api/health`), o sistema
  operacional e a versão do Node.js;
- como o Habblaud está rodando (Node, Docker, com ou sem a porta remota) e quais variáveis `HABBLAUD_*` estão
  diferentes do padrão;
- o que um atacante conseguiria fazer, na prática, e em que condições (rede local, outra conta na mesma máquina,
  página aberta no navegador…);
- passos para reproduzir, de preferência numa instalação limpa ou no modo demonstração.

## O que está no escopo

- **Servidor local** (`server/`): a API HTTP e o SSE, o guard de `Host`/`Origin` (DNS rebinding e CSRF), o mascaramento
  de segredos antes de os dados chegarem ao navegador, o terminal e o histórico de sessões (que só existem com
  acesso local), as estatísticas do "Meu dia" e a linha do tempo.
- **Porta remota** (`HABBLAUD_REMOTE_*`, em [`server/http/remote.ts`](server/http/remote.ts)): login com scrypt,
  cookie de sessão `HttpOnly`/`SameSite=Strict`/`Secure` assinado com HMAC, freio de tentativas, o que
  `HABBLAUD_REMOTE_ALLOW` libera, a separação entre porta local e porta remota (nunca pelo cabeçalho `Host`) e o
  TLS com a CA local restrita.
- **Mod e plugins do Claude Code** (`mod/`): o mod, o plugin de permissões e o de mensagens — o que eles leem, o que
  gravam e para onde falam (só `127.0.0.1`).
- **Anexos e entregas**: os arquivos que o "Novo agente" e as entregas gravam em `~/.habblaud/attachments/` e o que
  o servidor aceita ler e mostrar.
- **Chaves e arquivos com permissão restrita**: `~/.habblaud/world.json` (token do Habblaud World),
  `~/.habblaud/remote-secret`, a chave da CA e o certificado em `~/.habblaud/remote-tls/` e os demais arquivos
  gravados com permissão `600` (pasta `700`) — vazamento, permissão errada ou inclusão em log, resposta ou URL.
- **Habblaud World** (`shared/world/` e `server/world/`): o que sobe ao servidor do mundo. A lista fechada do que
  pode sair está em [`docs/world/privacidade.md`](docs/world/privacidade.md); mandar algo fora dela é uma falha de
  segurança e de privacidade.

## O que está fora do escopo

- **Extensões do navegador** e outros programas que rodam na mesma máquina: quem alcança `http://localhost:4747`
  consegue usar o que a página consegue (inclusive responder permissões e mandar mensagens, se esses recursos
  estiverem ligados). Isso está documentado no [README](README.md#privacy-and-security); não é uma falha do
  Habblaud.
- **Máquina já comprometida**: malware, outro usuário com acesso à sua conta do sistema ou um processo com os mesmos
  privilégios que lê `~/.claude` e `~/.habblaud` diretamente.
- **Engenharia social**, phishing e alguém que já tem a senha da porta remota ou o acesso físico ao computador.
- **Falhas nas ferramentas de IA** (Claude Code, Codex e afins), no Node.js, no Docker ou no navegador: relate ao
  projeto responsável. Se a falha só existir por causa de como o Habblaud usa a ferramenta, aí é conosco.
- **Exposição proposital e insegura**: rodar com `HABBLAUD_REMOTE_INSECURE_HTTP=1` numa rede em que não confia, ou
  publicar a porta 4747 (sem login) na internet.

## Se você expõe a porta remota

A porta remota (`https://<nome>.local`, criada por `npm run remote:setup`) é opcional e é a única pensada para sair
do computador. Algumas regras:

- **HTTPS sempre.** Sem certificado a porta não sobe; `HABBLAUD_REMOTE_INSECURE_HTTP=1` força HTTP puro, com a senha
  e o cookie à vista na rede. Use isso só em teste, na rede local, e desligue depois.
- **Exponha o mínimo.** Prefira `HABBLAUD_REMOTE_HOST`/`HABBLAUD_REMOTE_BIND` restritos à interface da rede local em
  vez de `0.0.0.0` quando não precisar de outra interface, e deixe `HABBLAUD_REMOTE_ALLOW` com o mínimo: o padrão é
  só `permissions`; `messages`, `terminal` e `spawn` ampliam bastante o que quem tem a senha pode fazer. `none`
  deixa a porta só para ver o escritório.
- **Nunca publique a porta 4747.** Ela não tem login e é a que dá acesso ao terminal, às permissões, às mensagens e
  ao editor de personagem. Para acesso de fora, use a porta remota ou um túnel que aponte para ela.
- **Senha longa e única**: o `remote:setup` exige pelo menos 10 caracteres, sem espaços nas pontas e diferente do
  usuário — mas isso é o mínimo, não uma medida de força. Trocar a senha encerra todas as sessões abertas. Depois de
  5 senhas erradas seguidas, cada nova tentativa espera de 1 s a 5 min.
- **Confira o que está ligado** em `GET /api/health`: ele devolve a versão, se está no Docker, e o estado de
  `terminal`, `permissions`, `messages`, das fontes e do uso de cada conta. Na porta remota, o mesmo endereço só
  responde depois do login.
- **Desligue o que não usa**: `npm run remote:setup -- --off` remove a porta remota; `HABBLAUD_WORLD=0` desliga o
  Habblaud World; `HABBLAUD_UPDATE_CHECK=0` desliga a única consulta externa feita por padrão.
- **Atualize.** A versão em uso aparece na barra do topo; as notas de cada versão ficam no
  [`CHANGELOG.md`](CHANGELOG.md).

## Dados e privacidade

- **Nada sai por padrão.** O servidor não tem telemetria. A única chamada externa padrão é a verificação de versão
  nova, anônima, para a API pública do GitHub; `HABBLAUD_UPDATE_CHECK=0` desliga.
- **Habblaud World**: vem ligado, mas **nada sai do computador antes de você criar a conta e entrar**. Depois disso,
  sobe só o que está na lista fechada de [`docs/world/privacidade.md`](docs/world/privacidade.md) — o prédio, os
  andares com ids aleatórios e os personagens, sem caminhos, nomes de projeto, títulos, comandos, conversas, custo,
  modelo, branch nem dados da sua conta do Claude ou do Codex. `HABBLAUD_WORLD=0` desliga tudo. O que exatamente foi
  enviado pode ser visto em **Habblaud World › Ver o que foi enviado** (o JSON exato da última remessa).
- **O que fica nesta máquina**: `~/.habblaud/` (em Docker, o volume `/data`) guarda nomes de personagens e salas, o
  uso capturado, as estatísticas do "Meu dia" (30 dias) e a linha do tempo do timelapse (7 dias, sem conversas). A
  conta do World fica em `~/.habblaud/world.json`, com permissão `600`. Como apagar tudo está no
  [README](README.md#uninstalling).
- **O que o Habblaud lê**: os arquivos que as ferramentas de IA já gravam, somente leitura — sessões, transcrições,
  subagentes, o cache do `/usage` e, das configurações de shell, apenas as linhas de `alias`. Ele não lê senhas nem
  tokens de acesso das contas. Os detalhes, recurso por recurso, estão em
  [README › Privacy and security](README.md#privacy-and-security).

---

## English summary

Habblaud is MIT-licensed, runs on your machine, and by default only accepts connections from `localhost`. Supported
versions: **1.0.x** (current release: 1.0.3). Older versions (0.x / CodeTown) are unsupported.

**Report vulnerabilities privately** through GitHub Security Advisories:
<https://github.com/marmottajr/habblaud/security/advisories/new> (**Security** tab › **Report a vulnerability**). Do
not open a public issue, and do not include real session data, paths, tokens or credentials — use demo mode
(`?mock=1`) for screenshots and logs. There is no bug bounty and no guaranteed response time.

**In scope:** the local HTTP/SSE server and its Host/Origin guards, secret masking, the local-only terminal and
history, the remote port (`HABBLAUD_REMOTE_*`: scrypt login, HMAC-signed HttpOnly cookies, login throttling, the
`HABBLAUD_REMOTE_ALLOW` feature set, the local CA/TLS), the Claude Code mod and its permission/message plugins,
attachments and deliveries (`~/.habblaud/attachments/`), files and keys stored with mode `600`, and the Habblaud World
uplink (anything sent outside the closed list in [`docs/world/privacidade.md`](docs/world/privacidade.md)).

**Out of scope:** browser extensions or other local programs that can reach `localhost`, an already compromised
machine, social engineering, and vulnerabilities in Claude Code, Codex, Node.js, Docker or the browser itself.
Deliberately running `HABBLAUD_REMOTE_INSECURE_HTTP=1` on an untrusted network, or publishing the unauthenticated
port 4747, is misuse rather than a vulnerability.

**If you expose the remote port:** keep HTTPS (never plain HTTP outside local testing), bind to the narrowest
interface you need, keep `HABBLAUD_REMOTE_ALLOW` minimal, never publish port 4747, use a strong password and check
`GET /api/health` for what is enabled. Nothing leaves the machine by default except the anonymous update check; the
Habblaud World only sends data after you create an account and sign in, and the exact list is in
[`docs/world/privacidade.md`](docs/world/privacidade.md) (Portuguese).
