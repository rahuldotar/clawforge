/**
 * Heartbeat routes – client health check and kill switch status.
 */

import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { requireOrg } from "../middleware/auth.js";
import { clientHeartbeats, policies } from "../db/schema.js";

export async function heartbeatRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/v1/heartbeat/:orgId/:userId
   * Client heartbeat – returns kill switch status and policy version.
   * Accepts optional ?policyVersion=N to enable smart refresh detection.
   */
  app.get<{
    Params: { orgId: string; userId: string };
    Querystring: { policyVersion?: string; clientVersion?: string };
  }>(
    "/api/v1/heartbeat/:orgId/:userId",
    async (request, reply) => {
      const { orgId, userId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const db = app.db;
      const clientVersionParam = request.query.clientVersion;

      // Upsert heartbeat record.
      await db
        .insert(clientHeartbeats)
        .values({
          orgId,
          userId,
          lastHeartbeatAt: new Date(),
          clientVersion: clientVersionParam ?? null,
        })
        .onConflictDoUpdate({
          target: [clientHeartbeats.orgId, clientHeartbeats.userId],
          set: {
            lastHeartbeatAt: new Date(),
            clientVersion: clientVersionParam ?? undefined,
          },
        });

      // Fetch current policy for kill switch status.
      const [policy] = await db
        .select({
          version: policies.version,
          killSwitch: policies.killSwitch,
          killSwitchMessage: policies.killSwitchMessage,
        })
        .from(policies)
        .where(eq(policies.orgId, orgId))
        .limit(1);

      const serverVersion = policy?.version ?? 0;
      const clientVersion = request.query.policyVersion
        ? parseInt(request.query.policyVersion, 10)
        : null;

      // If client sent its version and it differs from server, tell it to refresh.
      const refreshPolicyNow =
        clientVersion !== null && !isNaN(clientVersion) && clientVersion !== serverVersion;

      return reply.send({
        policyVersion: serverVersion,
        killSwitch: policy?.killSwitch ?? false,
        killSwitchMessage: policy?.killSwitchMessage ?? undefined,
        refreshPolicyNow,
      });
    },
  );
}
