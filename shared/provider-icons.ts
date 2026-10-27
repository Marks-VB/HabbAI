// Desenhos e cores das ferramentas (Claude Code, Codex, Gemini CLI, Antigravity, opencode e Aider) em pixel art, no
// mesmo estilo dos ícones da interface. São glifos originais — não os logotipos oficiais —, mas cada um tem a forma e
// a cor que identificam a ferramenta de relance. Puro (sem DOM): a interface monta o SVG e o canvas das etiquetas do
// escritório desenha as mesmas linhas.
import type { Provider } from './types';

/** Desenho de cada ferramenta: '#' é um pixel pintado. Todos com 9×9 para alinhar no selo das etiquetas. */
export const PROVIDER_ICON_ROWS: Record<Provider, readonly string[]> = {
  claude: [
    '....#....',
    '....#....',
    '.#..#..#.',
    '..#.#.#..',
    '#########',
    '..#.#.#..',
    '.#..#..#.',
    '....#....',
    '....#....',
  ],
  codex: [
    '..#####..',
    '.#.....#.',
    '#...#...#',
    '#..#.#..#',
    '#...#...#',
    '#.......#',
    '.#.....#.',
    '..#####..',
    '.........',
  ],
  gemini: [
    '....#....',
    '....#....',
    '...###...',
    '..#.#.#..',
    '#########',
    '..#.#.#..',
    '...###...',
    '....#....',
    '....#....',
  ],
  antigravity: [
    '....#....',
    '...###...',
    '..#.#.#..',
    '....#....',
    '..#####..',
    '.#.....#.',
    '.#.....#.',
    '..#####..',
    '.........',
  ],
  opencode: [
    '..#####..',
    '.#.....#.',
    '#.#.....#',
    '#..#....#',
    '#..###..#',
    '#.......#',
    '.#.....#.',
    '..#####..',
    '.........',
  ],
  aider: [
    '.......##',
    '......#..',
    '.....#..#',
    '....#..#.',
    '...#..#..',
    '..#..#...',
    '.#..#....',
    '.#.#.....',
    '.##......',
  ],
};

/** Cor de cada ferramenta nos textos, selos e ícones (a mesma dos selos em ui/styles.css). */
export const PROVIDER_TINT: Record<Provider, string> = {
  claude: '#f2b39a',
  codex: '#a7f3d0',
  gemini: '#8ab4f8',
  antigravity: '#c4b5fd',
  opencode: '#5eead4',
  aider: '#fca5a5',
};
