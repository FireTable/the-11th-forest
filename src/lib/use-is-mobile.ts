import { useEffect, useState } from 'react';

import { isMobileLike } from '@/lib/mobile';

/**
 * Live `isMobileLike()` view, recomputed on resize so the React HUD
 * can switch between desktop and mobile layouts as the viewport /
 * orientation changes. SSR-safe: returns false until the first
 * client-side effect fires.
 */
export function useIsMobile(): boolean {
    const [mobile, setMobile] = useState<boolean>(false);
    useEffect(() => {
        const evaluate = (): void => setMobile(isMobileLike());
        evaluate();
        window.addEventListener('resize', evaluate);
        return () => window.removeEventListener('resize', evaluate);
    }, []);
    return mobile;
}
