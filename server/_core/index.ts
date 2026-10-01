import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { registerAdminRoutes } from "../adminRoutes";
import { registerInvitePage } from "../inviteRoutes";
import { registerAccountRoutes } from "../accountRoutes";
import { seedAdminDemoData } from "../adminDb";
import { startRevalidationJob } from "../revalidationJob";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Enable CORS for all routes - reflect the request origin to support credentials
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );
    res.header("Access-Control-Allow-Credentials", "true");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageProxy(app);
  registerOAuthRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  /*
   * The page an invitation opens.
   *
   * Registered here rather than in the account routes because it is not part of
   * the API: it is an HTML document for a person who may not have the app yet.
   * It sits above the admin dashboard and the SPA so a request for /i/CODE is
   * answered by this and nothing else.
   */
  registerInvitePage(app);

  // Internal admin dashboard: its own API and its own login, kept apart from
  // the consumer app's tRPC surface and phone OTP sign-in.
  registerAdminRoutes(app);

  // Consumer account service: phone sign-in, sessions, notices, and the
  // capability checks that make moderation decisions stick.
  registerAccountRoutes(app);

  // The dashboard is a self-contained static page, deliberately styled as a
  // dense internal tool rather than matching the consumer app's look.
  const adminDir = path.resolve(process.cwd(), "admin");
  app.use("/admin", express.static(adminDir, { extensions: ["html"] }));
  app.get("/admin", (_req, res) => {
    res.sendFile(path.join(adminDir, "index.html"));
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`[api] server listening on port ${port}`);
  });

  // Populate the dashboard's working dataset on first boot. Safe to re-run.
  seedAdminDemoData()
    .then(({ seeded }) => {
      if (seeded) console.log("[admin] seeded the initial dashboard dataset");
    })
    .catch((error) => console.error("[admin] seed failed", error));
  // Keep entitlements honest: re-check receipts on a schedule so a failed
  // renewal drops the member to free without waiting for them to open the app.
  startRevalidationJob();
}

startServer().catch(console.error);
