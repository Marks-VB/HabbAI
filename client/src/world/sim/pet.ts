// Simulação do mascote do escritório: caminha pelo corredor e lounge, dorme nos tapetes e reage a carinho.
import { TILE } from '../../art/api';
import type { PetDir, PetPose } from '../../art/pet';

export class OfficePet {
  x = 0;
  y = 0;
  targetX = 0;
  targetY = 0;
  dir: PetDir = 'down';
  pose: PetPose = 'sit';
  frame = 0;
  stateTimer = 5000;
  purrTimer = 0;
  private animTimer = 0;
  private initialized = false;

  /** `random` é injetável para os testes (determinismo); no jogo é o Math.random. */
  constructor(private readonly random: () => number = Math.random) {}

  init(spawnX: number, spawnY: number): void {
    if (this.initialized) return;
    this.x = spawnX;
    this.y = spawnY;
    this.targetX = spawnX;
    this.targetY = spawnY;
    this.initialized = true;
  }

  pet(): boolean {
    this.pose = 'sit';
    this.purrTimer = 4000;
    this.stateTimer = 5000;
    return true;
  }

  tick(dt: number, walkable: (tx: number, ty: number) => boolean, randomWalkable: () => { x: number; y: number } | null): void {
    this.animTimer += dt;
    if (this.purrTimer > 0) {
      this.purrTimer -= dt;
    }

    // Avança animação
    const frameRate = this.pose === 'walk' ? 180 : 400;
    if (this.animTimer >= frameRate) {
      this.animTimer = 0;
      this.frame = (this.frame + 1) % 8;
    }

    if (this.purrTimer > 0) {
      this.pose = 'sit';
      return;
    }

    this.stateTimer -= dt;

    if (this.pose === 'walk') {
      const dx = this.targetX - this.x;
      const dy = this.targetY - this.y;
      const dist = Math.hypot(dx, dy);
      const speed = 28 * (dt / 1000); // 28 px/s

      if (dist <= speed || dist < 2) {
        this.x = this.targetX;
        this.y = this.targetY;
        // Chegou: escolhe se senta ou dorme
        this.pose = this.random() < 0.4 ? 'sleep' : 'sit';
        this.stateTimer = this.pose === 'sleep' ? 14000 + this.random() * 10000 : 5000 + this.random() * 6000;
      } else {
        this.x += (dx / dist) * speed;
        this.y += (dy / dist) * speed;

        if (Math.abs(dx) > Math.abs(dy)) {
          this.dir = dx > 0 ? 'right' : 'left';
        } else {
          this.dir = dy > 0 ? 'down' : 'up';
        }
      }
    } else {
      // Sentado ou dormindo: quando expira, escolhe novo destino
      if (this.stateTimer <= 0) {
        const dest = randomWalkable();
        if (dest && walkable(dest.x, dest.y)) {
          this.targetX = dest.x * TILE + TILE / 2;
          this.targetY = dest.y * TILE + TILE / 2;
          this.pose = 'walk';
          this.stateTimer = 12000; // timeout se enroscar
        } else {
          this.pose = 'sit';
          this.stateTimer = 4000;
        }
      }
    }
  }
}
