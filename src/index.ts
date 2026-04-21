import { app } from "./app";
import { env } from "./config/env";
import { connectMongo, disconnectMongo } from "./db/mongo";
import { prisma } from "./db/prisma";
import { startInviteExpiryEmailScheduler } from "./modules/games/johari/johari.expiry-notifier";

async function start(): Promise<void> {
  try {
    await prisma.$connect();
    await connectMongo();

    const server = app.listen(env.PORT, () => {
      console.log(`Backend listening on port ${env.PORT}`);
    });
    const stopInviteExpiryEmailScheduler = startInviteExpiryEmailScheduler();

    let isShuttingDown = false;

    const shutdown = (signal: string) => {
      if (isShuttingDown) {
        return;
      }
      isShuttingDown = true;

      console.log(`${signal} received, closing server`);
      stopInviteExpiryEmailScheduler();
      server.close(() => {
        void (async () => {
          try {
            await prisma.$disconnect();
            await disconnectMongo();
          } catch (closeError) {
            console.error("Error while closing database connections", closeError);
          } finally {
            process.exit(0);
          }
        })();
      });

      setTimeout(() => {
        console.error("Shutdown timed out, forcing exit");
        process.exit(1);
      }, 10_000).unref();
    };

    process.once("SIGTERM", () => shutdown("SIGTERM"));
    process.once("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    console.error("Failed to start server", error);
    process.exit(1);
  }
}

void start();
