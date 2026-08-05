import React from 'react';
import ReactDOM from 'react-dom/client';

// Local font hosting (no remote Google Fonts dependency).
// @fontsource ships woff2 + @font-face declarations per weight/subset;
// Vite resolves the relative `./files/*.woff2` urls at build time.
import '@fontsource/press-start-2p/latin-400.css';
import '@fontsource/silkscreen/latin-400.css';
import '@fontsource/silkscreen/latin-700.css';

import App from '@/App';
import '@/index.css';
import '@/styles/pixel.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
);
