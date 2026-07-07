"""
Static scraper — HTTPX + BeautifulSoup
Fast (~1-3s). Works for plain HTML pages, directories, listings.
No JavaScript execution.
"""

import httpx
from extractor import extract_leads

HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/124.0.0.0 Safari/537.36'
    ),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
}


async def scrape_static(url: str, max_leads: int) -> tuple[list[dict], int]:
    async with httpx.AsyncClient(
        timeout=20,
        follow_redirects=True,
        headers=HEADERS,
    ) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        html = resp.text

    leads = extract_leads(html, url)
    return leads[:max_leads], 1
