import * as cheerio from "cheerio";

const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
};

const STOP_WORDS = new Set([
  "about",
  "after",
  "all",
  "also",
  "and",
  "are",
  "best",
  "business",
  "can",
  "content",
  "create",
  "delhi",
  "for",
  "from",
  "have",
  "high",
  "ideal",
  "in",
  "into",
  "its",
  "local",
  "more",
  "near",
  "new",
  "noida",
  "not",
  "our",
  "out",
  "page",
  "quality",
  "service",
  "services",
  "studio",
  "that",
  "the",
  "their",
  "this",
  "video",
  "with",
  "your",
]);

const BLOCKED_COMPETITOR_DOMAINS = [
  "bing.com",
  "google.com",
  "microsoft.com",
  "youtube.com",
  "instagram.com",
  "facebook.com",
  "linkedin.com",
  "x.com",
  "twitter.com",
  "wordreference.com",
];

function cleanText(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || null;
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function getMetaContent($, selectors) {
  for (const selector of selectors) {
    const content = cleanText($(selector).attr("content"));
    if (content) {
      return content;
    }
  }

  return null;
}

function getTopTexts($, selector, limit = 6, maxLength = 120) {
  return uniqueStrings(
    $(selector)
      .map((_, element) => cleanText($(element).text()))
      .get()
      .filter((item) => item && item.length <= maxLength),
  ).slice(0, limit);
}

function getParagraphs($, limit = 4) {
  return uniqueStrings(
    $("p")
      .map((_, element) => cleanText($(element).text()))
      .get()
      .filter((item) => item && item.length >= 50),
  ).slice(0, limit);
}

function getListItems($, limit = 10) {
  return uniqueStrings(
    $("li")
      .map((_, element) => cleanText($(element).text()))
      .get()
      .filter((item) => item && item.length >= 3 && item.length <= 90),
  ).slice(0, limit);
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function buildKeywordCandidates(texts, context = {}, limit = 12) {
  const excludedTokens = new Set([
    ...tokenize(context.name),
    ...tokenize(context.city),
  ]);
  const scores = new Map();

  for (const text of texts) {
    const tokens = tokenize(text).filter(
      (token) => token.length > 2 && !STOP_WORDS.has(token) && !excludedTokens.has(token),
    );

    for (const token of tokens) {
      scores.set(token, (scores.get(token) || 0) + 1);
    }

    for (let index = 0; index < tokens.length - 1; index += 1) {
      const phrase = `${tokens[index]} ${tokens[index + 1]}`;
      scores.set(phrase, (scores.get(phrase) || 0) + 2);
    }
  }

  return [...scores.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([keyword]) => keyword)
    .filter((keyword) => keyword !== context.category?.toLowerCase())
    .slice(0, limit);
}

function buildServiceCandidates(texts, context = {}) {
  const serviceHints = [
    "recording",
    "mixing",
    "mastering",
    "podcast",
    "production",
    "shoot",
    "studio",
    "service",
    "repair",
    "training",
    "consulting",
    "marketing",
    "clinic",
    "salon",
    "academy",
    "agency",
    "rental",
  ];

  return uniqueStrings(
    texts.filter((item) => {
      const normalized = item.toLowerCase();
      return (
        normalized.includes(context.category?.toLowerCase() || "") ||
        serviceHints.some((hint) => normalized.includes(hint))
      );
    }),
  ).slice(0, 10);
}

function buildContentSignals(pageData, context = {}) {
  const combinedText = [
    pageData.pageTitle,
    pageData.metaDescription,
    ...pageData.h1Headings,
    ...pageData.h2Headings,
    ...pageData.topParagraphs,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const signals = [];

  signals.push(pageData.pageTitle ? "Page title is present." : "Page title is missing.");
  signals.push(
    pageData.metaDescription
      ? "Meta description is present."
      : "Meta description is missing.",
  );
  signals.push(
    pageData.h1Headings.length
      ? `${pageData.h1Headings.length} H1 heading found.`
      : "No H1 heading found.",
  );
  signals.push(
    pageData.h2Headings.length
      ? `${pageData.h2Headings.length} H2 headings found.`
      : "No H2 headings found.",
  );

  if (context.city) {
    signals.push(
      combinedText.includes(context.city.toLowerCase())
        ? `City keyword "${context.city}" appears on the website.`
        : `City keyword "${context.city}" is not clearly visible on the website.`,
    );
  }

  if (context.category) {
    signals.push(
      combinedText.includes(context.category.toLowerCase())
        ? `Primary category "${context.category}" appears on the website.`
        : `Primary category "${context.category}" is not clearly visible on the website.`,
    );
  }

  return signals;
}

function getDomainName(value) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function decodeBingResultUrl(url) {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("bing.com") && parsed.pathname.startsWith("/ck/a")) {
      const encoded = parsed.searchParams.get("u");
      if (!encoded) {
        return url;
      }

      const normalized = (encoded.startsWith("a1") ? encoded.slice(2) : encoded)
        .replace(/-/g, "+")
        .replace(/_/g, "/");
      return Buffer.from(normalized, "base64").toString("utf8");
    }
  } catch {
    return url;
  }

  return url;
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: REQUEST_HEADERS,
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.text();
}

async function scrapeCompetitorPage(url) {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  return {
    url,
    domain: getDomainName(url),
    pageTitle: cleanText($("title").first().text()),
    metaDescription: getMetaContent($, [
      'meta[name="description"]',
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
    ]),
    h1Headings: getTopTexts($, "h1", 2),
    h2Headings: getTopTexts($, "h2", 4),
  };
}

export async function scrapeWebsiteInsights(url, context = {}) {
  if (!url) {
    return {
      websiteInsights: null,
      warnings: ["No website provided, so website scraping was skipped."],
    };
  }

  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    const pageData = {
      pageTitle: cleanText($("title").first().text()),
      metaDescription: getMetaContent($, [
        'meta[name="description"]',
        'meta[property="og:description"]',
        'meta[name="twitter:description"]',
      ]),
      h1Headings: getTopTexts($, "h1", 3),
      h2Headings: getTopTexts($, "h2", 6),
      h3Headings: getTopTexts($, "h3", 8),
      topParagraphs: getParagraphs($, 4),
      listItems: getListItems($, 10),
    };

    const phrasePool = [
      pageData.pageTitle,
      pageData.metaDescription,
      ...pageData.h1Headings,
      ...pageData.h2Headings,
      ...pageData.h3Headings,
      ...pageData.listItems,
      ...pageData.topParagraphs,
    ].filter(Boolean);

    return {
      websiteInsights: {
        pageTitle: pageData.pageTitle,
        metaDescription: pageData.metaDescription,
        h1Headings: pageData.h1Headings,
        h2Headings: pageData.h2Headings,
        services: buildServiceCandidates(
          [...pageData.h1Headings, ...pageData.h2Headings, ...pageData.h3Headings, ...pageData.listItems],
          context,
        ),
        keywords: buildKeywordCandidates(phrasePool, context, 12),
        contentSignals: buildContentSignals(pageData, context),
      },
      warnings:
        !pageData.pageTitle && !pageData.metaDescription
          ? ["Website scraping found very limited SEO metadata."]
          : [],
    };
  } catch {
    return {
      websiteInsights: null,
      warnings: ["Could not reach the business website for scraping."],
    };
  }
}

async function fetchBingSearchResults(query) {
  const response = await fetch(
    `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=10&setlang=en`,
    {
      headers: REQUEST_HEADERS,
      signal: AbortSignal.timeout(12000),
    },
  );

  if (!response.ok) {
    throw new Error(`Search HTTP ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  return $("li.b_algo")
    .map((_, element) => {
      const title = cleanText($(element).find("h2").text());
      const rawUrl = $(element).find("h2 a").attr("href");
      const url = decodeBingResultUrl(rawUrl);
      const snippet = cleanText($(element).find(".b_caption p").text());
      const domain = getDomainName(url);

      if (!title || !url) {
        return null;
      }

      return {
        title,
        url,
        domain,
        snippet,
      };
    })
    .get()
    .filter(Boolean);
}

function isRelevantCompetitorResult(result, context = {}, currentWebsite = "") {
  if (!result?.domain) {
    return false;
  }

  if (BLOCKED_COMPETITOR_DOMAINS.some((domain) => result.domain.includes(domain))) {
    return false;
  }

  const currentDomain = getDomainName(currentWebsite);
  if (currentDomain && result.domain === currentDomain) {
    return false;
  }

  const haystack = `${result.title} ${result.snippet || ""}`.toLowerCase();
  const categoryTokens = tokenize(context.category).filter((token) => token.length > 2);
  const cityTokens = tokenize(context.city).filter((token) => token.length > 2);
  const hasCategoryMatch = categoryTokens.some((token) => haystack.includes(token));
  const hasCityMatch = cityTokens.length
    ? cityTokens.some((token) => haystack.includes(token))
    : true;

  return hasCategoryMatch && hasCityMatch;
}

export async function researchCompetitorPatterns(context = {}) {
  const warnings = [];
  const queries = [
    `best ${context.category} in ${context.city}`,
    `${context.category} ${context.city}`,
    `"${context.category}" "${context.city}"`,
  ];

  let queryUsed = queries[0];
  let topResults = [];

  for (const query of queries) {
    queryUsed = query;

    try {
      const results = await fetchBingSearchResults(query);
      const filtered = results.filter((result) =>
        isRelevantCompetitorResult(result, context, context.website),
      );

      if (filtered.length) {
        topResults = filtered.slice(0, 5);
        break;
      }
    } catch {
      warnings.push(`Competitor search failed for query "${query}".`);
    }
  }

  if (!topResults.length) {
    warnings.push("Could not find stable public competitor search results.");
    return {
      queryUsed,
      topResults: [],
      pagePatterns: [],
      commonTerms: [],
      warnings,
    };
  }

  const pageResults = await Promise.allSettled(
    topResults.slice(0, 3).map((result) => scrapeCompetitorPage(result.url)),
  );
  const pagePatterns = pageResults
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);

  const patternTexts = [
    ...topResults.flatMap((result) => [result.title, result.snippet]),
    ...pagePatterns.flatMap((page) => [
      page.pageTitle,
      page.metaDescription,
      ...page.h1Headings,
      ...page.h2Headings,
    ]),
  ].filter(Boolean);

  return {
    queryUsed,
    topResults,
    pagePatterns,
    commonTerms: buildKeywordCandidates(patternTexts, context, 10),
    warnings,
  };
}
