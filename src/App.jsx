import { useState } from "react";
import "./App.css";

const initialManualData = {
  name: "",
  category: "",
  city: "",
  website: "",
};

const fieldHelp = {
  name: "Enter the exact business name. Do not add extra keywords.",
  category: "Enter the main business category that best matches the core service.",
  city: "Enter the main city or local area you want to rank in, such as Noida or Delhi NCR.",
  website: "Optional. If provided, the app will scrape public website content and SEO signals automatically.",
};

function ListCard({ title, items, emptyMessage }) {
  return (
    <section className="card">
      <div className="card-header">
        <h3>{title}</h3>
      </div>
      {items.length ? (
        <ul className="list">
          {items.map((item, index) => (
            <li key={`${title}-${index}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="muted">{emptyMessage}</p>
      )}
    </section>
  );
}

function App() {
  const [manualData, setManualData] = useState(initialManualData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [result, setResult] = useState(null);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setManualData((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setErrorCode("");
    setResult(null);

    try {
      const response = await fetch("/api/audit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ manualData }),
      });
      const data = await response.json();

      if (!response.ok) {
        const requestError = new Error(data.error || "Audit request failed.");
        requestError.code = data.errorCode || "";
        throw requestError;
      }

      setResult(data.data);
    } catch (requestError) {
      setError(requestError.message || "Audit request failed.");
      setErrorCode(requestError.code || "");
    } finally {
      setLoading(false);
    }
  };

  const audit = result?.audit;
  const websiteInsights = result?.websiteInsights;
  const competitorResearch = result?.competitorResearch;

  return (
    <div className="app-shell">
      <main className="page">
        <section className="hero hero-single">
          <div className="hero-copy">
            <span className="eyebrow">AI Local SEO Auditor</span>
            <h1>Enter a few basic details. Get a complete local SEO strategy back.</h1>
            <p>
              The system will research keywords, scrape your website if available, detect local
              opportunities for your city and category, and generate competition-focused SEO
              recommendations automatically.
            </p>
          </div>

          <form className="panel form-panel" onSubmit={handleSubmit}>
            <div className="card-header compact">
              <h3>Manual Local SEO Form</h3>
              <span className="badge">Website scraping enabled</span>
            </div>

            <div className="form-grid simple-grid">
              <label className="field">
                <span>Business Name</span>
                <input
                  name="name"
                  value={manualData.name}
                  onChange={handleChange}
                  placeholder="Gig Lab Soundworks"
                />
                <p className="helper-text">{fieldHelp.name}</p>
              </label>

              <label className="field">
                <span>Primary Category</span>
                <input
                  name="category"
                  value={manualData.category}
                  onChange={handleChange}
                  placeholder="Recording Studio"
                />
                <p className="helper-text">{fieldHelp.category}</p>
              </label>

              <label className="field">
                <span>City / Location</span>
                <input
                  name="city"
                  value={manualData.city}
                  onChange={handleChange}
                  placeholder="Noida"
                />
                <p className="helper-text">{fieldHelp.city}</p>
              </label>

              <label className="field">
                <span>Website (optional)</span>
                <input
                  type="url"
                  name="website"
                  value={manualData.website}
                  onChange={handleChange}
                  placeholder="https://yourbusiness.com"
                />
                <p className="helper-text">{fieldHelp.website}</p>
              </label>
            </div>

            <button className="submit-button" type="submit" disabled={loading}>
              {loading ? "Generating audit..." : "Generate Local SEO Audit"}
            </button>

            {error ? <p className="error-banner">{error}</p> : null}
            {errorCode === "GEMINI_QUOTA_EXCEEDED" ? (
              <p className="helper-text">
                Gemini API quota is currently exhausted for this project. Try again after quota
                resets or switch to an API key with active quota.
              </p>
            ) : null}
          </form>
        </section>

        {result ? (
          <section className="results">
            <div className="results-header">
              <div>
                <span className="eyebrow">SEO Audit</span>
                <h2>{result.businessData?.name || "Business profile"}</h2>
              </div>
              <div className="score-card">
                <span>SEO Score</span>
                <strong>{audit?.seo_score ?? 0}</strong>
              </div>
            </div>

            <div className="grid two-up">
              <section className="card">
                <div className="card-header">
                  <h3>Business Snapshot</h3>
                  <span className="badge">{result.source}</span>
                </div>
                <dl className="data-grid">
                  <div>
                    <dt>Business Name</dt>
                    <dd>{result.businessData?.name || "Not available"}</dd>
                  </div>
                  <div>
                    <dt>Primary Category</dt>
                    <dd>{result.businessData?.category || "Not available"}</dd>
                  </div>
                  <div>
                    <dt>City / Location</dt>
                    <dd>{result.businessData?.city || "Not available"}</dd>
                  </div>
                  <div>
                    <dt>Website</dt>
                    <dd>{result.businessData?.website || "Not provided"}</dd>
                  </div>
                </dl>
              </section>

              <section className="card">
                <div className="card-header">
                  <h3>Optimized Description</h3>
                </div>
                <p className="description-text">
                  {audit?.optimized_description || "No optimized description returned."}
                </p>
              </section>
            </div>

            <div className="grid two-up">
              <section className="card">
                <div className="card-header">
                  <h3>Website Signals</h3>
                </div>
                {websiteInsights ? (
                  <>
                    <dl className="data-grid">
                      <div>
                        <dt>Page Title</dt>
                        <dd>{websiteInsights.pageTitle || "Not available"}</dd>
                      </div>
                      <div>
                        <dt>Meta Description</dt>
                        <dd>{websiteInsights.metaDescription || "Not available"}</dd>
                      </div>
                      <div>
                        <dt>Detected Services</dt>
                        <dd>{websiteInsights.services?.join(", ") || "Not detected"}</dd>
                      </div>
                      <div>
                        <dt>Detected Keywords</dt>
                        <dd>{websiteInsights.keywords?.join(", ") || "Not detected"}</dd>
                      </div>
                    </dl>
                    <div className="subsection">
                      <h4>Content Signals</h4>
                      {(websiteInsights.contentSignals || []).length ? (
                        <ul className="list">
                          {websiteInsights.contentSignals.map((item, index) => (
                            <li key={`signal-${index}`}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="muted">No content signals detected.</p>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="muted">
                    No website was provided or the website could not be scraped.
                  </p>
                )}
              </section>

              <section className="card">
                <div className="card-header">
                  <h3>Competitor Research</h3>
                </div>
                <p className="muted">
                  Query used: <strong>{competitorResearch?.queryUsed || "Not available"}</strong>
                </p>
                <p className="description-text">
                  {audit?.competitor_insights || "No competitor insights returned."}
                </p>
                <dl className="data-grid">
                  <div>
                    <dt>Common Competitor Terms</dt>
                    <dd>{competitorResearch?.commonTerms?.join(", ") || "Not detected"}</dd>
                  </div>
                </dl>
                {competitorResearch?.topResults?.length ? (
                  <ul className="list">
                    {competitorResearch.topResults.slice(0, 3).map((item, index) => (
                      <li key={`competitor-${index}`}>
                        <strong>{item.title}</strong>
                        {item.snippet ? ` - ${item.snippet}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">No competitor search results were captured.</p>
                )}
              </section>
            </div>

            <div className="grid three-up">
              <ListCard
                title="Issues"
                items={audit?.issues || []}
                emptyMessage="No issues returned."
              />
              <ListCard
                title="Missing Elements"
                items={audit?.missing_elements || []}
                emptyMessage="No missing elements returned."
              />
              <ListCard
                title="Keyword Suggestions"
                items={audit?.keyword_suggestions || []}
                emptyMessage="No keyword suggestions returned."
              />
            </div>

            <div className="grid two-up">
              <ListCard
                title="Review Strategy"
                items={audit?.review_strategy || []}
                emptyMessage="No review strategy returned."
              />
              <ListCard
                title="Action Plan"
                items={audit?.action_plan || []}
                emptyMessage="No action plan returned."
              />
            </div>

            {result.scrapeMeta?.warnings?.length ? (
              <section className="card">
                <div className="card-header">
                  <h3>Scraping Notes</h3>
                </div>
                <ul className="list">
                  {result.scrapeMeta.warnings.map((warning, index) => (
                    <li key={`warning-${index}`}>{warning}</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </section>
        ) : null}
      </main>
    </div>
  );
}

export default App;
