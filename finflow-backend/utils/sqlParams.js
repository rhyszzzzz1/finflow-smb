"use strict";

/**
 * mysql2 rejects `undefined` in prepared-statement bindings; use SQL NULL (JS null) instead.
 * @param {unknown[]} values
 * @returns {unknown[]}
 */
function sqlParams(values) {
  if (!Array.isArray(values)) {
    return values;
  }
  return values.map((v) => {
    if (v === undefined) return null;
    if (typeof v === "number" && Number.isNaN(v)) return null;
    return v;
  });
}

/**
 * Normalizes the second argument to pool/connection `.execute(sql, params)` so mysql2 never sees `undefined`.
 * @param {unknown} params
 * @returns {unknown}
 */
function sanitizeExecuteBindings(params) {
  if (params === undefined || params === null) {
    return undefined;
  }
  if (Array.isArray(params)) {
    return sqlParams(params);
  }
  if (params !== null && typeof params === "object") {
    const out = {};
    for (const key of Object.keys(params)) {
      const v = params[key];
      out[key] = v === undefined ? null : v;
    }
    return out;
  }
  return params;
}

/**
 * Wraps mysql2/promise `.execute` (and pool `getConnection` conns) so bindings never contain `undefined`.
 * Use on pools (`createPool`) and on `connection.promise()` handles (`db.promise()`).
 * For pools, apply before `instrumentLegacyWriteGuards`.
 * @param {object} target
 */
function instrumentMysqlPromiseExecutable(target) {
  if (!target || target.execute?.__mysqlBindSanitizerWrapped) {
    return target;
  }

  const wrapExecuteOn = (obj) => {
    if (!obj || typeof obj.execute !== "function" || obj.execute.__mysqlBindSanitizerWrapped) {
      return obj;
    }
    const nativeExecute = obj.execute.bind(obj);
    const safeExecute = async function executeWithSanitizedBinds(sqlOrOpts, params) {
      // mysql2 base/connection: execute({ sql, values }, cb) — sanitize embedded values
      if (
        typeof sqlOrOpts === "object"
        && sqlOrOpts !== null
        && typeof sqlOrOpts.sql === "string"
        && (params === undefined || params === null)
      ) {
        const opts = { ...sqlOrOpts };
        if (Array.isArray(opts.values)) {
          opts.values = sqlParams(opts.values);
        }
        return nativeExecute(opts);
      }
      if (params === undefined || params === null) {
        return nativeExecute(sqlOrOpts);
      }
      return nativeExecute(sqlOrOpts, sanitizeExecuteBindings(params));
    };
    safeExecute.__mysqlBindSanitizerWrapped = true;
    obj.execute = safeExecute;
    return obj;
  };

  /** Array binds only — avoids mangling `query(sql, optionsObject)` overloads. */
  const wrapQueryArrayBindsOn = (obj) => {
    if (!obj || typeof obj.query !== "function" || obj.query.__mysqlBindSanitizerWrapped) {
      return obj;
    }
    const nativeQuery = obj.query.bind(obj);
    const safeQuery = async function queryWithSanitizedArrayBinds(sql, params) {
      if (params === undefined || params === null) {
        return nativeQuery(sql);
      }
      if (Array.isArray(params)) {
        return nativeQuery(sql, sqlParams(params));
      }
      return nativeQuery(sql, params);
    };
    safeQuery.__mysqlBindSanitizerWrapped = true;
    obj.query = safeQuery;
    return obj;
  };

  wrapExecuteOn(target);
  wrapQueryArrayBindsOn(target);

  if (typeof target.getConnection === "function" && !target.getConnection.__mysqlBindGetConnectionWrapped) {
    const nativeGetConnection = target.getConnection.bind(target);
    const wrappedGetConnection = async (...args) => {
      const conn = await nativeGetConnection(...args);
      wrapExecuteOn(conn);
      wrapQueryArrayBindsOn(conn);
      return conn;
    };
    wrappedGetConnection.__mysqlBindGetConnectionWrapped = true;
    target.getConnection = wrappedGetConnection;
  }

  return target;
}

/** @deprecated use instrumentMysqlPromiseExecutable */
function instrumentMysqlPoolExecuteBindings(pool) {
  return instrumentMysqlPromiseExecutable(pool);
}

module.exports = {
  sqlParams,
  sanitizeExecuteBindings,
  instrumentMysqlPromiseExecutable,
  instrumentMysqlPoolExecuteBindings,
};
