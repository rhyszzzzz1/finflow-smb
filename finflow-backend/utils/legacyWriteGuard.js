"use strict";

const LEGACY_TABLES = ["invoices", "purchases", "sales", "receivables", "payables"];

function detectLegacyWriteTable(sql) {
  if (typeof sql !== "string") return null;

  for (const table of LEGACY_TABLES) {
    const pattern = new RegExp(
      `\\b(?:INSERT\\s+INTO|REPLACE\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+\`?${table}\`?\\b`,
      "i"
    );
    if (pattern.test(sql)) {
      return table;
    }
  }

  return null;
}

function guardLegacyWriteSql(sql, context = {}) {
  const table = detectLegacyWriteTable(sql);
  if (!table) return null;

  const origin = context.origin || "service";
  const operation = context.operation ? ` via ${context.operation}` : "";
  const message = `[LEGACY_WRITE_BLOCKED] Attempted write to legacy table '${table}' from ${origin}${operation}. Legacy accounting tables are read-only during migration.`;

  console.warn(message);

  if ((process.env.NODE_ENV || "development") !== "production") {
    const error = new Error(message);
    error.code = "LEGACY_TABLE_WRITE_BLOCKED";
    error.table = table;
    throw error;
  }

  return table;
}

function wrapQueryMethod(target, methodName, contextFactory) {
  if (!target || typeof target[methodName] !== "function" || target[methodName].__legacyWriteGuardWrapped) {
    return;
  }

  const original = target[methodName];
  const wrapped = function wrappedLegacyGuard(sql, ...args) {
    guardLegacyWriteSql(sql, contextFactory(methodName));
    return original.call(this, sql, ...args);
  };

  wrapped.__legacyWriteGuardWrapped = true;
  target[methodName] = wrapped;
}

function instrumentLegacyWriteGuards(pool, contextFactory = () => ({ origin: "service" })) {
  wrapQueryMethod(pool, "query", contextFactory);
  wrapQueryMethod(pool, "execute", contextFactory);

  if (typeof pool?.getConnection === "function" && !pool.getConnection.__legacyWriteGuardWrapped) {
    const originalGetConnection = pool.getConnection.bind(pool);
    const wrappedGetConnection = async (...args) => {
      const conn = await originalGetConnection(...args);
      wrapQueryMethod(conn, "query", (methodName) => contextFactory(`connection.${methodName}`));
      wrapQueryMethod(conn, "execute", (methodName) => contextFactory(`connection.${methodName}`));
      return conn;
    };

    wrappedGetConnection.__legacyWriteGuardWrapped = true;
    pool.getConnection = wrappedGetConnection;
  }

  return pool;
}

module.exports = {
  LEGACY_TABLES,
  guardLegacyWriteSql,
  instrumentLegacyWriteGuards,
};
