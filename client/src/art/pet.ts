// Arte procedural do mascote do escritório (gato malhado laranja em pixel art 1x).
export type PetPose = 'sit' | 'sleep' | 'walk';
export type PetDir = 'down' | 'up' | 'left' | 'right';

const C_BODY = '#e87a28';
const C_SHADE = '#b54e0c';
const C_WHITE = '#fff0e0';
const C_EYE = '#38b000';
const C_NOSE = '#ff8fa3';
const C_EAR = '#f7a072';

function createCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export class PetSprites {
  private cache = new Map<string, HTMLCanvasElement>();

  get(pose: PetPose, dir: PetDir, frame: number): HTMLCanvasElement {
    const key = `${pose}_${dir}_${frame}`;
    let c = this.cache.get(key);
    if (!c) {
      c = this.render(pose, dir, frame);
      this.cache.set(key, c);
    }
    return c;
  }

  private render(pose: PetPose, dir: PetDir, frame: number): HTMLCanvasElement {
    const w = 16;
    const h = 16;
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    const px = (x: number, y: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    };

    const rect = (x: number, y: number, rw: number, rh: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, rw, rh);
    };

    if (pose === 'sleep') {
      const breath = frame % 2 === 0 ? 0 : 1;
      // Gato enrodilhado dormindo
      rect(3, 8 - breath, 10, 5 + breath, C_BODY);
      rect(4, 7 - breath, 8, 1, C_BODY);
      // Listras nas costas
      px(6, 8 - breath, C_SHADE);
      px(8, 8 - breath, C_SHADE);
      px(10, 8 - breath, C_SHADE);
      // Focinho e orelhinhas
      px(3, 10, C_WHITE);
      px(4, 9 - breath, C_EAR);
      px(2, 9 - breath, C_SHADE);
      // Rabinho curvado
      px(13, 11, C_SHADE);
      px(13, 10, C_BODY);
      px(12, 9, C_BODY);
      return canvas;
    }

    if (pose === 'sit') {
      const tailWag = frame % 2 === 0 ? 0 : 1;
      // Corpo sentado
      rect(4, 6, 8, 7, C_BODY);
      rect(6, 8, 4, 4, C_WHITE); // peito branco
      // Patinhas
      px(5, 13, C_WHITE);
      px(8, 13, C_WHITE);
      // Cabeça
      rect(4, 2, 7, 5, C_BODY);
      // Orelhas
      px(4, 1, C_EAR);
      px(9, 1, C_EAR);
      // Olhos
      if (frame % 4 === 0) {
        // piscada
        px(5, 4, C_SHADE);
        px(8, 4, C_SHADE);
      } else {
        px(5, 4, C_EYE);
        px(8, 4, C_EYE);
      }
      px(6, 5, C_NOSE);
      // Rabo
      px(12, 11 + tailWag, C_BODY);
      px(12, 10 + tailWag, C_SHADE);
      return canvas;
    }

    // walk: 4 direções
    const step = (frame % 4);
    const legOffset = step === 1 ? -1 : step === 3 ? 1 : 0;

    if (dir === 'left' || dir === 'right') {
      const flip = dir === 'left';
      ctx.save();
      if (flip) {
        ctx.scale(-1, 1);
        ctx.translate(-w, 0);
      }
      // Corpo
      rect(3, 5, 8, 5, C_BODY);
      // Cabeça
      rect(9, 3, 5, 5, C_BODY);
      px(10, 2, C_EAR);
      px(13, 2, C_EAR);
      px(12, 4, C_EYE);
      px(13, 5, C_NOSE);
      // Patas
      rect(4 + legOffset, 10, 2, 3, C_BODY);
      rect(8 - legOffset, 10, 2, 3, C_BODY);
      px(4 + legOffset, 13, C_WHITE);
      px(8 - legOffset, 13, C_WHITE);
      // Rabo
      px(2, 6, C_BODY);
      px(1, 5, C_SHADE);
      ctx.restore();
      return canvas;
    }

    if (dir === 'up') {
      // De costas
      rect(4, 5, 8, 6, C_BODY);
      px(6, 6, C_SHADE);
      px(8, 6, C_SHADE);
      // Cabeça
      rect(4, 2, 7, 4, C_BODY);
      px(4, 1, C_EAR);
      px(9, 1, C_EAR);
      // Patas
      rect(4, 11 + legOffset, 2, 2, C_BODY);
      rect(8, 11 - legOffset, 2, 2, C_BODY);
      // Rabo erguido
      px(7, 4, C_SHADE);
      px(7, 3, C_BODY);
      return canvas;
    }

    // down (olhando para a câmera)
    rect(4, 6, 8, 5, C_BODY);
    rect(6, 7, 4, 3, C_WHITE);
    // Cabeça
    rect(4, 2, 7, 5, C_BODY);
    px(4, 1, C_EAR);
    px(9, 1, C_EAR);
    px(5, 4, C_EYE);
    px(8, 4, C_EYE);
    px(6, 5, C_NOSE);
    // Patas alternando
    rect(4, 11 + legOffset, 2, 2, C_BODY);
    rect(8, 11 - legOffset, 2, 2, C_BODY);
    px(4, 13 + legOffset, C_WHITE);
    px(8, 13 - legOffset, C_WHITE);

    return canvas;
  }
}
