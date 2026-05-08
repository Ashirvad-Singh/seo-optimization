import cors from "cors";
import dotenv from "dotenv";
import express from "express";

import { analyzeBusinessProfile } from "./services/gemini.js";
import { researchCompetitorPatterns, scrapeWebsiteInsights } from "./services/scraper.js";
import { buildAuditInput, validateAuditRequest } from "./utils/validation.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3001);

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
  }),
);
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    message: "API is running",
  });
});

app.post("/api/audit", async (req, res) => {
  try {
    const validation = validateAuditRequest(req.body);

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: validation.message,
      });
    }

    const { manualData } = req.body;
    const businessData = buildAuditInput(manualData);
    const context = {
      name: businessData.name,
      category: businessData.category,
      city: businessData.city,
      website: businessData.website,
    };
    const [websiteResult, competitorResearch] = await Promise.all([
      scrapeWebsiteInsights(businessData.website, context),
      researchCompetitorPatterns(context),
    ]);
    const localSeoSignals = {
      websiteProvided: Boolean(businessData.website),
      cityMentionedOnWebsite: websiteResult.websiteInsights?.contentSignals?.some((item) =>
        item.includes(`"${businessData.city}" appears`),
      ),
      categoryMentionedOnWebsite: websiteResult.websiteInsights?.contentSignals?.some((item) =>
        item.includes(`"${businessData.category}" appears`),
      ),
      detectedServiceCount: websiteResult.websiteInsights?.services?.length || 0,
      competitorResultCount: competitorResearch.topResults.length,
      competitorTerms: competitorResearch.commonTerms,
    };

    const audit = await analyzeBusinessProfile({
      business: businessData,
      website_insights: websiteResult.websiteInsights,
      competitor_research: competitorResearch,
      local_seo_signals: localSeoSignals,
    });

    return res.json({
      success: true,
      data: {
        source: "manual",
        businessData,
        websiteInsights: websiteResult.websiteInsights,
        competitorResearch,
        localSeoSignals,
        scrapeMeta: {
          website: businessData.website,
          warnings: [...websiteResult.warnings, ...competitorResearch.warnings],
          fetchedAt: new Date().toISOString(),
        },
        audit,
      },
    });
  } catch (error) {
    const isGeminiError = error?.name === "GeminiApiError";

    return res.status(isGeminiError ? 502 : 500).json({
      success: false,
      error: error?.message || "Unexpected server error",
      errorCode: error?.code || "INTERNAL_SERVER_ERROR",
    });
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({
    success: false,
    error: "Unexpected server error",
  });
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
