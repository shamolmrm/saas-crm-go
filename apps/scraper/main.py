"""
CRM Web Scraper — FastAPI microservice (port 8001)
Called by apps/api/src/routes/leads.ts — never exposed to the browser directly.

Modes:
  auto     → Smart detection: static first, Playwright if JS-heavy
  static   → HTTPX + BeautifulSoup  (fast, ~2s, no JS)
  dynamic  → Playwright headless Chrome (~10s, handles React/Vue/Angular)
  selenium → Selenium Chrome WebDriver (alternative to Playwright)
  spider   → BFS multi-page crawler using Scrapy LinkExtractor + HTTPX
"""

import time
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl

app = FastAPI(title="CRM Web Scraper", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4000", "http://localhost:3000"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


class ScrapeRequest(BaseModel):
    url: str
    mode: str = "auto"       # auto | static | dynamic | selenium | spider
    depth: int = 1           # spider: how many link-hops from start URL
    max_pages: int = 10      # spider: max pages to visit
    max_leads: int = 50      # hard cap on returned leads


class ScrapeResponse(BaseModel):
    leads: list[dict]
    pages_scraped: int
    mode_used: str
    duration_ms: int
    total_found: int


@app.get("/health")
def health():
    return {"ok": True, "service": "crm-scraper"}


@app.post("/scrape", response_model=ScrapeResponse)
async def scrape(req: ScrapeRequest):
    start = time.time()
    leads: list[dict] = []
    mode_used = req.mode
    pages_scraped = 0

    try:
        if req.mode == "auto":
            from scrapers.auto_scraper import scrape_auto
            leads, mode_used, pages_scraped = await scrape_auto(req.url, req.max_leads)

        elif req.mode == "static":
            from scrapers.static_scraper import scrape_static
            leads, pages_scraped = await scrape_static(req.url, req.max_leads)
            mode_used = "static (HTTPX + BeautifulSoup)"

        elif req.mode == "dynamic":
            from scrapers.dynamic_scraper import scrape_dynamic
            leads, pages_scraped = await scrape_dynamic(req.url, req.max_leads)
            mode_used = "dynamic (Playwright)"

        elif req.mode == "selenium":
            from scrapers.selenium_scraper import scrape_selenium
            leads, pages_scraped = await scrape_selenium(req.url, req.max_leads)
            mode_used = "selenium (Chrome WebDriver)"

        elif req.mode == "spider":
            from scrapers.spider_scraper import scrape_spider
            leads, pages_scraped = await scrape_spider(
                req.url, req.depth, req.max_pages, req.max_leads
            )
            mode_used = f"spider (Scrapy+HTTPX, {pages_scraped} pages)"

        else:
            raise HTTPException(status_code=400, detail=f"Unknown mode: {req.mode}")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    duration_ms = int((time.time() - start) * 1000)
    capped = leads[: req.max_leads]

    return ScrapeResponse(
        leads=capped,
        pages_scraped=pages_scraped,
        mode_used=mode_used,
        duration_ms=duration_ms,
        total_found=len(leads),
    )


class AnalyzeRequest(BaseModel):
    url: str


@app.post("/analyze")
async def analyze_website(req: AnalyzeRequest):
    """
    Full website intelligence — fetches main page + discovers sub-pages
    (about, contact, team, services, pricing) and extracts everything:
    business info, all emails, phones, social links, products, team members, address.
    """
    start = time.time()
    try:
        from analyzer import analyze
        result = await analyze(req.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    result["duration_ms"] = int((time.time() - start) * 1000)
    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
