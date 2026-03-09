'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { translations, TranslationKey, getTranslation } from './translations';

interface I18nContextType {
    lang: string;
    isNL: boolean;
    t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextType>({
    lang: 'en',
    isNL: false,
    t: (key) => getTranslation(key, 'en'),
});

export function LanguageProvider({ lang, children }: { lang: string, children: ReactNode }) {
    const isNL = lang === 'nl';
    const t = (key: TranslationKey) => getTranslation(key, lang);
    return <I18nContext.Provider value={{ lang, isNL, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
    return useContext(I18nContext);
}
