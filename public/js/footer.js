// Shared footer, rendered once per page — same self-injecting pattern as
// sidebar.js. A fixed bar (not part of each page's own flex/scroll layout)
// so it works identically regardless of how a given page's content area is
// structured, without needing to touch every page's layout markup.
(function () {
    function renderFooter() {
        if (document.getElementById('app-footer')) return; // avoid double-injection if script runs twice

        const footer = document.createElement('footer');
        footer.id = 'app-footer';
        footer.className = 'fixed bottom-0 inset-x-0 z-20 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 text-center text-[11px] text-gray-400 dark:text-gray-500 py-1.5 px-4';
        footer.innerHTML = `&copy; ${new Date().getFullYear()} ElevateCare &middot; Internal Operations Dashboard`;
        document.body.appendChild(footer);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderFooter);
    } else {
        renderFooter();
    }
})();
