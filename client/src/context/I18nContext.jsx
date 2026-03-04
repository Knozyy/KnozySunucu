import { createContext, useContext, useState, useCallback } from 'react';
import { languages, languageNames } from '@/i18n/translations';

const I18nContext = createContext();

export function I18nProvider({ children }) {
    const [locale, setLocale] = useState(() => {
        return localStorage.getItem('locale') || 'tr';
    });

    const t = useCallback((key) => {
        const dict = languages[locale] || languages.tr;
        return dict[key] || key;
    }, [locale]);

    const changeLocale = useCallback((newLocale) => {
        setLocale(newLocale);
        localStorage.setItem('locale', newLocale);
    }, []);

    return (
        <I18nContext.Provider value={{ locale, t, changeLocale, languageNames }}>
            {children}
        </I18nContext.Provider>
    );
}

export function useI18n() {
    const ctx = useContext(I18nContext);
    if (!ctx) throw new Error('useI18n must be used within I18nProvider');
    return ctx;
}
