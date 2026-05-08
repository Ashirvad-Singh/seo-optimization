const DEFAULT_MODEL = "gemini-2.5-flash";
const GEMINI_MODEL = process.env.GEMINI_MODEL || DEFAULT_MODEL;

class GeminiApiError extends Error {
  constructor(message, code = "GEMINI_ERROR") {
    super(message);
    this.name = "GeminiApiError";
    this.code = code;
  }
}

function buildPrompt(payload) {
  return `
You are a senior local SEO strategist.
Your job is to generate a practical local SEO audit from minimal business input plus public scraping data.
Respond with valid JSON only.

Business input and research:
${JSON.stringify(payload, null, 2)}

Return this exact JSON shape:
{
  "seo_score": number,
  "issues": ["string"],
  "missing_elements": ["string"],
  "keyword_suggestions": ["string"],
  "competitor_insights": "string",
  "optimized_description": "string",
  "review_strategy": ["string"],
  "action_plan": ["string"]
}

Rules:
- Keep seo_score between 0 and 100.
- Use the business name, category, city, website insights, and competitor research provided.
- Do not ask the user for more fields.
- If website data is missing, still provide strong city + category recommendations.
- Keyword suggestions should be specific local search phrases.
- competitor_insights should summarize what similar businesses in the same category + city appear to emphasize.
- review_strategy should explain how to attract better local reviews naturally.
- action_plan should be a practical sequence to beat local competitors.
- optimized_description should be concise, locally relevant, and conversion-friendly.
- Respond with raw JSON and no markdown.
`.trim();
}

function stripCodeFences(value) {
  return value.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
}

function normalizeAuditResponse(parsed) {
  return {
    seo_score:
      typeof parsed?.seo_score === "number"
        ? Math.max(0, Math.min(100, Math.round(parsed.seo_score)))
        : 0,
    issues: Array.isArray(parsed?.issues) ? parsed.issues.filter(Boolean) : [],
    missing_elements: Array.isArray(parsed?.missing_elements)
      ? parsed.missing_elements.filter(Boolean)
      : [],
    keyword_suggestions: Array.isArray(parsed?.keyword_suggestions)
      ? parsed.keyword_suggestions.filter(Boolean)
      : [],
    competitor_insights:
      typeof parsed?.competitor_insights === "string"
        ? parsed.competitor_insights.trim()
        : "",
    optimized_description:
      typeof parsed?.optimized_description === "string"
        ? parsed.optimized_description.trim()
        : "",
    review_strategy: Array.isArray(parsed?.review_strategy)
      ? parsed.review_strategy.filter(Boolean)
      : [],
    action_plan: Array.isArray(parsed?.action_plan) ? parsed.action_plan.filter(Boolean) : [],
  };
}

function sleep(delay) {
  return new Promise((resolve) => {
    setTimeout(resolve, delay);
  });
}

async function requestGemini(model, payload) {
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: buildPrompt(payload),
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: "application/json",
        },
      }),
    },
  ).catch(() => {
    throw new GeminiApiError("Unable to reach Gemini API.", "GEMINI_NETWORK_ERROR");
  });
}

function buildGeminiError(status, payload, model) {
  const message = payload?.error?.message || "Gemini API request failed.";
  const statusText = payload?.error?.status || "";

  if (status === 404) {
    return new GeminiApiError(
      `The Gemini model "${model}" is not available for this API key or project. Set GEMINI_MODEL to a supported model such as "${DEFAULT_MODEL}".`,
      "GEMINI_MODEL_NOT_FOUND",
    );
  }

  if (status === 429 || statusText === "RESOURCE_EXHAUSTED") {
    return new GeminiApiError(
      `Gemini API quota has been exceeded for project "${process.env.GOOGLE_CLOUD_PROJECT || "current project"}". In Google AI Studio, use an API key from the same project that has quota for "${model}", or wait for quota reset.`,
      "GEMINI_QUOTA_EXCEEDED",
    );
  }

  if (status === 503) {
    return new GeminiApiError(
      "Gemini is temporarily under high demand. Please retry in a moment.",
      "GEMINI_TEMPORARILY_UNAVAILABLE",
    );
  }

  if (status === 400) {
    return new GeminiApiError(
      `Gemini API rejected the request: ${message}`,
      "GEMINI_BAD_REQUEST",
    );
  }

  if (status === 401 || status === 403) {
    return new GeminiApiError(
      "Gemini API key is invalid or does not have access to the selected model.",
      "GEMINI_AUTH_ERROR",
    );
  }

  return new GeminiApiError(
    `Gemini API request failed: ${status} ${message}`,
    "GEMINI_API_ERROR",
  );
}

export async function analyzeBusinessProfile(payload) {
  if (!process.env.GEMINI_API_KEY) {
    throw new GeminiApiError(
      "Missing GEMINI_API_KEY environment variable.",
      "GEMINI_MISSING_KEY",
    );
  }

  let response = await requestGemini(GEMINI_MODEL, payload);

  if (!response.ok && response.status === 404 && GEMINI_MODEL !== DEFAULT_MODEL) {
    response = await requestGemini(DEFAULT_MODEL, payload);
  }

  if (!response.ok && response.status === 503) {
    await sleep(1200);
    response = await requestGemini(GEMINI_MODEL, payload);
  }

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null);
    throw buildGeminiError(response.status, errorPayload, GEMINI_MODEL);
  }

  const responsePayload = await response.json();
  const text =
    responsePayload?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim() || "";

  if (!text) {
    throw new GeminiApiError("Gemini API returned an empty response.", "GEMINI_EMPTY_RESPONSE");
  }

  try {
    return normalizeAuditResponse(JSON.parse(stripCodeFences(text)));
  } catch {
    throw new GeminiApiError("Gemini API returned invalid JSON.", "GEMINI_INVALID_JSON");
  }
}

export { GeminiApiError };
