// Shared UI helpers, previously copy-pasted into every page: toast messages,
// the confirm dialog, HTML escaping and the Prev/Next pagination control.
// The toast container and confirm dialog markup are injected on first use, so
// pages no longer carry their own copies of that markup.
//
// Plain function declarations on purpose: they become globals the pages' inline
// scripts call directly (showToast(...), showConfirm(...), escapeHtml(...)).
// Pages must NOT redeclare these names with let/const — that's a SyntaxError.
var GENERIC_ERROR = 'Something went wrong. Please try again.';

function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function ensureUiMarkup() {
    if (!document.getElementById('toastContainer')) {
        const toasts = document.createElement('div');
        toasts.id = 'toastContainer';
        toasts.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] flex flex-col items-center gap-2 pointer-events-none w-full px-4';
        document.body.appendChild(toasts);
    }
    if (!document.getElementById('confirmModal')) {
        const modal = document.createElement('div');
        modal.id = 'confirmModal';
        modal.className = 'fixed inset-0 bg-black/60 hidden z-[60] flex items-center justify-center backdrop-blur-sm p-4';
        modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-lg w-full max-w-sm p-6 text-center">
            <div id="confirmIcon" class="w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center text-xl"></div>
            <h3 id="confirmTitle" class="text-lg font-bold text-gray-800 mb-1"></h3>
            <p id="confirmMessage" class="text-sm text-gray-500 mb-6"></p>
            <div class="flex justify-center gap-3">
                <button id="confirmCancelBtn" class="px-5 py-2.5 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100 transition">Cancel</button>
                <button id="confirmOkBtn" class="px-5 py-2.5 rounded-lg text-sm font-semibold text-white shadow transition">Confirm</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
    }
}

// Success/error feedback: bottom-of-screen toast, colored by type,
// auto-dismisses after 3s.
function showToast(message, type = 'success') {
    ensureUiMarkup();
    const container = document.getElementById('toastContainer');
    const styles = { success: 'bg-green-600', error: 'bg-red-600' };
    const icon = type === 'error' ? 'fa-triangle-exclamation' : 'fa-circle-check';

    const toast = document.createElement('div');
    toast.className = `pointer-events-auto ${styles[type] || styles.success} text-white px-5 py-3 rounded-lg shadow-lg text-sm font-semibold flex items-center gap-2 opacity-0 transition-opacity duration-300 max-w-md`;
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.remove('opacity-0'));

    setTimeout(() => {
        toast.classList.add('opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Promise-based replacement for window.confirm() — resolves true/false,
// matches the app's own modal styling instead of the browser's dialog.
function showConfirm({ title, message, okText = 'Confirm', okColor = 'bg-blue-600 hover:bg-blue-700', icon = 'fa-solid fa-circle-question', iconColor = 'bg-blue-100 text-blue-600' }) {
    ensureUiMarkup();
    return new Promise(resolve => {
        const modal = document.getElementById('confirmModal');
        const okBtn = document.getElementById('confirmOkBtn');
        const cancelBtn = document.getElementById('confirmCancelBtn');

        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = message;

        const iconEl = document.getElementById('confirmIcon');
        iconEl.className = `w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center text-xl ${iconColor}`;
        iconEl.innerHTML = `<i class="${icon}"></i>`;

        okBtn.textContent = okText;
        okBtn.className = `px-5 py-2.5 rounded-lg text-sm font-semibold text-white shadow transition ${okColor}`;

        modal.classList.remove('hidden');

        function cleanup(result) {
            modal.classList.add('hidden');
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            resolve(result);
        }
        function onOk() { cleanup(true); }
        function onCancel() { cleanup(false); }

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
    });
}

// Shared Prev/Next pagination control (Breakdowns, Services, Parts, Reports).
function renderPagination(containerId, totalItems, currentPage, pageSize, onPageChange) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const start = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, totalItems);

    container.innerHTML = `
        <span class="text-gray-500">Showing ${start}-${end} of ${totalItems}</span>
        <div class="flex items-center gap-2">
            <button type="button" id="${containerId}-prev" ${currentPage <= 1 ? 'disabled' : ''} class="px-3 py-1.5 border rounded-lg font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition">
                <i class="fa-solid fa-chevron-left"></i> Prev
            </button>
            <span class="font-semibold text-gray-700 px-2">Page ${currentPage} of ${totalPages}</span>
            <button type="button" id="${containerId}-next" ${currentPage >= totalPages ? 'disabled' : ''} class="px-3 py-1.5 border rounded-lg font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition">
                Next <i class="fa-solid fa-chevron-right"></i>
            </button>
        </div>
    `;
    document.getElementById(`${containerId}-prev`).addEventListener('click', () => { if (currentPage > 1) onPageChange(currentPage - 1); });
    document.getElementById(`${containerId}-next`).addEventListener('click', () => { if (currentPage < totalPages) onPageChange(currentPage + 1); });
}
