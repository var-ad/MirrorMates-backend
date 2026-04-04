import { prisma } from "../../../db/prisma";
import { JohariPools } from "../../reports/gemini.service";
import {
  ResultAdjective,
  WindowPayload,
  assertOwner,
  getSession,
  roundToSingleDecimal,
  serializeSession,
  toWords,
} from "./johari.shared";

const WINDOW_META = {
  open: {
    title: "Open Window",
    subtitle: "Known to self and others",
    description: "Traits you selected for yourself and peers also noticed.",
    position: { row: "top", column: "left" },
  },
  blind: {
    title: "Blind Window",
    subtitle: "Not known to self, known to others",
    description: "Traits peers selected that you did not choose for yourself.",
    position: { row: "top", column: "right" },
  },
  hidden: {
    title: "Hidden Window",
    subtitle: "Known to self, not known to others",
    description: "Traits you selected for yourself that peers did not surface.",
    position: { row: "bottom", column: "left" },
  },
  unknown: {
    title: "Unknown Window",
    subtitle: "Not known to self or others",
    description:
      "Traits that did not appear in either self or peer selections this round.",
    position: { row: "bottom", column: "right" },
  },
} as const;

type WindowKey = keyof JohariPools;

function buildWindowPayload(
  key: WindowKey,
  ids: number[],
  adjectiveMap: Map<number, string>,
  selfSet: Set<number>,
  peerSet: Set<number>,
  peerCounts: Record<number, number>,
  peerSubmissionCount: number,
): WindowPayload {
  const adjectives: ResultAdjective[] = ids
    .map((id) => ({
      adjectiveId: id,
      adjective: adjectiveMap.get(id) ?? "unknown",
      peerCount: peerCounts[id] ?? 0,
      peerSupportPercent:
        peerSubmissionCount > 0
          ? roundToSingleDecimal(
              ((peerCounts[id] ?? 0) / peerSubmissionCount) * 100,
            )
          : 0,
      selectedBySelf: selfSet.has(id),
      selectedByPeers: peerSet.has(id),
    }))
    .sort(
      (a, b) =>
        b.peerCount - a.peerCount || a.adjective.localeCompare(b.adjective),
    );

  return {
    key,
    title: WINDOW_META[key].title,
    subtitle: WINDOW_META[key].subtitle,
    description: WINDOW_META[key].description,
    position: WINDOW_META[key].position,
    count: adjectives.length,
    adjectives,
  };
}

export async function computeResults(sessionId: string, requesterId: string) {
  const session = await getSession(sessionId);
  assertOwner(requesterId, session.ownerUserId);

  const [adjectives, selfRows, peerRows] = await Promise.all([
    prisma.adjectiveMaster.findMany({
      select: {
        id: true,
        word: true,
      },
      orderBy: {
        id: "asc",
      },
    }),
    prisma.selfSelection.findMany({
      where: {
        sessionId,
        userId: requesterId,
      },
      select: {
        adjectiveId: true,
      },
    }),
    prisma.peerSubmission.findMany({
      where: {
        sessionId,
      },
      select: {
        adjectiveIds: true,
      },
    }),
  ]);

  const adjectiveMap = new Map(adjectives.map((row) => [row.id, row.word]));
  const allIds = adjectives.map((row) => row.id);
  const selfSet = new Set(selfRows.map((row) => row.adjectiveId));
  const peerCounts: Record<number, number> = {};
  const peerSet = new Set<number>();

  for (const row of peerRows) {
    for (const adjectiveId of row.adjectiveIds ?? []) {
      peerSet.add(adjectiveId);
      peerCounts[adjectiveId] = (peerCounts[adjectiveId] ?? 0) + 1;
    }
  }

  const openIds = allIds.filter((id) => selfSet.has(id) && peerSet.has(id));
  const blindIds = allIds.filter((id) => !selfSet.has(id) && peerSet.has(id));
  const hiddenIds = allIds.filter((id) => selfSet.has(id) && !peerSet.has(id));
  const unknownIds = allIds.filter(
    (id) => !selfSet.has(id) && !peerSet.has(id),
  );

  const peerCountsJson = Object.fromEntries(
    Object.entries(peerCounts).map(([adjectiveId, count]) => [
      adjectiveId,
      count,
    ]),
  );

  await prisma.computedResult.upsert({
    where: {
      sessionId,
    },
    create: {
      sessionId,
      openIds,
      blindIds,
      hiddenIds,
      unknownIds,
      peerCounts: peerCountsJson,
      computedAt: new Date(),
    },
    update: {
      openIds,
      blindIds,
      hiddenIds,
      unknownIds,
      peerCounts: peerCountsJson,
      computedAt: new Date(),
    },
  });

  const peerSubmissionCount = peerRows.length;

  const openWindow = buildWindowPayload(
    "open",
    openIds,
    adjectiveMap,
    selfSet,
    peerSet,
    peerCounts,
    peerSubmissionCount,
  );
  const blindWindow = buildWindowPayload(
    "blind",
    blindIds,
    adjectiveMap,
    selfSet,
    peerSet,
    peerCounts,
    peerSubmissionCount,
  );
  const hiddenWindow = buildWindowPayload(
    "hidden",
    hiddenIds,
    adjectiveMap,
    selfSet,
    peerSet,
    peerCounts,
    peerSubmissionCount,
  );
  const unknownWindow = buildWindowPayload(
    "unknown",
    unknownIds,
    adjectiveMap,
    selfSet,
    peerSet,
    peerCounts,
    peerSubmissionCount,
  );

  const windows = [openWindow, blindWindow, hiddenWindow, unknownWindow];
  const counts = Object.entries(peerCounts)
    .map(([adjectiveId, count]) => {
      const id = Number(adjectiveId);
      return {
        adjectiveId: id,
        adjective: adjectiveMap.get(id) ?? "unknown",
        count,
        peerSupportPercent:
          peerSubmissionCount > 0
            ? roundToSingleDecimal((count / peerSubmissionCount) * 100)
            : 0,
      };
    })
    .sort(
      (a, b) => b.count - a.count || a.adjective.localeCompare(b.adjective),
    );

  const pools: JohariPools = {
    open: toWords(openWindow.adjectives),
    blind: toWords(blindWindow.adjectives),
    hidden: toWords(hiddenWindow.adjectives),
    unknown: toWords(unknownWindow.adjectives),
  };

  return {
    session: await serializeSession(session, { peerSubmissionCount }),
    sessionId,
    matrixAxes: {
      horizontal: {
        left: "Known to self",
        right: "Not known to self",
      },
      vertical: {
        top: "Known to others",
        bottom: "Not known to others",
      },
    },
    summary: {
      selfSelectedCount: selfSet.size,
      peerSubmissionCount,
      peerSelectedUniqueCount: peerSet.size,
      topPeerAdjectives: counts.slice(0, 8),
    },
    pools,
    windows,
    peerCounts: counts,
  };
}
