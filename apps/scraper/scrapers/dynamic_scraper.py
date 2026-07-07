"""
Dynamic scraper — Playwright (headless Chromium)
Slower (~5-20s). Works for JS-heavy sites: React, Vue, Angular SPAs.
Run `playwright install chromium` once after pip install.
"""

from extractor import extract_leads


async def scrape_dynamic(url: str, max_leads: int) -> tuple[list[dict], int]:
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        raise RuntimeError(
            'Playwright not installed. Run: pip install playwright && playwright install chromium'
        )

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(
            user_agent=(
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                'AppleWebKit/537.36 (KHTML, like Gecko) '
                'Chrome/124.0.0.0 Safari/537.36'
            ),
            viewport={'width': 1280, 'height': 800},
        )
        page = await ctx.new_page()

        try:
            await page.goto(url, wait_until='networkidle', timeout=30_000)
            # Scroll to trigger lazy-loaded content
            await page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
            await page.wait_for_timeout(1500)
            html = await page.content()
        finally:
            await browser.close()

    leads = extract_leads(html, url)
    return leads[:max_leads], 1
