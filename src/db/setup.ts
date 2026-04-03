import { spawn } from "child_process";
import path from "path";
import { prisma } from "./prisma";
import { seedAdjectives } from "./seed";

function runPrismaDbPush(): Promise<void> {
  return new Promise((resolve, reject) => {
    const schemaPath = path.join("prisma", "schema.prisma");
    const command =
      process.platform === "win32"
        ? {
            file: "cmd.exe",
            args: ["/c", "npx", "prisma", "db", "push", "--schema", schemaPath, "--force-reset", "--accept-data-loss"]
          }
        : {
            file: "npx",
            args: ["prisma", "db", "push", "--schema", schemaPath, "--force-reset", "--accept-data-loss"]
          };
    const child = spawn(command.file, command.args, {
      cwd: process.cwd(),
      stdio: "inherit"
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Prisma db push failed with exit code ${code ?? "unknown"}`));
    });

    child.on("error", reject);
  });
}

async function run(): Promise<void> {
  try {
    await runPrismaDbPush();
    await seedAdjectives();

    console.log("Database schema recreated from Prisma and seeded");
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void run();
}
