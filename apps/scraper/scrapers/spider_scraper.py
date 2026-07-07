"""
Spider scraper — BFS multi-page crawler using HTTPX + BeautifulSoup.
Uses Scrapy's LinkExtractor for robust, configurable link discovery.
Crawls up to `max_pages` pages within the same domain, `depth` levels deep.
"""

import asyncio
import httpx
from urllib.parse import urlparse, urljoin
from extractor import extract_leads

HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (compatible; CRM-Spider/1.0; '
        '+https://github.com/your-crm)'
    ),
    'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
}

# File extensions to skip (not HTML pages)
SKIP_EXTS = {
    '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp',
    '.mp4', '.mp3', '.zip', '.exe', '.dmg', '.css', '.js', '.json',
    '.xml', '.ico', '.woff', '.woff2', '.ttf',
}

# URL path fragments that usually aren't contact pages
SKIP_PATHS = {'#', 'javascript:', 'mailto:', 'tel:', 'whatsapp:'}


def _extract_links_bs4(html: str, current_url: str, base_domain: str) -> list[str]:
    """Extract same-domain links using BeautifulSoup (Scrapy-style link extraction)."""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, 'lxml')
    links = []
    for a in soup.find_all('a', href=True):
        href = str(a['href']).strip()
        if any(href.startswith(s) for s in SKIP_PATHS):
            continue
        full = urljoin(current_url, href).split('#')[0].split('?')[0]
        parsed = urlparse(full)
        if parsed.netloc != base_domain:
            continue
        if any(full.lower().endswith(ext) for ext in SKIP_EXTS):
            continue
        links.append(full)
    return links


def _try_scrapy_link_extractor(html: str, current_url: str, base_domain: str) -> list[str]:
    """Use Scrapy's LinkExtractor when available for better link discovery."""
    try:
        from scrapy.linkextractors import LinkExtractor
        from scrapy.http import HtmlResponse

        response = HtmlResponse(
            url=current_url,
            body=html.encode('utf-8', errors='ignore'),
            encoding='utf-8',
        )
        le = LinkExtractor(allow_domains=[base_domain], deny_extensions=list(SKIP_EXTS))
        return [link.url.split('#')[0].split('?')[0] for link in le.extract_links(response)]
    except Exception:
        # Fall back to BS4 if Scrapy not available or fails
        return _extract_links_bs4(html, current_url, base_domain)


async def scrape_spider(
    start_url: str,
    depth: int,
    max_pages: int,
    max_leads: int,
) -> tuple[list[dict], int]:
    base_domain = urlparse(start_url).netloc
    # BFS queue: (url, current_depth)
    queue: list[tuple[str, int]] = [(start_url, 0)]
    visited: set[str] = set()
    all_leads: list[dict] = []
    pages_scraped = 0

    async with httpx.AsyncClient(
        timeout=20,
        follow_redirects=True,
        headers=HEADERS,
    ) as client:
        while queue and pages_scraped < max_pages:
            current_url, current_depth = queue.pop(0)
            if current_url in visited:
                continue
            visited.add(current_url)

            try:
                resp = await client.get(current_url)
                if resp.status_code != 200:
                    continue
                content_type = resp.headers.get('content-type', '')
                if 'text/html' not in content_type:
                    continue

                html = resp.text
                pages_scraped += 1

                # Extract leads from this page
                page_leads = extract_leads(html, current_url)
                all_leads.extend(page_leads)

                # Discover more links if depth allows
                if current_depth < depth:
                    links = _try_scrapy_link_extractor(html, current_url, base_domain)
                    for link in links:
                        if link not in visited and len(queue) < max_pages * 3:
                            queue.append((link, current_depth + 1))

                # Small delay to be polite
                await asyncio.sleep(0.3)

            except Exception:
                continue

    # Deduplicate across all pages
    seen: set[str] = set()
    unique: list[dict] = []
    for lead in all_leads:
        key = (lead.get('email') or lead.get('phone') or lead.get('name') or '').lower().strip()
        if not key:
            continue
        if key not in seen:
            seen.add(key)
            unique.append(lead)

    return unique[:max_leads], pages_scraped
