// Geração determinística de aparência a partir de uma semente (puro, sem DOM). O sorteio e as paletas moraram aqui e
// foram para shared/world/appearance-flat.ts (o mesmo sorteio serve o escritório e o Habblaud World); este módulo
// re-exporta e guarda o que é só do editor do personagem.
import {
  FACIAL_HAIR,
  HAIR_STYLES,
  OFFICE_ACCESSORIES,
  OFFICE_BOTTOM_STYLES,
  OFFICE_TOP_STYLES,
  type PartKey,
} from '../../../../shared/appearance';
import {
  ACC_COLORS,
  BOTTOMS,
  EYES,
  HAIR_FUN,
  HAIR_NATURAL,
  JACKET_COLORS,
  LIGHT_ACCENTS,
  SHIRT_COLORS,
  SHOES,
  SKINS,
  TIE_COLORS,
  TOP_COLORS,
  type SeedAppearance,
} from '../../../../shared/world/appearance-flat';
import type { Appearance, TopStyle } from '../api';
import { tr } from '../../../../shared/i18n';

export { appearanceFromSeed, SKINS } from '../../../../shared/world/appearance-flat';
export type { BottomStyle, FacialHair } from '../../../../shared/world/appearance-flat';

// O formato de shared/world/appearance-flat.ts e o da arte (art/api.ts) não podem se separar.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _sameAppearance: Same<SeedAppearance, Appearance> = true;
void _sameAppearance;

/** Chave estável de uma aparência (para cache de sprites). */
export function appearanceKey(a: Appearance): string {
  return [
    a.skin, a.hair, a.hairStyle, a.eyes, a.top, a.topAccent, a.topStyle, a.bottom, a.shoes, a.accessory,
    a.accessoryColor, a.lanyard ?? '-', a.look, a.facialHair ?? '-', a.bottomStyle ?? '-',
  ].join('|');
}

// ------------------------------------------------------------------ editor do personagem

const uniq = (list: readonly string[]): readonly string[] => [...new Set(list)];
const colorsOf = (pairs: readonly (readonly [string, number])[]): string[] => pairs.map(([c]) => c);
const ACCENTS = uniq([...LIGHT_ACCENTS, ...TOP_COLORS]);

/** Cores de tema das roupas novas (só no editor: o sorteio por semente nunca as escolhe). */
const VADER_TOPS = ['#262a33', '#1c2028', '#3a3140', '#2f3b55', '#3d4352'];
const VADER_ACCENTS = ['#8a96a3', '#c9ced6', '#b03a3a', '#4a86d8'];
const ALOHA_TOPS = ['#36b0b0', '#4a86d8', '#e2604f', '#efb54a', '#4bab72', '#8d66cf', '#5bc0de', '#e47aa8'];
const ALOHA_ACCENTS = ['#f4f4f0', '#f2d16b', '#e47aa8', '#5bc0de', '#f6e7c8'];
const SWIM_COLORS = ['#e2604f', '#4a86d8', '#4bab72', '#efb54a', '#36b0b0', '#e47aa8', '#2c2c35', '#3f5f8c'];

// Peças novas (só do escritório): uma paleta de base e uma de detalhe por estilo, na mesma faixa de saturação e
// brilho das vizinhas.
const LAB_COAT_TOPS = ['#f7f7f4', '#eef2f5', '#e4e8ec', '#dfe7ef', '#d3dee8']; // brancos e cinzas claros
const LAB_COAT_ACCENTS = ['#c9ced6', '#8a96a3', '#2f4c7d', '#4a86d8', '#b03a3a']; // gola, botões e canetas
const TUXEDO_TOPS = ['#1c2028', '#262a33', '#20242c', '#3a3140', '#2f3b55']; // quase-pretos
const TUXEDO_ACCENTS = ['#f4f4f0', '#e8e3d6', '#b03a3a', '#7b2d44', '#2f4c7d']; // camisa, gravata e lenço
const GOWN_TOPS = ['#1f2a44', '#2f3b6b', '#242c4a', '#3a2430', '#5a2338']; // azul-escuro e vinho
const GOWN_ACCENTS = ['#f2d16b', '#d9a42e', '#e8c86a', '#c9ced6', '#e8e3d6']; // faixa dourada
const KIMONO_TOPS = ['#b03a3a', '#2f4c7d', '#3c7a52', '#8d66cf', '#e47aa8', '#3d4352'];
const KIMONO_ACCENTS = ['#f2d16b', '#f4f4f0', '#e2604f', '#2c2c35', '#c9ced6']; // faixa (obi) e forro
const OVERALLS_TOPS = ['#3f5f8c', '#2e3e5e', '#55719b', '#2c3655', '#4a6a8a']; // jeans
const OVERALLS_ACCENTS = ['#f1efe9', '#e2604f', '#e8e3d6', '#4bab72', '#c9ced6']; // camiseta e fivela
const PAJAMAS_TOPS = ['#8fa8c8', '#c3d3e6', '#e2c6ce', '#c8dcc0', '#e6dcc0'];
const PAJAMAS_ACCENTS = ['#4a6a8a', '#2f4c7d', '#9b3b3b', '#3d4352', '#f4f4f0']; // listras e botões
const RAINCOAT_TOPS = ['#f4cd52', '#efb54a', '#f2d16b', '#e0a63c', '#f7e08c']; // amarelos de capa
const RAINCOAT_ACCENTS = ['#c9ced6', '#8a96a3', '#f4f4f0', '#3d4352', '#e8e3d6']; // botões, forro e brilho
const LIFE_VEST_TOPS = ['#f07a35', '#d95b2a', '#efb54a', '#f29b72', '#e2604f'];
const LIFE_VEST_ACCENTS = ['#f4f4f0', '#c9ced6', '#8a96a3', '#3d4352']; // faixas refletivas e zíper
const JERSEY_TOPS = ['#4a86d8', '#e2604f', '#4bab72', '#f1efe9', '#f2d16b', '#8d66cf'];
const JERSEY_ACCENTS = ['#f4f4f0', '#2f4c7d', '#2c2c35', '#f2d16b', '#b03a3a']; // faixa, gola e número
const ARMOR_TOPS = ['#8a96a3', '#5b7590', '#6d7480', '#a8b2bd', '#c9ced6']; // aços
const ARMOR_ACCENTS = ['#f2d16b', '#d9a42e', '#3d4352', '#b08a5e', '#e8e3d6']; // dourado e cinto
const WETSUIT_TOPS = ['#22242c', '#1c2028', '#2b2b33', '#2f3b55', '#20323c']; // lycra escura
const WETSUIT_ACCENTS = ['#e2604f', '#4a86d8', '#36b0b0', '#efb54a', '#8a96a3']; // faixa e zíper

const JEANS_COLORS = ['#3f5f8c', '#2e3e5e', '#55719b', '#2c3655', '#7f9cc4']; // denim
const LONG_SKIRT_COLORS = ['#3f5f8c', '#2e3e5e', '#2c2c35', '#b49c72', '#6d7480', '#2c3655']; // os tons de BOTTOMS
const APRON_COLORS = ['#f4f4f0', '#e8e3d6', '#d6c8a8', '#b9a882', '#c9ced6']; // brancos e cáquis

/** Cores da parte de cima e do detalhe para cada estilo: as mesmas que o sorteio usa. */
function topPalettes(style: TopStyle): { top: readonly string[]; topAccent: readonly string[] } {
  switch (style) {
    case 'shirt_tie':
      return { top: SHIRT_COLORS, topAccent: TIE_COLORS };
    case 'jacket':
      return { top: JACKET_COLORS, topAccent: ACCENTS };
    case 'vader':
      return { top: VADER_TOPS, topAccent: VADER_ACCENTS };
    case 'aloha':
      return { top: ALOHA_TOPS, topAccent: ALOHA_ACCENTS };
    case 'lab_coat':
      return { top: LAB_COAT_TOPS, topAccent: LAB_COAT_ACCENTS };
    case 'tuxedo':
      return { top: TUXEDO_TOPS, topAccent: TUXEDO_ACCENTS };
    case 'gown':
      return { top: GOWN_TOPS, topAccent: GOWN_ACCENTS };
    case 'kimono':
      return { top: KIMONO_TOPS, topAccent: KIMONO_ACCENTS };
    case 'overalls':
      return { top: OVERALLS_TOPS, topAccent: OVERALLS_ACCENTS };
    case 'pajamas':
      return { top: PAJAMAS_TOPS, topAccent: PAJAMAS_ACCENTS };
    case 'raincoat':
      return { top: RAINCOAT_TOPS, topAccent: RAINCOAT_ACCENTS };
    case 'life_vest':
      return { top: LIFE_VEST_TOPS, topAccent: LIFE_VEST_ACCENTS };
    case 'jersey':
      return { top: JERSEY_TOPS, topAccent: JERSEY_ACCENTS };
    case 'armor':
      return { top: ARMOR_TOPS, topAccent: ARMOR_ACCENTS };
    case 'wetsuit':
      return { top: WETSUIT_TOPS, topAccent: WETSUIT_ACCENTS };
    default:
      return { top: TOP_COLORS, topAccent: ACCENTS };
  }
}

/** Cores da parte de baixo: a sunga/calção de banho, o jeans, a saia longa e o avental têm paleta própria. */
function bottomPalettes(style: string): readonly string[] {
  switch (style) {
    case 'swim':
      return SWIM_COLORS;
    case 'jeans':
      return JEANS_COLORS;
    case 'long_skirt':
      return LONG_SKIRT_COLORS;
    case 'apron':
      return APRON_COLORS;
    default:
      return colorsOf(BOTTOMS);
  }
}

export type EditorOptions = Readonly<Record<PartKey, readonly string[]>>;

/** Opções de cada peça no editor do personagem, conforme a aparência atual (as cores da roupa dependem do estilo). */
export function editorOptions(a: Appearance): EditorOptions {
  const top = topPalettes(a.topStyle);
  return {
    skin: SKINS,
    hair: [...colorsOf(HAIR_NATURAL), ...HAIR_FUN],
    hairStyle: HAIR_STYLES,
    eyes: uniq(EYES),
    top: top.top,
    topAccent: top.topAccent,
    topStyle: OFFICE_TOP_STYLES,
    bottom: bottomPalettes(a.bottomStyle ?? 'pants'),
    bottomStyle: OFFICE_BOTTOM_STYLES,
    shoes: colorsOf(SHOES),
    accessory: OFFICE_ACCESSORIES,
    accessoryColor: ACC_COLORS[a.accessory],
    facialHair: FACIAL_HAIR,
  };
}

const TALL_HAIR: readonly string[] = ['afro', 'bun', 'mohawk', 'pigtails'];
const SHORT_HAIR: readonly string[] = ['bald', 'buzz'];
/** Chapéu que assenta na cabeça: some dentro do volume de um cabelo alto. */
const TALL_HATS: readonly string[] = ['cap', 'beanie', 'top_hat', 'pirate_hat', 'chef_hat', 'knight_helm', 'hood'];

/** Combinação que o sorteio evita (o editor desabilita a opção): devolve o motivo, ou undefined se pode. */
export function editorConflict(a: Appearance, key: PartKey, value: string): string | undefined {
  if (key === 'accessory') {
    if (TALL_HATS.includes(value) && TALL_HAIR.includes(a.hairStyle)) return tr('Não combina com este cabelo');
    if (value === 'bow' && SHORT_HAIR.includes(a.hairStyle)) return tr('Não combina com este cabelo');
  }
  if (key === 'hairStyle') {
    if (TALL_HATS.includes(a.accessory) && TALL_HAIR.includes(value)) return tr('Não combina com o chapéu');
    if (a.accessory === 'bow' && SHORT_HAIR.includes(value)) return tr('Não combina com o laço');
  }
  return undefined;
}

/** Depois de trocar um estilo: cores que não existem na paleta nova caem na primeira dela. */
export function fitToOptions(a: Appearance): Appearance {
  const o = editorOptions(a);
  const fit = (v: string, list: readonly string[]): string => (list.includes(v) ? v : list[0]);
  return { ...a, top: fit(a.top, o.top), topAccent: fit(a.topAccent, o.topAccent), accessoryColor: fit(a.accessoryColor, o.accessoryColor) };
}
