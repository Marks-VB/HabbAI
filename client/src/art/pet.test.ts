// Arte procedural do mascote sem DOM de verdade: um canvas falso registra os pixels pintados, e conferimos o
// cache de sprites, o tamanho, as poses (dormindo, sentado, andando) e o espelhamento das direções.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PetSprites, type PetDir, type PetPose } from './pet';

interface Fill {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

class FakeContext {
  fillStyle = '';
  readonly fills: Fill[] = [];
  readonly scales: Array<{ x: number; y: number }> = [];
  fillRect(x: number, y: number, w: number, h: number): void {
    this.fills.push({ x, y, w, h, color: this.fillStyle });
  }
  save(): void {}
  restore(): void {}
  scale(x: number, y: number): void {
    this.scales.push({ x, y });
  }
  translate(): void {}
}

class FakeCanvas {
  width = 0;
  height = 0;
  readonly ctx = new FakeContext();
  getContext(): FakeContext {
    return this.ctx;
  }
}

/** Instala um `document.createElement('canvas')` falso (o módulo é de navegador). */
function stubCanvas(): void {
  vi.stubGlobal('document', {
    createElement: () => new FakeCanvas(),
  });
}

const ctxOf = (canvas: unknown): FakeContext => (canvas as FakeCanvas).ctx;
const POSES: PetPose[] = ['sit', 'sleep', 'walk'];
const DIRS: PetDir[] = ['down', 'up', 'left', 'right'];
const C_SHADE = '#b54e0c';
const C_EYE = '#38b000';
const C_BODY = '#e87a28';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PetSprites', () => {
  it('cacheia por pose, direção e quadro (e nunca devolve o mesmo sprite para chaves diferentes)', () => {
    stubCanvas();
    const sprites = new PetSprites();
    const sit = sprites.get('sit', 'down', 0);
    expect(sprites.get('sit', 'down', 0)).toBe(sit);
    expect(sprites.get('sit', 'down', 1)).not.toBe(sit);
    expect(sprites.get('walk', 'down', 0)).not.toBe(sit);
    expect(sprites.get('sit', 'up', 0)).not.toBe(sit);
  });

  it('desenha todos os quadros em 16x16', () => {
    stubCanvas();
    const sprites = new PetSprites();
    for (const pose of POSES) {
      for (const dir of DIRS) {
        for (let frame = 0; frame < 8; frame++) {
          const canvas = sprites.get(pose, dir, frame) as unknown as FakeCanvas;
          expect(canvas.width, `${pose}/${dir}/${frame}`).toBe(16);
          expect(canvas.height, `${pose}/${dir}/${frame}`).toBe(16);
          expect(canvas.ctx.fills.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('dormindo: a respiração alterna a cada quadro (0 = 2 = 4...)', () => {
    stubCanvas();
    const sprites = new PetSprites();
    const f0 = ctxOf(sprites.get('sleep', 'down', 0)).fills;
    const f1 = ctxOf(sprites.get('sleep', 'down', 1)).fills;
    const f2 = ctxOf(sprites.get('sleep', 'down', 2)).fills;
    expect(f1).not.toEqual(f0);
    expect(f2).toEqual(f0);
    // O corpo encolhe/sobe na respiração (10x5 no quadro par, 10x6 no ímpar).
    expect(f0.find((f) => f.color === C_BODY)).toMatchObject({ x: 3, y: 8, w: 10, h: 5 });
    expect(f1.find((f) => f.color === C_BODY)).toMatchObject({ x: 3, y: 7, w: 10, h: 6 });
  });

  it('sentado: pisca a cada 4 quadros (olhos escuros no 0, verdes no 1)', () => {
    stubCanvas();
    const sprites = new PetSprites();
    const closed = ctxOf(sprites.get('sit', 'down', 0));
    const open = ctxOf(sprites.get('sit', 'down', 1));
    expect(closed.fills.some((f) => f.color === C_SHADE && f.w === 1 && f.h === 1 && f.y === 4)).toBe(true);
    expect(closed.fills.some((f) => f.color === C_EYE)).toBe(false);
    expect(open.fills.filter((f) => f.color === C_EYE)).toHaveLength(2);
    expect(ctxOf(sprites.get('sit', 'down', 4)).fills.some((f) => f.color === C_EYE)).toBe(false);
  });

  it('andando: as patas alternam com o quadro', () => {
    stubCanvas();
    const sprites = new PetSprites();
    const legs = (frame: number) =>
      ctxOf(sprites.get('walk', 'down', frame))
        .fills.filter((f) => f.color === C_BODY && f.w === 2 && f.h === 2)
        .map((f) => f.y);
    expect(legs(0)).toEqual([11, 11]);
    expect(legs(1)).toEqual([10, 12]);
    expect(legs(3)).toEqual([12, 10]);
    expect(legs(2)).toEqual([11, 11]);
  });

  it('esquerda espelha o desenho; direita, cima e baixo não', () => {
    stubCanvas();
    const sprites = new PetSprites();
    expect(ctxOf(sprites.get('walk', 'left', 0)).scales).toEqual([{ x: -1, y: 1 }]);
    for (const dir of ['right', 'up', 'down'] as PetDir[]) {
      expect(ctxOf(sprites.get('walk', dir, 0)).scales, dir).toEqual([]);
    }
  });

  it('canvas sem contexto 2D: devolve o canvas vazio sem quebrar', () => {
    vi.stubGlobal('document', {
      createElement: () => ({ width: 0, height: 0, getContext: () => null }),
    });
    const sprites = new PetSprites();
    const canvas = sprites.get('sit', 'down', 0) as unknown as { width: number; height: number };
    expect(canvas).toMatchObject({ width: 16, height: 16 });
  });

  it('de costas (up) é diferente de frente (down)', () => {
    stubCanvas();
    const sprites = new PetSprites();
    const up = ctxOf(sprites.get('walk', 'up', 0)).fills;
    const down = ctxOf(sprites.get('walk', 'down', 0)).fills;
    expect(up).not.toEqual(down);
    // De frente aparecem os dois olhos verdes; de costas, nenhum.
    expect(down.filter((f) => f.color === C_EYE)).toHaveLength(2);
    expect(up.some((f) => f.color === C_EYE)).toBe(false);
  });
});
