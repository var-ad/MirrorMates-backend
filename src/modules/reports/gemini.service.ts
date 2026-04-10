import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../../config/env";

export interface JohariPools {
  open: string[];
  blind: string[];
  hidden: string[];
  unknown: string[];
}

interface JohariReportInput {
  pools: JohariPools;
  peerSubmissionCount: number;
  topPeerAdjectives: Array<{
    adjective: string;
    count: number;
    peerSupportPercent: number;
  }>;
}

function buildPrompt(input: JohariReportInput): string {
  const { pools, peerSubmissionCount, topPeerAdjectives } = input;
  const topPeerSummary =
    topPeerAdjectives.length > 0
      ? topPeerAdjectives
          .map((item) => `${item.adjective} (${item.count}/${peerSubmissionCount}, ${item.peerSupportPercent}%)`)
          .join(", ")
      : "None";

  return [
    "You are writing neutral feedback for a Johari Window reflection exercise.",
    "Rules:",
    "1) Keep a neutral, calm, professional tone.",
    "2) Avoid diagnoses, moral judgments, or extreme assumptions.",
    "3) Use only evidence from the adjective pools and peer counts.",
    "4) Acknowledge limited data when peer submissions are low.",
    "5) Keep recommendations practical, specific, and non-alarmist.",
    "Required sections:",
    "Summary",
    "Strengths (based on Open + Blind)",
    "Growth Opportunities (Blind)",
    "Private Traits (Hidden)",
    "Potential Untapped Traits (Unknown)",
    "Actionable Advice",
    "Data:",
    `Peer submissions: ${peerSubmissionCount}`,
    `Top peer-selected adjectives: ${topPeerSummary}`,
    `Open: ${pools.open.join(", ") || "None"}`,
    `Blind: ${pools.blind.join(", ") || "None"}`,
    `Hidden: ${pools.hidden.join(", ") || "None"}`,
    `Unknown: ${pools.unknown.join(", ") || "None"}`
  ].join("\n");
}

export async function generateGeminiJohariReport(input: JohariReportInput): Promise<{ prompt: string; reportText: string }> {
  const prompt = buildPrompt(input);

  if (!env.GEMINI_API_KEY) {
    return {
      prompt,
      reportText:
        "Gemini API key is not configured. This is a placeholder report. Add GEMINI_API_KEY in backend .env to enable AI-generated insights."
    };
  }

  const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: env.GEMINI_MODEL });

  try {
    const response = await model.generateContent(prompt);
    const reportText = response.response.text();
    return {
      prompt,
      reportText,
    };
  } catch (error) {
    console.error("Gemini generateContent failed", error);
    const detail =
      env.NODE_ENV === "production"
        ? "Please try again in a few minutes."
        : error instanceof Error
          ? error.message
          : "Unknown error";
    return {
      prompt,
      reportText: `Could not generate AI insights right now (${detail})`,
    };
  }
}
