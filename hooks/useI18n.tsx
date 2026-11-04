import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dictionaries, type Locale, type TranslationKey } from '@/constants/i18n';

const KEY = 'drop:locale';

type I18nValue = {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: TranslationKey) => string;
  typeLabel: (type: string) => string;
};

const I18nContext = createContext<I18nValue | undefined>(undefined);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => {
      if (v === 'bn' || v === 'en') setLocaleState(v);
    });
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    AsyncStorage.setItem(KEY, next).catch(() => undefined);
  }, []);

  const t = useCallback(
    (key: TranslationKey) => dictionaries[locale][key] ?? dictionaries.en[key] ?? key,
    [locale],
  );

  const typeLabel = useCallback(
    (type: string) => {
      const key = `type_${type}` as TranslationKey;
      return dictionaries[locale][key] ?? dictionaries.en[key] ?? type;
    },
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t, typeLabel }), [locale, setLocale, t, typeLabel]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
