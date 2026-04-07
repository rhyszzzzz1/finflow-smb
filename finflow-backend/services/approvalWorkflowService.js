"use strict";

const crypto = require("crypto");

const DOCUMENT_CONFIG = {
  sales_invoice: {
    tableName: "sales_invoice_headers",
    label: "Sales invoice",
  },
  purchase_bill: {
    tableName: "purchase_bill_headers",
    label: "Purchase bill",
  },
};

class ApprovalWorkflowService {
  constructor(pool, options = {}) {
    if (!pool) {
      throw new Error("ApprovalWorkflowService requires a mysql2/promise pool");
    }

    this.pool = pool;
    this.auditService = options.auditService || null;
    this.idFactory = options.idFactory || (() => crypto.randomUUID());
  }

  async queryAll(conn, sql, params = []) {
    const [rows] = await conn.execute(sql, params);
    return rows;
  }

  async queryOne(conn, sql, params = []) {
    const rows = await this.queryAll(conn, sql, params);
    return rows[0] || null;
  }

  getDocumentConfig(documentType) {
    const config = DOCUMENT_CONFIG[documentType];
    if (!config) {
      throw new Error(`Unsupported approval document type: ${documentType}`);
    }
    return config;
  }

  async ensureSchema() {
    const statements = [
      `
      CREATE TABLE IF NOT EXISTS approval_workflows (
        id VARCHAR(36) PRIMARY KEY,
        company_id VARCHAR(36) NOT NULL,
        document_type VARCHAR(50) NOT NULL,
        workflow_name VARCHAR(100) NOT NULL,
        require_approval_before_post TINYINT(1) NOT NULL DEFAULT 1,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_by_user_id VARCHAR(36) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_approval_workflows_scope (company_id, document_type, is_active)
      )
      `,
      `
      CREATE TABLE IF NOT EXISTS approval_steps (
        id VARCHAR(36) PRIMARY KEY,
        workflow_id VARCHAR(36) NOT NULL,
        step_no INT NOT NULL,
        step_name VARCHAR(100) NOT NULL,
        approver_role VARCHAR(50) NULL,
        min_approvals INT NOT NULL DEFAULT 1,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_approval_steps_workflow_step (workflow_id, step_no)
      )
      `,
      `
      CREATE TABLE IF NOT EXISTS approval_decisions (
        id VARCHAR(36) PRIMARY KEY,
        workflow_id VARCHAR(36) NULL,
        step_id VARCHAR(36) NULL,
        company_id VARCHAR(36) NOT NULL,
        document_type VARCHAR(50) NOT NULL,
        entity_id VARCHAR(36) NOT NULL,
        decision_type ENUM('submitted','approved','rejected','resubmitted') NOT NULL,
        actor_user_id VARCHAR(36) NOT NULL,
        comment TEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_approval_decisions_entity (document_type, entity_id, created_at)
      )
      `,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS approval_workflow_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS approval_status ENUM('not_required','draft','pending_approval','approved','rejected') NOT NULL DEFAULT 'not_required'`,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS approval_current_step_no INT NULL`,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS submitted_by_user_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP NULL DEFAULT NULL`,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS rejected_by_user_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP NULL DEFAULT NULL`,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS rejection_comment TEXT NULL`,
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS approval_workflow_id VARCHAR(36) NULL`,
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS approval_status ENUM('not_required','draft','pending_approval','approved','rejected') NOT NULL DEFAULT 'not_required'`,
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS approval_current_step_no INT NULL`,
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS submitted_by_user_id VARCHAR(36) NULL`,
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP NULL DEFAULT NULL`,
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS rejected_by_user_id VARCHAR(36) NULL`,
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP NULL DEFAULT NULL`,
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS rejection_comment TEXT NULL`,
    ];

    for (const sql of statements) {
      try {
        await this.pool.execute(sql);
      } catch (_error) {
        // Transitional environments can already have divergent schema state.
      }
    }
  }

  async getActiveWorkflow(conn, companyId, documentType) {
    const workflow = await this.queryOne(
      conn,
      `SELECT *
         FROM approval_workflows
        WHERE company_id = ?
          AND document_type = ?
          AND is_active = 1
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1`,
      [companyId, documentType]
    ).catch(() => null);

    if (!workflow) {
      return null;
    }

    const steps = await this.queryAll(
      conn,
      `SELECT *
         FROM approval_steps
        WHERE workflow_id = ?
          AND is_active = 1
        ORDER BY step_no ASC`,
      [workflow.id]
    ).catch(() => []);

    return {
      ...workflow,
      steps,
    };
  }

  async getWorkflowById(conn, workflowId) {
    if (!workflowId) {
      return null;
    }

    const workflow = await this.queryOne(
      conn,
      `SELECT *
         FROM approval_workflows
        WHERE id = ?
        LIMIT 1`,
      [workflowId]
    ).catch(() => null);

    if (!workflow) {
      return null;
    }

    const steps = await this.queryAll(
      conn,
      `SELECT *
         FROM approval_steps
        WHERE workflow_id = ?
          AND is_active = 1
        ORDER BY step_no ASC`,
      [workflowId]
    ).catch(() => []);

    return {
      ...workflow,
      steps,
    };
  }

  async initializeDocument(conn, { companyId, documentType, entityId }) {
    const { tableName } = this.getDocumentConfig(documentType);
    const workflow = await this.getActiveWorkflow(conn, companyId, documentType);
    await conn.execute(
      `UPDATE ${tableName}
          SET approval_workflow_id = ?,
              approval_status = ?,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [workflow?.id || null, workflow ? "draft" : "not_required", entityId]
    );
    return workflow;
  }

  async getDocumentHeader(conn, documentType, entityId, forUpdate = false) {
    const { tableName } = this.getDocumentConfig(documentType);
    return this.queryOne(
      conn,
      `SELECT *
         FROM ${tableName}
        WHERE id = ?${forUpdate ? " FOR UPDATE" : ""}`,
      [entityId]
    );
  }

  async recordDecision(conn, {
    workflowId = null,
    stepId = null,
    companyId,
    documentType,
    entityId,
    decisionType,
    actorUserId,
    comment = null,
  }) {
    await conn.execute(
      `INSERT INTO approval_decisions
        (id, workflow_id, step_id, company_id, document_type, entity_id, decision_type, actor_user_id, comment)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        this.idFactory(),
        workflowId,
        stepId,
        companyId,
        documentType,
        entityId,
        decisionType,
        actorUserId,
        comment || null,
      ]
    );
  }

  async getDecisionHistory(conn, documentType, entityId) {
    return this.queryAll(
      conn,
      `SELECT id,
              workflow_id,
              step_id,
              company_id,
              document_type,
              entity_id,
              decision_type,
              actor_user_id,
              comment,
              created_at
         FROM approval_decisions
        WHERE document_type = ?
          AND entity_id = ?
        ORDER BY created_at ASC, id ASC`,
      [documentType, entityId]
    ).catch(() => []);
  }

  async buildApprovalView(conn, { companyId, documentType, entityId, header = null }) {
    const currentHeader = header || await this.getDocumentHeader(conn, documentType, entityId, false);
    if (!currentHeader) {
      return null;
    }

    const workflow = currentHeader.approval_workflow_id
      ? await this.getWorkflowById(conn, currentHeader.approval_workflow_id)
      : await this.getActiveWorkflow(conn, companyId, documentType);
    const decisions = await this.getDecisionHistory(conn, documentType, entityId);
    const status = currentHeader.approval_status || (workflow ? "draft" : "not_required");

    return {
      required: !!workflow,
      workflow_id: workflow?.id || null,
      workflow_name: workflow?.workflow_name || null,
      status,
      current_step_no: currentHeader.approval_current_step_no || null,
      submitted_at: currentHeader.submitted_at || null,
      submitted_by_user_id: currentHeader.submitted_by_user_id || null,
      approved_at: currentHeader.approved_at || null,
      approved_by_user_id: currentHeader.approved_by_user_id || null,
      rejected_at: currentHeader.rejected_at || null,
      rejected_by_user_id: currentHeader.rejected_by_user_id || null,
      rejection_comment: currentHeader.rejection_comment || null,
      decisions,
    };
  }

  async submitDocument(conn, { companyId, documentType, entityId, actorUserId, comment = null }) {
    const { tableName, label } = this.getDocumentConfig(documentType);
    const header = await this.getDocumentHeader(conn, documentType, entityId, true);
    if (!header) {
      throw new Error(`${label} not found`);
    }
    if (header.posted_journal_entry_id) {
      throw new Error(`Posted ${label.toLowerCase()}s cannot be resubmitted for approval`);
    }
    if (header.status === "void") {
      throw new Error(`Void ${label.toLowerCase()}s cannot be submitted for approval`);
    }

    const workflow = await this.getActiveWorkflow(conn, companyId, documentType);
    if (!workflow) {
      return {
        workflowRequired: false,
        header,
      };
    }

    const currentApprovalStatus = header.approval_status || "draft";
    if (!["draft", "rejected"].includes(currentApprovalStatus)) {
      throw new Error(`Only draft or rejected ${label.toLowerCase()}s can be submitted for approval`);
    }

    const firstStep = workflow.steps[0] || null;
    const decisionType = currentApprovalStatus === "rejected" ? "resubmitted" : "submitted";

    await conn.execute(
      `UPDATE ${tableName}
          SET approval_workflow_id = ?,
              approval_status = 'pending_approval',
              approval_current_step_no = ?,
              submitted_by_user_id = ?,
              submitted_at = NOW(),
              rejected_by_user_id = NULL,
              rejected_at = NULL,
              rejection_comment = NULL,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [workflow.id, firstStep?.step_no || 1, actorUserId, entityId]
    );

    await this.recordDecision(conn, {
      workflowId: workflow.id,
      stepId: firstStep?.id || null,
      companyId,
      documentType,
      entityId,
      decisionType,
      actorUserId,
      comment,
    });

    return {
      workflowRequired: true,
      decisionType,
      header: await this.getDocumentHeader(conn, documentType, entityId, false),
    };
  }

  async approveDocument(conn, { companyId, documentType, entityId, actorUserId, comment = null }) {
    const { tableName, label } = this.getDocumentConfig(documentType);
    const header = await this.getDocumentHeader(conn, documentType, entityId, true);
    if (!header) {
      throw new Error(`${label} not found`);
    }

    const workflow = header.approval_workflow_id
      ? await this.getWorkflowById(conn, header.approval_workflow_id)
      : await this.getActiveWorkflow(conn, companyId, documentType);

    if (!workflow) {
      return {
        workflowRequired: false,
        header,
      };
    }

    if ((header.approval_status || "draft") !== "pending_approval") {
      throw new Error(`Only submitted ${label.toLowerCase()}s can be approved`);
    }

    const currentStep = workflow.steps.find((step) => step.step_no === (header.approval_current_step_no || 1)) || workflow.steps[0] || null;
    const nextStep = workflow.steps.find((step) => step.step_no === ((header.approval_current_step_no || 1) + 1)) || null;

    await this.recordDecision(conn, {
      workflowId: workflow.id,
      stepId: currentStep?.id || null,
      companyId,
      documentType,
      entityId,
      decisionType: "approved",
      actorUserId,
      comment,
    });

    if (nextStep) {
      await conn.execute(
        `UPDATE ${tableName}
            SET approval_status = 'pending_approval',
                approval_current_step_no = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [nextStep.step_no, entityId]
      );
    } else {
      await conn.execute(
        `UPDATE ${tableName}
            SET approval_status = 'approved',
                approval_current_step_no = NULL,
                status = 'approved',
                approved_by_user_id = ?,
                approved_at = NOW(),
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [actorUserId, entityId]
      );
    }

    return {
      workflowRequired: true,
      completed: !nextStep,
      header: await this.getDocumentHeader(conn, documentType, entityId, false),
    };
  }

  async rejectDocument(conn, { companyId, documentType, entityId, actorUserId, comment = null }) {
    const { tableName, label } = this.getDocumentConfig(documentType);
    const header = await this.getDocumentHeader(conn, documentType, entityId, true);
    if (!header) {
      throw new Error(`${label} not found`);
    }

    const workflow = header.approval_workflow_id
      ? await this.getWorkflowById(conn, header.approval_workflow_id)
      : await this.getActiveWorkflow(conn, companyId, documentType);

    if (!workflow) {
      throw new Error(`No approval workflow is configured for ${label.toLowerCase()}s`);
    }

    if ((header.approval_status || "draft") !== "pending_approval") {
      throw new Error(`Only submitted ${label.toLowerCase()}s can be rejected`);
    }

    const currentStep = workflow.steps.find((step) => step.step_no === (header.approval_current_step_no || 1)) || workflow.steps[0] || null;

    await conn.execute(
      `UPDATE ${tableName}
          SET approval_status = 'rejected',
              approval_current_step_no = NULL,
              rejected_by_user_id = ?,
              rejected_at = NOW(),
              rejection_comment = ?,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [actorUserId, comment || null, entityId]
    );

    await this.recordDecision(conn, {
      workflowId: workflow.id,
      stepId: currentStep?.id || null,
      companyId,
      documentType,
      entityId,
      decisionType: "rejected",
      actorUserId,
      comment,
    });

    return {
      workflowRequired: true,
      header: await this.getDocumentHeader(conn, documentType, entityId, false),
    };
  }

  async assertCanPost(conn, { companyId, documentType, header }) {
    const workflow = header.approval_workflow_id
      ? await this.getWorkflowById(conn, header.approval_workflow_id)
      : await this.getActiveWorkflow(conn, companyId, documentType);

    if (!workflow || !workflow.require_approval_before_post) {
      return;
    }

    if ((header.approval_status || "draft") !== "approved") {
      throw new Error("Document must be approved before posting");
    }
  }
}

module.exports = {
  ApprovalWorkflowService,
};
