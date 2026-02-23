/**
 * ClawForge control plane server entry point.
 */

import { createServer } from "./server.js";

const PORT = parseInt(process.env.PORT ?? "4100", 10);
const HOST = process.env.HOST ?? "0.0.0.0";
const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://localhost:5432/clawforge";
const JWT_SECRET = process.env.JWT_SECRET ?? "clawforge-dev-secret-change-in-production";
const CORS_ORIGIN = process.env.CORS_ORIGIN;

async function main() {
  const app = await createServer({
    port: PORT,
    host: HOST,
    databaseUrl: DATABASE_URL,
    jwtSecret: JWT_SECRET,
    corsOrigin: CORS_ORIGIN?.split(",").map((s) => s.trim()),
  });

  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`ClawForge control plane running on ${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
