const db = require('./db');

// Runs `work(connection, done)` inside a DB transaction: commits if `done` is
// called without an error, rolls back (and releases the connection) otherwise.
// `callback(err, result)` is called once, after the transaction has finished.
function withTransaction(work, callback) {
    db.getConnection((connErr, connection) => {
        if (connErr) return callback(connErr);

        connection.beginTransaction((txErr) => {
            if (txErr) { connection.release(); return callback(txErr); }

            work(connection, (workErr, result) => {
                if (workErr) {
                    return connection.rollback(() => { connection.release(); callback(workErr); });
                }
                connection.commit((commitErr) => {
                    if (commitErr) {
                        return connection.rollback(() => { connection.release(); callback(commitErr); });
                    }
                    connection.release();
                    callback(null, result);
                });
            });
        });
    });
}

// SQL/connection errors from mysql2 carry a `code`; the plain Errors thrown by
// partStock.js (insufficient stock, bad quantity) don't — those are the user's
// problem (400), the rest are ours (500).
function statusFor(err) {
    return err && err.code ? 500 : 400;
}

module.exports = { withTransaction, statusFor };
