"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedAdjectives = seedAdjectives;
exports.runSeed = runSeed;
const johari_adjectives_1 = require("../modules/games/johari/johari.adjectives");
const prisma_1 = require("./prisma");
async function seedAdjectives() {
    await prisma_1.prisma.adjectiveMaster.createMany({
        data: johari_adjectives_1.JOHARI_ADJECTIVES.map((word) => ({ word })),
        skipDuplicates: true
    });
}
async function runSeed() {
    try {
        await seedAdjectives();
        console.log("Seed complete");
    }
    finally {
        await prisma_1.prisma.$disconnect();
    }
}
if (require.main === module) {
    void runSeed();
}
