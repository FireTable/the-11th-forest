// Minimal i18n runtime. Locale data lives as nested TS objects; this
// module flattens each catalog into dot-path keys at load time via
// `flatMap` and resolves lookups with English fallback.
// ponytail: swap for i18next when namespaces / pluralization / date
// formatting show up.

import type { Catalog, CatalogKey, LocaleCode } from './keys';
import en from './en';
import zhCN from './zh-CN';

export type { Catalog, CatalogKey, LocaleCode };

export function flatten(obj: unknown, prefix = ''): Catalog {
    if (typeof obj !== 'object' || obj === null) return {};
    const entries: Array<[string, string]> = Object.entries(obj as Record<string, unknown>).flatMap(
        ([k, v]) => {
            const key = prefix ? `${prefix}.${k}` : k;
            if (typeof v === 'string') return [[key, v] as [string, string]];
            if (typeof v === 'object' && v !== null) {
                return Object.entries(flatten(v, key));
            }
            return [];
        },
    );
    return Object.fromEntries(entries);
}

const catalogs: Record<LocaleCode, Catalog> = {
    en: flatten(en),
    'zh-CN': flatten(zhCN),
};

let current: LocaleCode = 'en';

export function setLocale(code: LocaleCode): void {
    current = code;
}

export function getLocale(): LocaleCode {
    return current;
}

export function t(key: CatalogKey): string;
export function t(key: string): string;
export function t(key: string): string {
    const cat = catalogs[current];
    return cat[key] ?? catalogs.en[key] ?? key;
}
