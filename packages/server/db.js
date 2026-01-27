const mysql = require("mysql2/promise");

let pool;

function getPool() {
  if (pool) return pool;

  pool = mysql.createPool({
    host: "127.0.0.1",
    user: "dnzy",
    password: "DnzyRP_Db_123!",
    database: "dnzy_rp",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  return pool;
}

module.exports = { getPool };
