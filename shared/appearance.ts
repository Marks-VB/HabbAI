// Peças da aparência que dá para escolher no editor do personagem: as listas dos estilos, a validação do que chega
// pela API e uma assinatura estável. As paletas e as regras de combinação ficam na arte
// (client/src/art/character/appearance.ts, editorOptions); aqui fica só o formato. Puro: sem Node nem DOM.

export const HAIR_STYLES = [
  'short', 'buzz', 'spiky', 'side_part', 'curly', 'afro', 'bob', 'long', 'ponytail', 'bun', 'pigtails', 'mohawk', 'bald', 'wavy',
] as const;
/** Estilos clássicos (os mesmos do protocolo do Habblaud World). */
export const TOP_STYLES = ['tshirt', 'hoodie', 'shirt_tie', 'sweater', 'jacket', 'blouse', 'polo'] as const;
export const ACCESSORIES = ['none', 'glasses', 'sunglasses', 'headphones', 'cap', 'beanie', 'earrings', 'bow'] as const;
export const FACIAL_HAIR = ['none', 'stubble', 'beard', 'mustache', 'goatee'] as const;
export const BOTTOM_STYLES = ['pants', 'shorts', 'skirt'] as const;

/**
 * Estilos que existem só no escritório (o editor do personagem): as roupas temáticas — armadura sombria, camisa
 * havaiana, regata, jaleco, smoking, toga, quimono, macacão, pijama, capa de chuva, colete salva-vidas, uniforme,
 * armadura medieval e fato de mergulho — o calção de banho, a saia longa, a bermuda jeans, o avental, o capacete e os
 * acessórios de cabeça (coroa, cartola, chapéu de pirata, touca de chef, elmo, capuz, orelhas de gato, gravata
 * borboleta, monóculo, máscara de dormir, óculos de natação). O protocolo do Habblaud World não os conhece; antes de
 * subir, `flattenAppearance` os troca pelo equivalente clássico mais próximo (ver shared/world/appearance-flat.ts).
 */
export const OFFICE_TOP_STYLES = [
  ...TOP_STYLES,
  'vader', 'aloha', 'tank',
  'lab_coat', 'tuxedo', 'gown', 'kimono', 'overalls', 'pajamas', 'raincoat', 'life_vest', 'jersey', 'armor', 'wetsuit',
] as const;
export const OFFICE_ACCESSORIES = [
  ...ACCESSORIES,
  'helmet',
  'crown', 'top_hat', 'pirate_hat', 'chef_hat', 'knight_helm', 'hood', 'cat_ears', 'bow_tie', 'monocle', 'sleep_mask', 'goggles',
] as const;
export const OFFICE_BOTTOM_STYLES = [...BOTTOM_STYLES, 'swim', 'jeans', 'long_skirt', 'apron'] as const;

/** Peças escolhidas no editor, aplicadas por cima da aparência sorteada pela `seed`. Cores em `#rrggbb`. */
export interface AppearanceParts {
  skin?: string;
  hair?: string;
  hairStyle?: (typeof HAIR_STYLES)[number];
  eyes?: string;
  top?: string;
  topAccent?: string;
  topStyle?: (typeof OFFICE_TOP_STYLES)[number];
  bottom?: string;
  bottomStyle?: (typeof OFFICE_BOTTOM_STYLES)[number];
  shoes?: string;
  accessory?: (typeof OFFICE_ACCESSORIES)[number];
  accessoryColor?: string;
  facialHair?: (typeof FACIAL_HAIR)[number];
}

/**
 * Ordem fixa das peças: a mesma em parseAppearanceParts, partsKey e no editor (changedParts). O timelapse compara
 * por JSON, então a ordem precisa ser estável.
 */
export const PART_KEYS = [
  'skin', 'hair', 'hairStyle', 'eyes', 'top', 'topAccent', 'topStyle', 'bottom', 'bottomStyle', 'shoes', 'accessory',
  'accessoryColor', 'facialHair',
] as const satisfies readonly (keyof AppearanceParts)[];
export type PartKey = (typeof PART_KEYS)[number];

const STYLE_VALUES: Partial<Record<PartKey, readonly string[]>> = {
  hairStyle: HAIR_STYLES,
  topStyle: OFFICE_TOP_STYLES,
  bottomStyle: OFFICE_BOTTOM_STYLES,
  accessory: OFFICE_ACCESSORIES,
  facialHair: FACIAL_HAIR,
};

const CLASSIC_STYLE_VALUES: Partial<Record<PartKey, readonly string[]>> = {
  ...STYLE_VALUES,
  topStyle: TOP_STYLES,
  bottomStyle: BOTTOM_STYLES,
  accessory: ACCESSORIES,
};

/** Peças no formato do protocolo do World (sem os estilos que só existem no escritório). */
export type ClassicAppearanceParts = Omit<AppearanceParts, 'topStyle' | 'bottomStyle' | 'accessory'> & {
  topStyle?: (typeof TOP_STYLES)[number];
  bottomStyle?: (typeof BOTTOM_STYLES)[number];
  accessory?: (typeof ACCESSORIES)[number];
};
const COLOR = /^#[0-9a-f]{6}$/i;
// Controle (C0/C1), separadores de linha e parágrafo (U+2028/2029) e marcas de direção do texto (U+200E/200F,
// U+202A–202E, U+2066–2069): dá para disfarçar um nome com elas.
const CONTROL = /[\p{Cc}\u2028\u2029\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;

export const NAME_MAX = 24;

/** Peças válidas na ordem de PART_KEYS (cores em minúsculas), ou null se houver algo fora do formato. */
export function parseAppearanceParts(raw: unknown): ClassicAppearanceParts | null {
  return parseParts(raw, CLASSIC_STYLE_VALUES) as ClassicAppearanceParts | null;
}

/** Igual, mas com os estilos que só existem no escritório (armadura, havaiana, regata, sunga, capacete). */
export function parseOfficeAppearanceParts(raw: unknown): AppearanceParts | null {
  return parseParts(raw, STYLE_VALUES) as AppearanceParts | null;
}

function parseParts(raw: unknown, styles: Partial<Record<PartKey, readonly string[]>>): Record<string, string> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  for (const k of Object.keys(src)) if (!(PART_KEYS as readonly string[]).includes(k)) return null;
  const out: Record<string, string> = {};
  for (const k of PART_KEYS) {
    const v = src[k];
    if (v === undefined) continue;
    if (typeof v !== 'string') return null;
    const allowed = styles[k];
    if (allowed ? !allowed.includes(v) : !COLOR.test(v)) return null;
    out[k] = allowed ? v : v.toLowerCase();
  }
  return out;
}

/** Nome do personagem: NFC, sem espaços sobrando, de 1 a NAME_MAX caracteres e sem caracteres de controle. */
export function parseCharacterName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!name || CONTROL.test(name) || [...name].length > NAME_MAX) return null;
  return name;
}

/** Semente da aparência: inteiro de 32 bits sem sinal. */
export function parseSeed(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= 0xffffffff ? raw : null;
}

/** Chave para comparar nomes: "ana" e "Ana" (ou "Júlia" em NFD e em NFC) são o mesmo nome. */
export function nameKey(name: string): string {
  return name.normalize('NFC').toLocaleLowerCase('pt-BR');
}

/** Assinatura estável de `parts` (cache de avatares e detecção de mudança). */
export function partsKey(parts: AppearanceParts | undefined): string {
  return parts ? PART_KEYS.map((k) => parts[k] ?? '').join(',') : '';
}
