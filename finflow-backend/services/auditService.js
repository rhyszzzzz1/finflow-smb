"use strict";

const crypto = require("crypto");

class AuditService {
  constructor(pool, options = {}) {
    if (!pool) {
      throw new Error("AuditService requires a mysql2/promise pool");
    }
    this.pool = pool;
    this.idFactory = options.idFactory || (() => crypto.randomUUID());
  }

  static sanitizeJson(value) {
    if (value === undefined) return null;
    try {
      return JSON.stringify(value);
    } catch (_error) {
      return JSON.stringify({ error: "non-serializable" });
    }
  }

  static createRequestMeta(req) {
    return {
      ipAddress: req.ip || null,
      userAgent: req.headers["user-agent"] || null,
      route: req.originalUrl || req.path || null,
      method: req.method || null,
      requestBody: req.body || null,
    };
  }

  async ensureSchema() {
    const statements = [
      `
      CREATE TABLE IF NOT EXISTS audit_logs (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NULL,
        company_id VARCHAR(36) NULL,
        actor_user_id VARCHAR(36) NULL,
        entity_type VARCHAR(100) NULL,
        entity_id VARCHAR(36) NULL,
        action_type VARCHAR(50) NULL,
        action VARCHAR(100) NULL,
        reason VARCHAR(255) NULL,
        before_state JSON NULL,
        after_state JSON NULL,
        ip_address VARCHAR(45) NULL,
        user_agent TEXT NULL,
        http_method VARCHAR(10) NULL,
        method VARCHAR(10) NULL,
        endpoint VARCHAR(255) NULL,
        route VARCHAR(255) NULL,
        status_code INT NULL,
        request_body JSON NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_audit_actor_date (actor_user_id, created_at),
        KEY idx_audit_company_entity (company_id, entity_type, created_at),
        KEY idx_audit_action (action_type, created_at)
      )
      `,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS company_id VARCHAR(36) NULL`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_user_id VARCHAR(36) NULL`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_type VARCHAR(100) NULL`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_id VARCHAR(36) NULL`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS action_type VARCHAR(50) NULL`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS action VARCHAR(100) NULL`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS reason VARCHAR(255) NULL`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS before_state JSON NULL`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS after_state JSON NULL`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45) NULL`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT NULL`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS method VARCHAR(10) NULL`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS route VARCHAR(255) NULL`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS status_code INT NULL`,
      `ALTER TABLE audit_logs MODIFY COLUMN http_method VARCHAR(10) NULL`,
      `ALTER TABLE audit_logs MODIFY COLUMN endpoint VARCHAR(255) NULL`,
      `CREATE INDEX idx_audit_actor_date ON audit_logs (actor_user_id, created_at)`,
      `CREATE INDEX idx_audit_company_entity ON audit_logs (company_id, entity_type, created_at)`,
      `CREATE INDEX idx_audit_action ON audit_logs (action_type, created_at)`,
    ];

    for (const sql of statements) {
      try {
        await this.pool.execute(sql);
      } catch (_error) {
        // Mixed environments may already have these changes.
      }
    }
  }

  async logAction(payload, conn = null) {
    const {
      actorUserId = null,
      companyId = null,
      entityType = "system_event",
      entityId = null,
      actionType = "event",
      reason = null,
      oldValues = null,
      newValues = null,
      ipAddress = null,
      userAgent = null,
      route = null,
      method = null,
      statusCode = null,
      requestBody = null,
    } = payload || {};

    const execute = conn ? conn.execute.bind(conn) : this.pool.execute.bind(this.pool);

    try {
      await execute(
        `INSERT INTO audit_logs
          (id, user_id, company_id, actor_user_id, entity_type, entity_id, action_type, action, reason,
           before_state, after_state, ip_address, user_agent, http_method, method, endpoint, route, status_code, request_body)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          this.idFactory(),
          actorUserId,
          companyId,
          actorUserId,
          entityType,
          entityId ? String(entityId) : null,
          actionType,
          actionType,
          reason,
          AuditService.sanitizeJson(oldValues),
          AuditService.sanitizeJson(newValues),
          ipAddress,
          userAgent,
          method,
          method,
          route,
          route,
          statusCode,
          AuditService.sanitizeJson(requestBody),
        ]
      );
    } catch (_error) {
      // Auditing must never break the primary financial workflow.
    }
  }
}

module.exports = {
  AuditService,
};
