"""
Auto mode — smart detection:
1. Try static (HTTPX) first — fast.
2. If visible text is too short OR JS-framework fingerprints detected → switch to Playwright.
"""

import httpx
from bs4 import BeautifulSoup
from extractor import extract_leads
from scrapers.static_scraper import HEADERS

# JS-framework fingerprints that indicate a client-rendered page
JS_MARKERS = [
    'data-reactroot', '__NEXT_DATA__', 'data-reactid',
    'ng-version', '__vue__', '__nuxt__', 'data-svelte',
    'ember-application', 'x-cloak',
]


async def scrape_auto(url: str, max_leads: int) -> tuple[list[dict], str, int]:
    """Returns (leads, mode_used, pages_scraped)."""

    # Step 1: static fetch
    html = ''
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True, headers=HEADERS) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            html = resp.text
    except Exception as e:
        raise RuntimeError(f'Could not fetch URL: {e}')

    # Step 2: detect if JS-rendered
    needs_dynamic = _is_js_rendered(html)

    if needs_dynamic:
        try:
            from scrapers.dynamic_scraper import scrape_dynamic
            leads, pages = await scrape_dynamic(url, max_leads)
            return leads, 'dynamic (Playwright)', pages
        except Exception:
            pass  # fall back to static results

    # Step 3: use static result
    leads = extract_leads(html, url)
    return leads[:max_leads], 'static (HTTPX+BS4)', 1


def _is_js_rendered(html: str) -> bool:
    # Check for JS framework fingerprints
    for marker in JS_MARKERS:
        if marker in html:
            return True

    # Check if visible text is very sparse (sign of client-rendered shell)
    soup = BeautifulSoup(html, 'lxml')
    for tag in soup(['script', 'style', 'noscript']):
        tag.decompose()
    visible = soup.get_text(separator=' ', strip=True)

    return len(visible) < 500  # Less than 500 chars of visible text → probably JS-rendered
