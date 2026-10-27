// Ícone da ferramenta em pixel art para a interface (o desenho e as cores ficam em shared/provider-icons.ts, também
// usados pelo canvas das etiquetas do escritório). Puro (sem DOM): devolve o SVG.
import type { Provider } from '../../../shared/types';
import { PROVIDER_ICON_ROWS } from '../../../shared/provider-icons';
import { pixelIcon } from './icons';

/** SVG do ícone da ferramenta, na cor do texto (o selo define a cor por ferramenta). */
export function providerIcon(provider: Provider, scale = 1): string {
  return pixelIcon(PROVIDER_ICON_ROWS[provider] ?? PROVIDER_ICON_ROWS.claude, undefined, 'ui-px-icon ui-prov__glyph', scale);
}
