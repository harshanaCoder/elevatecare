// Loads the master unit list once per page and shapes it like the old
// hardcoded liftData: { "BD_01": { "PL": ["PL 1.01", ...], "ES": [...] }, ... }
// Managed from Settings (Units card); served by GET /api/units.
(function () {
    let cached = null;

    window.loadUnits = function () {
        if (!cached) {
            cached = fetch(`${window.API_BASE}/units`)
                .then(r => (r.ok ? r.json() : []))
                .then(rows => {
                    const data = {};
                    rows.forEach(u => {
                        data[u.building] = data[u.building] || {};
                        (data[u.building][u.lift_type] = data[u.building][u.lift_type] || []).push(u.unit_no);
                    });
                    return data;
                })
                .catch(() => ({}));
        }
        return cached;
    };
})();
