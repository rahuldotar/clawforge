/**
 * Audit routes – event ingestion and querying.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin, requireOrg } from "../middleware/auth.js";
import { AuditService } from "../services/audit-service.js";

const MAX_BATCH_SIZE = 500;

const IngestBodySchema = z.object({
  events: z
    .array(
      z.object({
        userId: z.string(),
        orgId: z.string(),
        eventType: z.string(),
        toolName: z.string().optional(),
        outcome: z.string(),
        agentId: z.string().optional(),
        sessionKey: z.string().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
        timestamp: z.number(),
      }),
    )
    .max(MAX_BATCH_SIZE, {
      message: `Batch size exceeds maximum of ${MAX_BATCH_SIZE} events`,
    }),
});

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  const auditService = new AuditService(app.db);

  /**
   * POST /api/v1/audit/:orgId/events
   * Ingest audit events from authenticated clients.
   */
  app.post<{ Params: { orgId: string } }>(
    "/api/v1/audit/:orgId/events",
    async (request, reply) => {
      const { orgId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const parseResult = IngestBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: "Invalid request body",
          details: parseResult.error.issues,
        });
      }

      const authUser = request.authUser!;
      const events = parseResult.data.events;

      // Validate all events reference the correct org.
      const invalidOrg = events.find((e) => e.orgId !== orgId);
      if (invalidOrg) {
        return reply.code(400).send({
          error: "Event orgId mismatch: all events must belong to the route orgId",
        });
      }

      // Non-admin users can only submit events for themselves.
      if (authUser.role !== "admin") {
        const invalidUser = events.find((e) => e.userId !== authUser.userId);
        if (invalidUser) {
          return reply.code(403).send({
            error: "Non-admin users can only submit audit events for their own userId",
          });
        }
      }

      await auditService.ingestEvents(events);
      return reply.code(201).send({ ingested: events.length });
    },
  );

  /**
   * GET /api/v1/audit/:orgId/query
   * Query audit logs (admin only).
   */
  app.get<{
    Params: { orgId: string };
    Querystring: {
      userId?: string;
      eventType?: string;
      toolName?: string;
      outcome?: string;
      from?: string;
      to?: string;
      limit?: string;
      offset?: string;
    };
  }>("/api/v1/audit/:orgId/query", async (request, reply) => {
    requireAdmin(request, reply);
    if (reply.sent) return;
    const { orgId } = request.params;
    requireOrg(request, reply, orgId);
    if (reply.sent) return;

    const query = request.query;
    const events = await auditService.queryEvents({
      orgId,
      userId: query.userId,
      eventType: query.eventType,
      toolName: query.toolName,
      outcome: query.outcome,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
      offset: query.offset ? parseInt(query.offset, 10) : undefined,
    });

    return reply.send({ events });
  });
}
