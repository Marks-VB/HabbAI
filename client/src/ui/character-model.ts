// Editor do personagem, parte pura (sem DOM): quando a gaveta oferece a edição, como as peças se agrupam, os rótulos
// em português e o que vai para o servidor em `parts`. A interface fica em character-editor.ts.
import { PART_KEYS, type AppearanceParts, type PartKey } from '../../../shared/appearance';
import { isDemoId } from '../../../shared/timeline';
import type { AgentInfo } from '../../../shared/types';
import type { Appearance } from '../art/api';
import { tr } from '../../../shared/i18n';

export interface EditGate {
  /** O agente ainda está no escritório. */
  live: boolean;
  /** meta.terminal: o HabbAI só é acessível pelo próprio computador (bind local). */
  terminal: boolean;
  /** A página foi aberta por localhost/127.x (o servidor recusa o resto). */
  local: boolean;
  replaying: boolean;
  mock: boolean;
}

/**
 * O lápis "Editar personagem" aparece? Só para o principal real, ao vivo, que não está saindo (offline: o servidor
 * responderia 404) e com acesso local (a trava do terminal).
 */
export function canEditCharacter(a: Pick<AgentInfo, 'id' | 'kind' | 'status'>, g: EditGate): boolean {
  return a.kind === 'main' && a.status !== 'offline' && g.live && g.terminal && g.local && !g.replaying && !g.mock && !isDemoId(a.id);
}

/** Peças que diferem da aparência sorteada pela seed (o que vai em `parts`), na ordem de PART_KEYS. */
export function changedParts(base: Appearance, edited: Appearance): AppearanceParts {
  const out: Record<string, string> = {};
  for (const k of PART_KEYS) {
    const v = edited[k];
    if (v !== undefined && v !== base[k]) out[k] = v;
  }
  return out as AppearanceParts;
}

export interface EditorRow {
  key: PartKey;
  label: string;
  kind: 'style' | 'color';
}

export const EDITOR_GROUPS: readonly { title: string; rows: readonly EditorRow[] }[] = [
  { title: tr('Pele'), rows: [{ key: 'skin', label: tr('Tom'), kind: 'color' }] },
  {
    title: tr('Cabelo'),
    rows: [
      { key: 'hairStyle', label: tr('Estilo'), kind: 'style' },
      { key: 'hair', label: tr('Cor'), kind: 'color' },
    ],
  },
  { title: tr('Barba'), rows: [{ key: 'facialHair', label: tr('Estilo'), kind: 'style' }] },
  { title: tr('Olhos'), rows: [{ key: 'eyes', label: tr('Cor'), kind: 'color' }] },
  {
    title: tr('Parte de cima'),
    rows: [
      { key: 'topStyle', label: tr('Estilo'), kind: 'style' },
      { key: 'top', label: tr('Cor'), kind: 'color' },
      { key: 'topAccent', label: tr('Detalhe'), kind: 'color' },
    ],
  },
  {
    title: tr('Parte de baixo'),
    rows: [
      { key: 'bottomStyle', label: tr('Estilo'), kind: 'style' },
      { key: 'bottom', label: tr('Cor'), kind: 'color' },
    ],
  },
  { title: tr('Sapatos'), rows: [{ key: 'shoes', label: tr('Cor'), kind: 'color' }] },
  {
    title: tr('Acessório'),
    rows: [
      { key: 'accessory', label: tr('Tipo'), kind: 'style' },
      { key: 'accessoryColor', label: tr('Cor'), kind: 'color' },
    ],
  },
];

const STYLE_LABELS: Partial<Record<PartKey, Readonly<Record<string, string>>>> = {
  hairStyle: {
    short: tr('Curto'), buzz: tr('Raspado'), spiky: tr('Espetado'), side_part: tr('Repartido'), curly: tr('Cacheado'), afro: tr('Black power'),
    bob: tr('Chanel'), long: tr('Longo'), ponytail: tr('Rabo de cavalo'), bun: tr('Coque'), pigtails: 'Maria-chiquinha', mohawk: tr('Moicano'),
    bald: tr('Careca'), wavy: tr('Ondulado'),
  },
  topStyle: {
    tshirt: tr('Camiseta'), hoodie: tr('Moletom'), shirt_tie: tr('Camisa e gravata'), sweater: tr('Suéter'), jacket: tr('Jaqueta'),
    blouse: tr('Blusa'), polo: 'Polo', vader: tr('Armadura sombria'), aloha: tr('Camisa havaiana'), tank: tr('Regata'),
    lab_coat: tr('Jaleco'), tuxedo: tr('Smoking'), gown: tr('Toga de formatura'), kimono: tr('Quimono'), overalls: tr('Macacão'),
    pajamas: tr('Pijama'), raincoat: tr('Capa de chuva'), life_vest: tr('Colete salva-vidas'), jersey: tr('Uniforme de futebol'),
    armor: tr('Armadura medieval'), wetsuit: tr('Fato de mergulho'),
  },
  bottomStyle: {
    pants: tr('Calça'), shorts: tr('Bermuda'), skirt: tr('Saia'), swim: tr('Calção de banho'), jeans: tr('Bermuda jeans'),
    long_skirt: tr('Saia longa'), apron: tr('Avental'),
  },
  accessory: {
    none: tr('Nenhum'), glasses: tr('Óculos'), sunglasses: tr('Óculos escuros'), headphones: tr('Fone'), cap: tr('Boné'), beanie: tr('Gorro'),
    earrings: tr('Brincos'), bow: tr('Laço'), helmet: tr('Capacete sombrio'),
    crown: tr('Coroa'), top_hat: tr('Cartola'), pirate_hat: tr('Chapéu de pirata'), chef_hat: tr('Touca de chef'),
    knight_helm: tr('Elmo de cavaleiro'), hood: tr('Capuz'), cat_ears: tr('Orelhas de gato'), bow_tie: tr('Gravata borboleta'),
    monocle: tr('Monóculo'), sleep_mask: tr('Máscara de dormir'), goggles: tr('Óculos de natação'),
  },
  facialHair: { none: tr('Sem barba'), stubble: tr('Por fazer'), beard: tr('Barba'), mustache: tr('Bigode'), goatee: tr('Cavanhaque') },
};

/** Rótulo em português de um estilo (cabelo, roupa, acessório...). */
export function styleLabel(key: PartKey, value: string): string {
  return STYLE_LABELS[key]?.[value] ?? value;
}

/** Modelos prontos de personagem (roupa + acessório + cores): um clique veste o bonequinho inteiro. */
export interface CharacterPreset {
  id: string;
  label: string;
  parts: Partial<AppearanceParts>;
}

export const CHARACTER_PRESETS: readonly CharacterPreset[] = [
  {
    id: 'vader',
    label: tr('Lorde sombrio'),
    parts: { topStyle: 'vader', top: '#262a33', topAccent: '#8a96a3', bottomStyle: 'pants', bottom: '#2c2c35', shoes: '#2b2b33', accessory: 'helmet', accessoryColor: '#22242c' },
  },
  {
    id: 'beach',
    label: tr('Dia de praia'),
    parts: { topStyle: 'aloha', top: '#36b0b0', topAccent: '#f2d16b', bottomStyle: 'swim', bottom: '#e2604f', shoes: '#b88752', accessory: 'sunglasses', accessoryColor: '#22232b' },
  },
  {
    id: 'tank',
    label: tr('Regata e bermuda'),
    parts: { topStyle: 'tank', top: '#f1efe9', topAccent: '#4a86d8', bottomStyle: 'shorts', bottom: '#3f5f8c', shoes: '#ececec', accessory: 'cap', accessoryColor: '#e2604f' },
  },
  {
    id: 'detective',
    label: tr('Detetive'),
    parts: { topStyle: 'jacket', top: '#6b4a35', topAccent: '#e8e3d6', bottomStyle: 'pants', bottom: '#2c2c35', shoes: '#2b2b33', accessory: 'sunglasses', accessoryColor: '#22232b' },
  },
  {
    id: 'astronaut',
    label: tr('Astronauta'),
    parts: { topStyle: 'jacket', top: '#b08a5e', topAccent: '#c9ced6', bottomStyle: 'pants', bottom: '#e2ded5', shoes: '#ececec', accessory: 'helmet', accessoryColor: '#e8e6e1' },
  },
  {
    id: 'musician',
    label: tr('Músico'),
    parts: { topStyle: 'hoodie', top: '#3d4352', topAccent: '#f2d16b', bottomStyle: 'pants', bottom: '#2c2c35', shoes: '#ececec', accessory: 'headphones', accessoryColor: '#e2604f' },
  },
  {
    id: 'intern',
    label: tr('Estagiário'),
    parts: { topStyle: 'polo', top: '#4a86d8', topAccent: '#f4f4f0', bottomStyle: 'pants', bottom: '#b49c72', shoes: '#6b4630', accessory: 'glasses', accessoryColor: '#2b2b33' },
  },
  {
    id: 'winter',
    label: tr('Inverno'),
    parts: { topStyle: 'sweater', top: '#b04a5a', topAccent: '#e8e3d6', bottomStyle: 'pants', bottom: '#2e3e5e', shoes: '#6b4630', accessory: 'beanie', accessoryColor: '#4bab72' },
  },
  {
    id: 'party',
    label: tr('Festa'),
    parts: { topStyle: 'blouse', top: '#8d66cf', topAccent: '#e8e3d6', bottomStyle: 'skirt', bottom: '#2c2c35', shoes: '#d04848', accessory: 'earrings', accessoryColor: '#f2c14e' },
  },
  {
    id: 'scientist',
    label: tr('Cientista'),
    parts: { topStyle: 'lab_coat', top: '#f7f7f4', topAccent: '#4a86d8', bottomStyle: 'pants', bottom: '#e2ded5', shoes: '#ececec', accessory: 'goggles', accessoryColor: '#5bc0de' },
  },
  {
    id: 'chef',
    label: tr('Chef'),
    parts: { topStyle: 'blouse', top: '#f1efe9', topAccent: '#c9ced6', bottomStyle: 'apron', bottom: '#f4f4f0', shoes: '#2b2b33', accessory: 'chef_hat', accessoryColor: '#f7f7f4' },
  },
  {
    id: 'pirate',
    label: tr('Pirata'),
    parts: { topStyle: 'blouse', top: '#f1efe9', topAccent: '#c9ced6', bottomStyle: 'pants', bottom: '#2c2c35', shoes: '#6b4630', accessory: 'pirate_hat', accessoryColor: '#2b2b33' },
  },
  {
    id: 'knight',
    label: tr('Cavaleiro'),
    parts: { topStyle: 'armor', top: '#8a96a3', topAccent: '#f2d16b', bottomStyle: 'pants', bottom: '#2c3655', shoes: '#2b2b33', accessory: 'knight_helm', accessoryColor: '#c9ced6' },
  },
  {
    id: 'monarch',
    label: tr('Monarca'),
    parts: { topStyle: 'gown', top: '#2f3b6b', topAccent: '#f2d16b', bottomStyle: 'long_skirt', bottom: '#2c3655', shoes: '#2b2b33', accessory: 'crown', accessoryColor: '#f2d16b' },
  },
  {
    id: 'diver',
    label: tr('Mergulhador'),
    parts: { topStyle: 'wetsuit', top: '#22242c', topAccent: '#36b0b0', bottomStyle: 'pants', bottom: '#2c2c35', shoes: '#3f63a8', accessory: 'goggles', accessoryColor: '#5bc0de' },
  },
  {
    id: 'gala',
    label: tr('Gala'),
    parts: { topStyle: 'tuxedo', top: '#1c2028', topAccent: '#f4f4f0', bottomStyle: 'pants', bottom: '#2c2c35', shoes: '#2b2b33', accessory: 'monocle', accessoryColor: '#f2d16b' },
  },
  {
    id: 'nap',
    label: tr('Soneca'),
    parts: { topStyle: 'pajamas', top: '#c3d3e6', topAccent: '#4a6a8a', bottomStyle: 'pants', bottom: '#7f9cc4', shoes: '#ececec', accessory: 'sleep_mask', accessoryColor: '#4a3a6a' },
  },
];

/** A linha aparece com esta aparência? (sem acessório, não há cor de acessório para escolher) */
export function rowVisible(r: EditorRow, a: Pick<Appearance, 'accessory'>): boolean {
  return !(r.key === 'accessoryColor' && a.accessory === 'none');
}
