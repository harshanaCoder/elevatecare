// Shared light/dark theme engine. The actual class toggle on <html> for the
// *current* page load happens via a tiny inline script in each page's <head>
// (must run before Tailwind paints anything, so it can't wait on this file
// loading over the network) — this file is what the Settings page uses to
// change and persist the preference afterward, and what every page uses to
// keep its own toggle UI (if any) in sync.
(function () {
    const STORAGE_KEY = 'theme'; // 'light' | 'dark'

    function getTheme() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored === 'light' || stored === 'dark') return stored;
        } catch (e) { /* localStorage unavailable (private mode, etc.) */ }
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function applyTheme(theme) {
        document.documentElement.classList.toggle('dark', theme === 'dark');
        try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) { /* ignore */ }
    }

    function toggleTheme() {
        const next = getTheme() === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        return next;
    }

    window.ElevateTheme = { getTheme, applyTheme, toggleTheme };
})();
