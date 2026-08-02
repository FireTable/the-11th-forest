// Shared types for the i18n catalogs.
//
// - CatalogSource: nested shape each locale file declares. Add a leaf
//   here → every locale file must include it.
// - CatalogKey: dot-path autocomplete for `t('...')` call sites.
// - Catalog: the flattened Record<string, string> that the runtime uses.

export type LocaleCode = 'en' | 'zh-CN';

export type CatalogSource = {
    menu: {
        changeScene: string;
        toggleMovement: string;
        addSprite: string;
    };
    label: {
        spritePosition: string;
    };
    scene: {
        mainMenu: string;
    };
};

export type CatalogKey =
    | 'menu.changeScene'
    | 'menu.toggleMovement'
    | 'menu.addSprite'
    | 'label.spritePosition'
    | 'scene.mainMenu';

export type Catalog = Record<string, string>;
