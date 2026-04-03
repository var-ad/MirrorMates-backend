"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const prisma_1 = require("./prisma");
const seed_1 = require("./seed");
function runPrismaDbPush() {
    return new Promise((resolve, reject) => {
        const schemaPath = path_1.default.join("prisma", "schema.prisma");
        const command = process.platform === "win32"
            ? {
                file: "cmd.exe",
                args: ["/c", "npx", "prisma", "db", "push", "--schema", schemaPath, "--force-reset", "--accept-data-loss"]
            }
            : {
                file: "npx",
                args: ["prisma", "db", "push", "--schema", schemaPath, "--force-reset", "--accept-data-loss"]
            };
        const child = (0, child_process_1.spawn)(command.file, command.args, {
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
async function run() {
    try {
        await runPrismaDbPush();
        await (0, seed_1.seedAdjectives)();
        console.log("Database schema recreated from Prisma and seeded");
    }
    finally {
        await prisma_1.prisma.$disconnect();
    }
}
if (require.main === module) {
    void run();
}
