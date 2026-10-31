// Fila de anúncios para leitor de tela, sem DOM: o primeiro sai na hora e os demais esperam a vez
// (mínimo de 2 s entre eles), com um teto para um pico não virar minutos de leitura. O relógio e o
// agendador são injetáveis para os testes. Separada de ui/announce.ts (que tem a regra do escritório e
// o contexto da interface) para a cena Visita poder usar a fila sem depender da UI do escritório.
export const ANNOUNCE_INTERVAL_MS = 2_000;
/** Teto da fila (um escritório grande mudando de uma vez não vira uma leitura sem fim). */
export const ANNOUNCE_QUEUE_MAX = 20;

export class AnnouncementQueue {
  private pending: string[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly say: (text: string) => void,
    private readonly intervalMs: number = ANNOUNCE_INTERVAL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  /** Quantos anúncios ainda esperam na fila. */
  get size(): number {
    return this.pending.length;
  }

  push(text: string): void {
    const clean = text.trim();
    if (!clean) return;
    this.pending.push(clean);
    // Um pico (o servidor volta com tudo mudado) não pode virar minutos de leitura: fica o aviso mais recente.
    if (this.pending.length > ANNOUNCE_QUEUE_MAX) this.pending.splice(0, this.pending.length - ANNOUNCE_QUEUE_MAX);
    this.pump();
  }

  clear(): void {
    this.pending = [];
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private pump(): void {
    if (this.timer || !this.pending.length) return;
    const wait = this.lastAt + this.intervalMs - this.now();
    if (wait > 0) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.pump();
      }, wait);
      return;
    }
    this.lastAt = this.now();
    const text = this.pending.shift();
    if (text !== undefined) this.say(text);
    // O que sobrou espera a próxima janela (sem depender de um push novo para andar).
    this.pump();
  }
}
