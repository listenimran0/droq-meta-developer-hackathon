/**
 * DROQ voice — anti-feed, pro-street.
 * Copy should make the couch feel wrong and the sidewalk feel charged.
 */

export type OutdoorBand = 'dawn' | 'day' | 'dusk' | 'night';

export function outdoorBand(date = new Date()): OutdoorBand {
  const h = date.getHours();
  if (h >= 5 && h < 9) return 'dawn';
  if (h >= 9 && h < 17) return 'day';
  if (h >= 17 && h < 20) return 'dusk';
  return 'night';
}

/** One-line outdoor pull — not a greeting, a nudge out the door. */
export function outdoorPull(band: OutdoorBand, locale: 'en' | 'bn' = 'en'): string {
  if (locale === 'bn') {
    switch (band) {
      case 'dawn':
        return 'সকালের আলো — পায়ে হাঁটার সেরা সময়।';
      case 'day':
        return 'রাস্তাই ফিড। স্ক্রল নয় — হাঁটো।';
      case 'dusk':
        return 'সন্ধ্যা নামছে। শহরে লুকোনো মুহূর্ত অপেক্ষা করছে।';
      case 'night':
        return 'রাতের শহর শান্ত — তবুও কিছু অপেক্ষা করে।';
    }
  }
  switch (band) {
    case 'dawn':
      return 'First light. Best hour to put feet on pavement.';
    case 'day':
      return 'The street is the feed. Walk, don’t scroll.';
    case 'dusk':
      return 'Golden hour. Secrets show up when the sky softens.';
    case 'night':
      return 'Quiet city. Something may still be waiting out there.';
  }
}

/** Soft brass wash intensity by hour — dawn/dusk warmer. */
export function outdoorGlowBoost(band: OutdoorBand): number {
  switch (band) {
    case 'dawn':
      return 1.25;
    case 'dusk':
      return 1.35;
    case 'night':
      return 0.85;
    default:
      return 1;
  }
}
