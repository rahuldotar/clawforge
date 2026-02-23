/**
 * Skill submission and review routes.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin, requireOrg } from "../middleware/auth.js";
import { SkillReviewService } from "../services/skill-review-service.js";
import { logAdminAction } from "../services/admin-audit.js";

const SubmitSkillBodySchema = z.object({
  skillName: z.string().min(1),
  skillKey: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  manifestContent: z.string().optional(),
  scanResults: z
    .object({
      scannedFiles: z.number(),
      critical: z.number(),
      warn: z.number(),
      info: z.number(),
      findings: z.array(
        z.object({
          ruleId: z.string(),
          severity: z.string(),
          file: z.string(),
          line: z.number(),
          message: z.string(),
          evidence: z.string(),
        }),
      ),
    })
    .optional(),
});

const ReviewBodySchema = z.object({
  status: z.enum(["approved-org", "approved-self", "rejected"]),
  reviewNotes: z.string().optional(),
  approvedForUser: z.string().uuid().optional(),
});

export async function skillRoutes(app: FastifyInstance): Promise<void> {
  const skillService = new SkillReviewService(app.db);

  /**
   * POST /api/v1/skills/:orgId/submit
   * Submit a skill for review.
   */
  app.post<{ Params: { orgId: string } }>(
    "/api/v1/skills/:orgId/submit",
    async (request, reply) => {
      const { orgId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const parseResult = SubmitSkillBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: "Invalid request body",
          details: parseResult.error.issues,
        });
      }

      const submission = await skillService.submitSkill({
        orgId,
        submittedBy: request.authUser!.userId,
        ...parseResult.data,
      });

      return reply.code(201).send(submission);
    },
  );

  /**
   * GET /api/v1/skills/:orgId/review
   * List pending skill submissions (admin only).
   */
  app.get<{ Params: { orgId: string } }>(
    "/api/v1/skills/:orgId/review",
    async (request, reply) => {
      requireAdmin(request, reply);
      if (reply.sent) return;
      const { orgId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const pending = await skillService.listPending(orgId);
      return reply.send({ submissions: pending });
    },
  );

  /**
   * PUT /api/v1/skills/:orgId/review/:id
   * Approve or reject a skill submission (admin only).
   */
  app.put<{ Params: { orgId: string; id: string } }>(
    "/api/v1/skills/:orgId/review/:id",
    async (request, reply) => {
      requireAdmin(request, reply);
      if (reply.sent) return;
      const { orgId, id } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const parseResult = ReviewBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: "Invalid request body",
          details: parseResult.error.issues,
        });
      }

      const updated = await skillService.reviewSubmission({
        id,
        reviewedBy: request.authUser!.userId,
        ...parseResult.data,
      });

      if (!updated) {
        return reply.code(404).send({ error: "Submission not found" });
      }

      logAdminAction(app.db, {
        orgId,
        userId: request.authUser!.userId,
        action: `skill_${parseResult.data.status.replace("-", "_")}`,
        resourceType: "skill_submission",
        resourceId: id,
        details: { skillName: updated.skillName, reviewNotes: parseResult.data.reviewNotes },
      }).catch(() => {});

      return reply.send(updated);
    },
  );

  /**
   * GET /api/v1/skills/:orgId/approved
   * List approved skills for the org.
   */
  app.get<{ Params: { orgId: string } }>(
    "/api/v1/skills/:orgId/approved",
    async (request, reply) => {
      const { orgId } = request.params;
      requireOrg(request, reply, orgId);
      if (reply.sent) return;

      const approved = await skillService.listApproved(orgId);
      return reply.send({ skills: approved });
    },
  );
}
