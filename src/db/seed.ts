import { JOHARI_ADJECTIVES } from "../modules/games/johari/johari.adjectives";
import { prisma } from "./prisma";

export async function seedAdjectives(): Promise<void> {
  await prisma.adjectiveMaster.createMany({
    data: JOHARI_ADJECTIVES.map((word) => ({ word })),
    skipDuplicates: true
  });
}

export async function runSeed(): Promise<void> {
  try {
    await seedAdjectives();
    console.log("Seed complete");
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void runSeed();
}
