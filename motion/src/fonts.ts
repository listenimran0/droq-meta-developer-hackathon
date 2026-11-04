import { loadFont } from '@remotion/fonts';
import syneBold from './assets/Syne_700Bold.ttf';
import syneSemiBold from './assets/Syne_600SemiBold.ttf';
import dmSans from './assets/DMSans_400Regular.ttf';
import dmSansMedium from './assets/DMSans_500Medium.ttf';
import dmSansBold from './assets/DMSans_700Bold.ttf';

/**
 * The real app fonts (Syne + DM Sans), imported straight from `src/assets`.
 * The motion piece has to look like the product, not like a template.
 */
export const fontFamily = {
  brand: 'DROQ Syne',
  display: 'DROQ Syne SemiBold',
  body: 'DROQ DM Sans',
  bodyMedium: 'DROQ DM Sans Medium',
  bodyBold: 'DROQ DM Sans Bold',
};

loadFont({ family: 'DROQ Syne', url: syneBold, weight: '700' });
loadFont({ family: 'DROQ Syne SemiBold', url: syneSemiBold, weight: '600' });
loadFont({ family: 'DROQ DM Sans', url: dmSans, weight: '400' });
loadFont({ family: 'DROQ DM Sans Medium', url: dmSansMedium, weight: '500' });
loadFont({ family: 'DROQ DM Sans Bold', url: dmSansBold, weight: '700' });
