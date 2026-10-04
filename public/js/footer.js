// Shared footer, rendered once per page — same self-injecting pattern as
// sidebar.js. A fixed bar (not part of each page's own flex/scroll layout)
// so it works identically regardless of how a given page's content area is
// structured, without needing to touch every page's layout markup.
(function () {
    function renderFooter() {
        if (document.getElementById('app-footer')) return; // avoid double-injection if script runs twice

        const footer = document.createElement('footer');
        footer.id = 'app-footer';
        // inset-x-0 (full width) on mobile, where the sidebar is an off-canvas
        // drawer hidden by default; lg:left-64 pulls the right edge in past the
        // sidebar's own w-64 once it becomes a static column at that breakpoint —
        // otherwise this bar's cuts across the sidebar's
        // at the bottom, showing as a mismatched stripe.
        footer.className = 'fixed bottom-0 inset-x-0 lg:left-64 z-20 bg-white border-t border-gray-200 text-center text-[11px] text-gray-400 py-1.5 px-4';
        footer.innerHTML = `&copy; ${new Date().getFullYear()} ElevateCare &middot; Internal Operations Dashboard`;
        document.body.appendChild(footer);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderFooter);
    } else {
        renderFooter();
    }
})();
