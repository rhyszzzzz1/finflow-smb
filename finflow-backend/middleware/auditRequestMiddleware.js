"use strict";

const { AuditService } = require("../services/auditService");

function inferActionType(req) {
  const path = req.path || "";
  if (path.endsWith("/login")) return "login_attempt";
  if (path.includes("/export") || req.query?.export || req.query?.format) return "export";
  if (req.method === "DELETE") return "delete_attempt";
  if (path.endsWith("/approve")) return "approve_attempt";
  if (path.endsWith("/post")) return "post_attempt";
  if (path.endsWith("/reverse")) return "reverse_attempt";
  if (path.endsWith("/void")) return "void_attempt";
  if (["POST", "PUT", "PATCH"].includes(req.method)) return "mutation_request";
  return "request";
}

function shouldAuditRequest(req) {
  if (!req.path.startsWith("/api")) return false;
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return true;
  if (req.path.includes("/export") || req.query?.export || req.query?.format) return true;
  return false;
}

function createAuditRequestMiddleware(auditService, options = {}) {
  const resolveActorUserId = options.resolveActorUserId || (() => null);

  return (req, res, next) => {
    req.requestMeta = AuditService.createRequestMeta(req);
    if (!auditService || !shouldAuditRequest(req)) {
      return next();
    }

    res.on("finish", () => {
      const actorUserId = req.user?.id || resolveActorUserId(req) || null;
      auditService.logAction({
        actorUserId,
        companyId: actorUserId,
        entityType: "http_request",
        actionType: inferActionType(req),
        reason: `${req.method} ${req.originalUrl}`,
        ipAddress: req.requestMeta.ipAddress,
        userAgent: req.requestMeta.userAgent,
        route: req.requestMeta.route,
        method: req.requestMeta.method,
        statusCode: res.statusCode,
        requestBody: req.requestMeta.requestBody,
        newValues: {
          statusCode: res.statusCode,
        },
      }).catch(() => {});
    });

    next();
  };
}

module.exports = {
  createAuditRequestMiddleware,
};
