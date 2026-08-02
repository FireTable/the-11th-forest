import { describe, it, expect, beforeEach } from 'vitest';
import { t, setLocale, getLocale, flatten } from '@/locales';

describe('i18n runtime', () => {
    beforeEach(() => {
        setLocale('en');
    });

    it('starts in English by default and exposes a getter', () => {
        expect(getLocale()).toBe('en');
    });

    it('resolves known keys to the active locale string', () => {
        expect(t('scene.mainMenu')).toBe('Main Menu');
        expect(t('menu.changeScene')).toBe('Change Scene');
    });

    it('switches to zh-CN and returns the Chinese strings', () => {
        setLocale('zh-CN');
        expect(t('scene.mainMenu')).toBe('主菜单');
        expect(t('menu.changeScene')).toBe('切换场景');
        expect(t('menu.addSprite')).toBe('添加新精灵');
    });

    it('returns the key itself when the key is missing in both locales', () => {
        expect(t('missing.key')).toBe('missing.key');
    });
});

describe('flatten', () => {
    it('turns nested objects into dot-separated keys', () => {
        expect(flatten({ a: 'x', b: { c: 'y' } })).toEqual({ a: 'x', 'b.c': 'y' });
    });

    it('handles deep nesting', () => {
        expect(flatten({ a: { b: { c: { d: 'deep' } } } })).toEqual({
            'a.b.c.d': 'deep',
        });
    });

    it('skips null leaves', () => {
        expect(flatten({ a: null, b: { c: 'y' } })).toEqual({ 'b.c': 'y' });
    });
});
