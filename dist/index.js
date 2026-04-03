"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const env_1 = require("./config/env");
const mongo_1 = require("./db/mongo");
const prisma_1 = require("./db/prisma");
async function start() {
    try {
        await prisma_1.prisma.$connect();
        await (0, mongo_1.connectMongo)();
        app_1.app.listen(env_1.env.PORT, () => {
            console.log(`Backend listening on port ${env_1.env.PORT}`);
        });
    }
    catch (error) {
        console.error("Failed to start server", error);
        process.exit(1);
    }
}
void start();
