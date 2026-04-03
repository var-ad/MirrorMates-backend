import { app } from "./app";
import { env } from "./config/env";
import { connectMongo } from "./db/mongo";
import { prisma } from "./db/prisma";

async function start(): Promise<void> {
  try {
    await prisma.$connect();
    await connectMongo();

    app.listen(env.PORT, () => {
      console.log(`Backend listening on port ${env.PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server", error);
    process.exit(1);
  }
}

void start();
