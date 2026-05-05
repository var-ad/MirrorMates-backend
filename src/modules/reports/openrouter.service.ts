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

interface OpenRouterChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

function buildPrompt(input: JohariReportInput): string {
  const { pools, peerSubmissionCount, topPeerAdjectives } = input;
  const topPeerSummary =
    topPeerAdjectives.length > 0
      ? topPeerAdjectives
          .map(
            (item) =>
              `${item.adjective} (${item.count}/${peerSubmissionCount}, ${item.peerSupportPercent}%)`,
          )
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
    `Unknown: ${pools.unknown.join(", ") || "None"}`,
  ].join("\n");
}

function extractMessageContent(response: OpenRouterChatCompletionResponse) {
  const content = response.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (part.type === "text" ? part.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  return "";
}

export async function generateOpenRouterJohariReport(
  input: JohariReportInput,
): Promise<{ prompt: string; reportText: string }> {
  const prompt = buildPrompt(input);

  if (!env.OPENROUTER_API_KEY) {
    return {
      prompt,
      reportText:
        "OpenRouter API key is not configured. This is a placeholder report. Add OPENROUTER_API_KEY in backend .env to enable AI-generated insights.",
    };
  }

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": env.FRONTEND_URL,
          "X-Title": "MirrorMates",
        },
        body: JSON.stringify({
          model: env.OPENROUTER_MODEL,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.7,
        }),
      },
    );
    const payload = (await response.json()) as OpenRouterChatCompletionResponse;

    if (!response.ok) {
      throw new Error(
        payload.error?.message ?? `OpenRouter request failed (${response.status})`,
      );
    }

    const reportText = extractMessageContent(payload);

    if (!reportText) {
      throw new Error("OpenRouter response did not include report text");
    }

    return {
      prompt,
      reportText,
    };
  } catch (error) {
    console.error("OpenRouter chat completion failed", error);
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
