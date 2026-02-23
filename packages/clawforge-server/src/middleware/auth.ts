/**
 * JWT authentication and RBAC middleware for ClawForge control plane.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

export type AuthUser = {
  userId: string;
  orgId: string;
  email: string;
  role: "admin" | "user";
};

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthUser;
  }
}

/**
 * Register JWT-based auth middleware.
 */
export async function registerAuthMiddleware(app: FastifyInstance): Promise<void> {
  app.decorateRequest("authUser", undefined);

  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for public endpoints.
    if (
      request.url === "/api/v1/auth/exchange" ||
      request.url === "/api/v1/auth/login" ||
      request.url === "/api/v1/auth/mode" ||
      request.url === "/api/v1/auth/enroll" ||
      request.url === "/health"
    ) {
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      reply.code(401).send({ error: "Missing or invalid Authorization header" });
      return;
    }

    const token = authHeader.slice(7);
    try {
      const decoded = app.jwt.verify<AuthUser>(token);
      request.authUser = decoded;
    } catch {
      reply.code(401).send({ error: "Invalid or expired token" });
    }
  });
}

/**
 * Guard: require admin role.
 */
export function requireAdmin(request: FastifyRequest, reply: FastifyReply): void {
  if (!request.authUser) {
    reply.code(401).send({ error: "Authentication required" });
    return;
  }
  if (request.authUser.role !== "admin") {
    reply.code(403).send({ error: "Admin access required" });
    return;
  }
}

/**
 * Guard: require same org.
 */
export function requireOrg(request: FastifyRequest, reply: FastifyReply, orgId: string): void {
  if (!request.authUser) {
    reply.code(401).send({ error: "Authentication required" });
    return;
  }
  if (request.authUser.orgId !== orgId) {
    reply.code(403).send({ error: "Access denied: organization mismatch" });
    return;
  }
}
