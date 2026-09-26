// Shared sidebar nav, rendered once per page into <div id="sidebar-root"></div>.
// Keeping this in one place (instead of copy-pasted per page) is what fixes the
// old drift where Spare Parts / Technicians weren't linked from every page.
//
// Responsive: below the `lg` breakpoint the sidebar becomes an off-canvas
// drawer (fixed, translated off-screen) opened by a hamburger button in a
// fixed mobile top bar, with a tap-to-close overlay behind it. At `lg` and
// up it's pinned back into the normal flex layout exactly as before. Every
// page's <body> needs `flex flex-col lg:flex-row` for this to lay out
// correctly — see public/*.html.
//
// Rendered in two passes on purpose: the full nav renders synchronously first
// (so e.g. pending.html's own script can rely on #badgeCount existing the
// instant this script tag finishes — window.onload doesn't wait on fetch()
// calls, so an async-only render would race it). Then an async check against
// /api/auth/me trims the nav down for any role that isn't "admin" — the
// actual access control is enforced server-side (src/server.js); this is
// just so a restricted user isn't shown links that would bounce them back.
(function () {
    const NAV_ITEMS = [
        { href: 'dashboard.html', icon: 'fa-chart-line', label: 'Dashboard' },
        { href: 'pending.html', icon: 'fa-mobile-screen', label: 'App Reviews', variant: 'app-reviews' },
        { href: 'lifts.html', icon: 'fa-building', label: 'Lifts / Escalators' },
        { href: 'breakdowns.html', icon: 'fa-triangle-exclamation', label: 'Breakdowns' },
        { href: 'services.html', icon: 'fa-screwdriver-wrench', label: 'Services' },
        { href: 'parts.html', icon: 'fa-gear', label: 'Spare Parts' },
        { href: 'technicians.html', icon: 'fa-users', label: 'Technicians' },
        { href: 'reports.html', icon: 'fa-chart-pie', label: 'Analytics & Reports' },
        { href: 'settings.html', icon: 'fa-sliders', label: 'Settings' }
    ];

    // What each non-admin role is allowed to see in the nav — keep in sync
    // with ROLE_ACCESS in src/server.js (that's the actual enforcement;
    // this only controls what's shown). Settings is just a per-browser
    // light/dark preference, harmless for any logged-in role to see.
    const ROLE_VISIBLE_PAGES = {
        reports: ['reports.html', 'settings.html']
    };

    function currentPage() {
        return window.location.pathname.split('/').pop() || 'dashboard.html';
    }

    window.handleLogout = async function () {
        try {
            await fetch(`${window.API_BASE}/auth/logout`, { method: 'POST' });
        } catch (err) { /* ignore — redirect anyway, the session gate will catch it either way */ }
        window.location.href = 'login.html';
    };

    window.closeSidebar = function () {
        const sidebar = document.getElementById('app-sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        if (sidebar) sidebar.classList.add('-translate-x-full');
        if (overlay) overlay.classList.add('hidden');
    };

    window.toggleSidebar = function () {
        const sidebar = document.getElementById('app-sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        if (!sidebar || !overlay) return;
        const isOpen = !sidebar.classList.contains('-translate-x-full');
        if (isOpen) {
            window.closeSidebar();
        } else {
            sidebar.classList.remove('-translate-x-full');
            overlay.classList.remove('hidden');
        }
    };

    function navItemHTML(item, active) {
        const isActive = item.href === active;
        const isAppReviews = item.variant === 'app-reviews';

        let liClass;
        if (isActive && isAppReviews) {
            liClass = 'bg-yellow-500 text-gray-900 font-bold p-3 rounded-lg cursor-pointer mb-2 shadow';
        } else if (isActive) {
            liClass = 'bg-blue-600 p-3 rounded-lg cursor-pointer font-semibold mb-2 shadow';
        } else if (isAppReviews) {
            liClass = 'hover:bg-gray-800 text-yellow-400 p-3 rounded-lg cursor-pointer mb-2 transition';
        } else {
            liClass = 'hover:bg-gray-800 text-gray-300 p-3 rounded-lg cursor-pointer mb-2 transition';
        }

        const badge = isAppReviews
            ? ' <span id="badgeCount" class="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full ml-2 hidden">0</span>'
            : '';

        // onclick closes the mobile drawer after navigating away — harmless
        // no-op at the `lg` breakpoint where the sidebar isn't a drawer.
        return `<a href="${item.href}" onclick="closeSidebar()" class="block"><li class="${liClass}"><i class="fa-solid ${item.icon} w-6"></i> ${item.label}${badge}</li></a>`;
    }

    function renderNavList(items) {
        const ul = document.querySelector('#app-sidebar ul');
        if (!ul) return;
        const active = currentPage();
        ul.innerHTML = items.map(item => navItemHTML(item, active)).join('\n            ');
    }

    function renderSidebar() {
        const root = document.getElementById('sidebar-root');
        if (!root) return;

        const active = currentPage();
        const itemsHTML = NAV_ITEMS.map(item => navItemHTML(item, active)).join('\n            ');

        root.outerHTML = `
    <!-- Mobile top bar: only visible below the lg breakpoint -->
    <div class="lg:hidden fixed top-0 inset-x-0 h-14 bg-gray-900 text-white flex items-center justify-between px-4 z-30 shadow">
        <span class="font-bold text-blue-400 text-lg"><i class="fa-solid fa-elevator"></i> ElevateCare</span>
        <button onclick="toggleSidebar()" aria-label="Toggle menu" class="w-10 h-10 flex items-center justify-center text-xl">
            <i class="fa-solid fa-bars"></i>
        </button>
    </div>
    <!-- Spacer reserving the top bar's height, so content doesn't start underneath it -->
    <div class="lg:hidden h-14"></div>
    <!-- Tap-to-close overlay behind the open drawer -->
    <div id="sidebarOverlay" onclick="closeSidebar()" class="hidden lg:hidden fixed inset-0 bg-black/50 z-30"></div>

    <div id="app-sidebar" class="fixed inset-y-0 left-0 w-64 bg-gray-900 text-white flex flex-col p-5 shadow-lg z-40 overflow-y-auto transform -translate-x-full transition-transform duration-200 lg:translate-x-0 lg:static lg:z-10">
        <h2 class="text-2xl font-bold mb-8 text-blue-400"><i class="fa-solid fa-elevator"></i> ElevateCare</h2>
        <ul class="space-y-2">
            ${itemsHTML}
        </ul>
        <div class="mt-auto pt-4 border-t border-gray-700">
            <button onclick="handleLogout()" class="w-full text-left hover:bg-gray-800 text-gray-300 p-3 rounded-lg cursor-pointer transition flex items-center gap-2">
                <i class="fa-solid fa-right-from-bracket w-6"></i> Logout
            </button>
        </div>
    </div>`;
    }

    async function applyRoleRestrictions() {
        const visiblePages = await fetch(`${window.API_BASE}/auth/me`)
            .then(r => r.json())
            .then(data => (data.role && data.role !== 'admin') ? ROLE_VISIBLE_PAGES[data.role] || [] : null)
            .catch(() => null);

        if (visiblePages === null) return; // admin, or the check failed — leave the full nav as-is

        renderNavList(NAV_ITEMS.filter(item => visiblePages.includes(item.href)));
    }

    renderSidebar();
    applyRoleRestrictions();
})();
