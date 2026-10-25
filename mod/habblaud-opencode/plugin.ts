// Plugin do Habblaud para o opencode
// Instalado em <opencode-config>/plugins/habblaud.ts
const HABBLAUD_PORT = 4747;
const FORWARD = new Set([
  'session.created',
  'session.deleted',
  'session.execution.started',
  'session.execution.succeeded',
  'session.execution.failed',
  'session.execution.interrupted',
  'session.tool.input.started',
  'session.tool.success',
  'session.tool.failed',
  'permission.asked',
]);

const send = async (payload: any) => {
  try {
    await fetch(`http://127.0.0.1:${HABBLAUD_PORT}/api/agents/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'opencode',
        account: '.opencode',
        event: payload,
      }),
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    // ignora falha de envio silenciosamente
  }
};

export default {
  id: 'habblaud',
  setup(ctx: any) {
    const controller = new AbortController();
    let currentSessionId: string | undefined;

    void (async () => {
      try {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          if (event?.data?.sessionID && typeof event.data.sessionID === 'string') {
            currentSessionId = event.data.sessionID;
          }
          if (event?.type === 'session.deleted' && event.data?.sessionID === currentSessionId) {
            currentSessionId = undefined;
          }
          if (!FORWARD.has(event?.type)) continue;
          await send(event);
        }
      } catch {
        // ignora erro no stream
      }
    })();

    // Polling de mensagens vindas da interface do Habblaud para o opencode
    const inboxInterval = setInterval(async () => {
      if (!currentSessionId) return;
      try {
        const res = await fetch(`http://127.0.0.1:${HABBLAUD_PORT}/api/mod/inbox`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session: currentSessionId, account: '.opencode' }),
          signal: AbortSignal.timeout(1500),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { messages?: Array<{ id: string; text: string }> };
        if (Array.isArray(data?.messages) && data.messages.length > 0) {
          for (const msg of data.messages) {
            try {
              if (ctx.client?.session?.prompt) {
                await ctx.client.session.prompt({ path: { id: currentSessionId }, body: { prompt: msg.text } });
              }
              await fetch(`http://127.0.0.1:${HABBLAUD_PORT}/api/mod/inbox/ack`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session: currentSessionId, results: [{ id: msg.id, ok: true }] }),
                signal: AbortSignal.timeout(1500),
              });
            } catch (err) {
              await fetch(`http://127.0.0.1:${HABBLAUD_PORT}/api/mod/inbox/ack`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session: currentSessionId, results: [{ id: msg.id, ok: false, error: String(err) }] }),
                signal: AbortSignal.timeout(1500),
              });
            }
          }
        }
      } catch {
        // ignora
      }
    }, 2000);

    return () => {
      clearInterval(inboxInterval);
      controller.abort();
    };
  },
};
