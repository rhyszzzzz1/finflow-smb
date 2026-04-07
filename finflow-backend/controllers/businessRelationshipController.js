"use strict";

class BusinessRelationshipController {
  constructor(businessRelationshipService) {
    this.businessRelationshipService = businessRelationshipService;
  }

  list = async (req, res) => {
    const rows = await this.businessRelationshipService.listRelationships(req.user.id, {
      status: req.query.status || null,
      onlyActive: String(req.query.only_active || "false").toLowerCase() === "true",
    });
    return res.json(rows);
  };

  listActive = async (req, res) => {
    const rows = await this.businessRelationshipService.listRelationships(req.user.id, {
      onlyActive: true,
    });
    return res.json(rows);
  };

  invite = async (req, res) => {
    const relationship = await this.businessRelationshipService.inviteRelationship(req.user.id, req.body || {});
    return res.status(201).json(relationship);
  };

  accept = async (req, res) => {
    const relationship = await this.businessRelationshipService.acceptRelationship(req.user.id, req.params.id);
    return res.json(relationship);
  };
}

module.exports = {
  BusinessRelationshipController,
};
