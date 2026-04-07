"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { BusinessRelationshipService } = require("../services/businessRelationshipService");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, " ").trim();
}

function createPool(initialState = {}) {
  const state = {
    relationships: clone(initialState.relationships || []),
  };
  let txSnapshot = null;

  const execute = async (sql, params = []) => {
    const q = normalizeSql(sql);

    if (q.startsWith("SELECT * FROM business_relationships WHERE buyer_company_id = ? AND seller_company_id = ? LIMIT 1")) {
      const row = state.relationships.find(
        (relationship) => relationship.buyer_company_id === params[0] && relationship.seller_company_id === params[1]
      );
      return [[row].filter(Boolean)];
    }

    if (q.startsWith("INSERT INTO business_relationships")) {
      state.relationships.push({
        id: params[0],
        company_id: params[1],
        buyer_company_id: params[2],
        seller_company_id: params[3],
        buyer_profile_id: params[4],
        seller_profile_id: params[5],
        relationship_status: q.includes("'accepted'") ? "accepted" : "invited",
        default_payment_terms_days: params[6],
        default_currency: params[7],
        credit_limit: params[8],
        notes: params[9],
        created_by_user_id: params[10],
        responded_by_user_id: q.includes("'accepted'") ? params[10] : null,
        accepted_at: q.includes("'accepted'") ? "2026-04-04 00:00:00" : null,
        created_at: "2026-04-04 00:00:00",
        updated_at: "2026-04-04 00:00:00",
      });
      return [{ affectedRows: 1 }];
    }

    if (q.startsWith("SELECT * FROM business_relationships WHERE id = ? FOR UPDATE")) {
      const row = state.relationships.find((relationship) => relationship.id === params[0]);
      return [[row].filter(Boolean)];
    }

    if (q.startsWith("SELECT * FROM business_relationships WHERE id = ?")) {
      const row = state.relationships.find((relationship) => relationship.id === params[0]);
      return [[row].filter(Boolean)];
    }

    if (q.startsWith("UPDATE business_relationships SET relationship_status = 'accepted'")) {
      const row = state.relationships.find((relationship) => relationship.id === params[1]);
      if (row) {
        row.relationship_status = "accepted";
        row.responded_by_user_id = params[0];
        row.accepted_at = "2026-04-04 01:00:00";
        row.updated_at = "2026-04-04 01:00:00";
      }
      return [{ affectedRows: row ? 1 : 0 }];
    }

    if (q.startsWith("SELECT br.* FROM business_relationships br WHERE (br.buyer_company_id = ? OR br.seller_company_id = ?)")) {
      let rows = state.relationships.filter(
        (relationship) => relationship.buyer_company_id === params[0] || relationship.seller_company_id === params[1]
      );
      if (q.includes("AND br.relationship_status = 'accepted'")) {
        rows = rows.filter((relationship) => relationship.relationship_status === "accepted");
      } else if (q.includes("AND br.relationship_status = ?")) {
        rows = rows.filter((relationship) => relationship.relationship_status === params[2]);
      }
      rows.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
      return [rows];
    }

    throw new Error(`Unhandled SQL in business relationship service test fake: ${q}`);
  };

  const conn = {
    async beginTransaction() {
      txSnapshot = clone(state);
    },
    async commit() {
      txSnapshot = null;
    },
    async rollback() {
      if (txSnapshot) {
        state.relationships = clone(txSnapshot.relationships);
        txSnapshot = null;
      }
    },
    release() {},
    execute,
  };

  return {
    state,
    async getConnection() {
      return conn;
    },
    async execute(sql, params = []) {
      return execute(sql, params);
    },
  };
}

function createService(initialState = {}) {
  const pool = createPool(initialState);
  const service = new BusinessRelationshipService(pool, {
    idFactory: (() => {
      let seq = 0;
      return () => `rel-${++seq}`;
    })(),
  });

  service.resolveCompanyContext = async (_conn, { actorUserId = null, companyId = null, profileId = null } = {}) => {
    const key = companyId || profileId || actorUserId;
    const contexts = {
      "buyer-profile": { company_id: "buyer-company", profile_id: "buyer-profile", display_name: "Buyer Co" },
      "seller-profile": { company_id: "seller-company", profile_id: "seller-profile", display_name: "Seller Co" },
      "viewer-profile": { company_id: "viewer-company", profile_id: "viewer-profile", display_name: "Viewer Co" },
      "buyer-company": { company_id: "buyer-company", profile_id: "buyer-profile", display_name: "Buyer Co" },
      "seller-company": { company_id: "seller-company", profile_id: "seller-profile", display_name: "Seller Co" },
      "viewer-company": { company_id: "viewer-company", profile_id: "viewer-profile", display_name: "Viewer Co" },
    };
    if (!contexts[key]) {
      throw new Error(`Unknown company context: ${key}`);
    }
    return contexts[key];
  };

  return { pool, service };
}

test("creating an invite stores a bilateral buyer/seller relationship", async () => {
  const { pool, service } = createService();

  const relationship = await service.inviteRelationship("seller-profile", {
    actor_role: "seller",
    buyer_profile_id: "buyer-profile",
    default_payment_terms_days: 30,
    credit_limit: 5000,
    notes: "Initial trade link",
  });

  assert.equal(relationship.relationship_status, "invited");
  assert.equal(relationship.buyer_company_id, "buyer-company");
  assert.equal(relationship.seller_company_id, "seller-company");
  assert.equal(relationship.buyer_name, "Buyer Co");
  assert.equal(relationship.seller_name, "Seller Co");
  assert.equal(pool.state.relationships.length, 1);
});

test("accepting a relationship activates it for both businesses", async () => {
  const { pool, service } = createService({
    relationships: [{
      id: "rel-existing",
      company_id: "seller-company",
      buyer_company_id: "buyer-company",
      seller_company_id: "seller-company",
      buyer_profile_id: "buyer-profile",
      seller_profile_id: "seller-profile",
      relationship_status: "invited",
      default_payment_terms_days: 30,
      default_currency: "NPR",
      credit_limit: 1000,
      notes: "Invite pending",
      created_by_user_id: "seller-profile",
      responded_by_user_id: null,
      accepted_at: null,
      created_at: "2026-04-04 00:00:00",
      updated_at: "2026-04-04 00:00:00",
    }],
  });

  const relationship = await service.acceptRelationship("buyer-profile", "rel-existing");

  assert.equal(relationship.relationship_status, "accepted");
  assert.equal(pool.state.relationships[0].relationship_status, "accepted");
  assert.equal(pool.state.relationships[0].responded_by_user_id, "buyer-profile");
});

test("the user who sent the invite cannot accept their own invitation", async () => {
  const { pool, service } = createService({
    relationships: [{
      id: "rel-self-accept",
      company_id: "seller-company",
      buyer_company_id: "buyer-company",
      seller_company_id: "seller-company",
      buyer_profile_id: "buyer-profile",
      seller_profile_id: "seller-profile",
      relationship_status: "invited",
      default_payment_terms_days: 30,
      default_currency: "NPR",
      credit_limit: 1000,
      notes: "Invite pending",
      created_by_user_id: "seller-profile",
      responded_by_user_id: null,
      accepted_at: null,
      created_at: "2026-04-04 00:00:00",
      updated_at: "2026-04-04 00:00:00",
    }],
  });

  await assert.rejects(
    () => service.acceptRelationship("seller-profile", "rel-self-accept"),
    /cannot accept your own invite/i
  );
  assert.equal(pool.state.relationships[0].relationship_status, "invited");
});

test("listing active relationships returns only accepted bilateral links", async () => {
  const { service } = createService({
    relationships: [
      {
        id: "rel-1",
        company_id: "seller-company",
        buyer_company_id: "buyer-company",
        seller_company_id: "seller-company",
        buyer_profile_id: "buyer-profile",
        seller_profile_id: "seller-profile",
        relationship_status: "accepted",
        default_payment_terms_days: 15,
        default_currency: "NPR",
        credit_limit: 3000,
        notes: null,
        created_by_user_id: "seller-profile",
        responded_by_user_id: "buyer-profile",
        accepted_at: "2026-04-04 00:00:00",
        created_at: "2026-04-04 00:00:00",
        updated_at: "2026-04-04 00:00:00",
      },
      {
        id: "rel-2",
        company_id: "seller-company",
        buyer_company_id: "viewer-company",
        seller_company_id: "seller-company",
        buyer_profile_id: "viewer-profile",
        seller_profile_id: "seller-profile",
        relationship_status: "invited",
        default_payment_terms_days: null,
        default_currency: "NPR",
        credit_limit: null,
        notes: null,
        created_by_user_id: "seller-profile",
        responded_by_user_id: null,
        accepted_at: null,
        created_at: "2026-04-04 00:00:00",
        updated_at: "2026-04-04 00:00:00",
      },
    ],
  });

  const rows = await service.listRelationships("seller-profile", { onlyActive: true });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "rel-1");
  assert.equal(rows[0].viewer_role, "seller");
  assert.equal(rows[0].counterparty_company_id, "buyer-company");
});
