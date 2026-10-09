// Shared by parts.routes.js (manual Stock In/Out, CSV import) and
// breakdowns.routes.js / services.routes.js (stock moves when a repair or
// service records parts used).
// Always call this inside a transaction the caller owns (beginTransaction
// already called on `connection`) — it does a SELECT ... FOR UPDATE so two
// concurrent stock-outs on the same part can't both pass the stock check.
//
// Receiving stock (type 'IN') automatically clears any pending reorder —
// that's what "receiving the order" means, so there's no separate step to
// close it out.
function applyStockTransaction(connection, { part_id, type, quantity, reason, reference_type, reference_id, created_by }, callback) {
    if (!part_id || (type !== 'IN' && type !== 'OUT') || !quantity || quantity <= 0) {
        return callback(new Error("part_id, a positive quantity, and type 'IN' or 'OUT' are required."));
    }

    connection.query('SELECT quantity FROM parts WHERE id = ? FOR UPDATE', [part_id], (err, rows) => {
        if (err) return callback(err);
        if (!rows.length) return callback(new Error(`Part #${part_id} not found.`));

        const current = rows[0].quantity;
        if (type === 'OUT' && quantity > current) {
            return callback(new Error(`Only ${current} in stock for part #${part_id} — can't remove ${quantity}.`));
        }

        const newQty = type === 'IN' ? current + quantity : current - quantity;

        connection.query(
            'INSERT INTO part_transactions (part_id, type, quantity, reason, reference_type, reference_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [part_id, type, quantity, reason || null, reference_type || null, reference_id || null, created_by || null],
            (insErr) => {
                if (insErr) return callback(insErr);

                const updateSql = type === 'IN'
                    ? 'UPDATE parts SET quantity = ?, reorder_status = NULL, reorder_expected_date = NULL WHERE id = ?'
                    : 'UPDATE parts SET quantity = ? WHERE id = ?';
                connection.query(updateSql, [newQty, part_id], (updErr) => {
                    if (updErr) return callback(updErr);
                    callback(null, { quantity: newQty });
                });
            }
        );
    });
}

// Makes the parts recorded against one breakdown/service match `desired`
// ([{part_id, quantity}], the FULL list that should now be on record) by
// applying only the difference as Stock In / Stock Out transactions. This is
// what keeps edits and deletes honest: re-saving the same list moves no stock,
// removing a part returns it, and deleting the parent record passes an empty
// list to give everything back. Runs inside the caller's transaction.
function syncReferenceParts(connection, { reference_type, reference_id, desired, label, created_by }, callback) {
    const wanted = new Map();
    (desired || []).forEach(p => {
        if (p && p.part_id && p.quantity > 0) {
            wanted.set(Number(p.part_id), (wanted.get(Number(p.part_id)) || 0) + Number(p.quantity));
        }
    });

    connection.query(
        `SELECT part_id, SUM(CASE WHEN type = 'OUT' THEN quantity ELSE -quantity END) AS net
         FROM part_transactions WHERE reference_type = ? AND reference_id = ? GROUP BY part_id`,
        [reference_type, reference_id],
        (err, rows) => {
            if (err) return callback(err);

            const existing = new Map(rows.map(r => [Number(r.part_id), Number(r.net)]));
            const deltas = [];
            new Set([...wanted.keys(), ...existing.keys()]).forEach(partId => {
                const delta = (wanted.get(partId) || 0) - (existing.get(partId) || 0);
                if (delta !== 0) deltas.push({ partId, delta });
            });

            // Give stock back before taking any out, so a swap between two
            // parts never fails a stock check it would actually pass.
            deltas.sort((a, b) => a.delta - b.delta);

            (function next(i) {
                if (i >= deltas.length) return callback(null);
                const { partId, delta } = deltas[i];
                applyStockTransaction(connection, {
                    part_id: partId,
                    type: delta > 0 ? 'OUT' : 'IN',
                    quantity: Math.abs(delta),
                    reason: delta > 0 ? `Used on ${label}` : `Returned from ${label}`,
                    reference_type, reference_id, created_by
                }, (stockErr) => stockErr ? callback(stockErr) : next(i + 1));
            })(0);
        }
    );
}

module.exports = { applyStockTransaction, syncReferenceParts };
