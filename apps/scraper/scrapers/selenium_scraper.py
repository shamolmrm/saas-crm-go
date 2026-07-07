"""
Selenium scraper — Chrome WebDriver (via webdriver-manager, auto-downloads driver)
Alternative to Playwright. Runs in sync thread pool so it doesn't block FastAPI.
Requires Google Chrome installed on the machine.
"""

import asyncio
from extractor import extract_leads


def _run_selenium(url: str, max_leads: int) -> tuple[list[dict], int]:
    try:
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options
        from selenium.webdriver.chrome.service import Service
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC
        from selenium.webdriver.common.by import By
        from webdriver_manager.chrome import ChromeDriverManager
    except ImportError:
        raise RuntimeError(
            'Selenium dependencies not installed. Run: pip install selenium webdriver-manager'
        )

    opts = Options()
    opts.add_argument('--headless=new')
    opts.add_argument('--no-sandbox')
    opts.add_argument('--disable-dev-shm-usage')
    opts.add_argument('--disable-gpu')
    opts.add_argument('--window-size=1280,800')
    opts.add_argument(
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
        'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    )

    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=opts)

    try:
        driver.get(url)
        # Wait for body to have text content
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.TAG_NAME, 'body'))
        )
        # Scroll to trigger lazy content
        driver.execute_script('window.scrollTo(0, document.body.scrollHeight)')
        import time; time.sleep(1.5)
        html = driver.page_source
    finally:
        driver.quit()

    leads = extract_leads(html, url)
    return leads[:max_leads], 1


async def scrape_selenium(url: str, max_leads: int) -> tuple[list[dict], int]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _run_selenium, url, max_leads)
