"""
Full website intelligence analyzer.
Fetches main page + discovers key sub-pages (about, contact, team, services, pricing)
then extracts EVERYTHING: business info, contacts, social links, products, team, address.
"""

import asyncio, re, json
from urllib.parse import urljoin, urlparse
import httpx
from bs4 import BeautifulSoup

# ── Patterns ──────────────────────────────────────────────────────────────────

EMAIL_RE = re.compile(r'\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b')
PHONE_RE = re.compile(
    r'(?<!\w)(?:'
    r'\+?880[\s.\-]?\d{4}[\s.\-]?\d{6}'
    r'|\+?44[\s.\-]?\(?0?\)?[\s.\-]?\d{2,5}[\s.\-]?\d{3,8}'
    r'|\+?1[\s.\-]?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}'
    r'|\+?91[\s.\-]?\d{5}[\s.\-]?\d{5}'
    r'|\+\d{1,3}[\s.\-]?\d{2,4}[\s.\-]?\d{3,9}'
    r'|0\d[\s.\-]?\d{3,4}[\s.\-]?\d{3,6}'
    r')(?!\w)', re.ASCII
)
SOCIAL_RE = {
    'linkedin':  re.compile(r'https?://(?:www\.)?linkedin\.com/(?:company|in|school)/([^/"\'?\s#]+)', re.I),
    'facebook':  re.compile(r'https?://(?:www\.)?facebook\.com/(?!sharer|share|dialog)([^/"\'?\s#]+)', re.I),
    'twitter':   re.compile(r'https?://(?:www\.)?(?:twitter|x)\.com/(?!intent|share)([^/"\'?\s#]+)', re.I),
    'instagram': re.compile(r'https?://(?:www\.)?instagram\.com/([^/"\'?\s#]+)', re.I),
    'youtube':   re.compile(r'https?://(?:www\.)?youtube\.com/(?:channel/|c/|user/|@)([^/"\'?\s#]+)', re.I),
    'tiktok':    re.compile(r'https?://(?:www\.)?tiktok\.com/@([^/"\'?\s#]+)', re.I),
    'github':    re.compile(r'https?://(?:www\.)?github\.com/([^/"\'?\s#]+)', re.I),
    'whatsapp':  re.compile(r'https?://(?:wa\.me|api\.whatsapp\.com)/([^"\'?\s#]+)', re.I),
    'pinterest': re.compile(r'https?://(?:www\.)?pinterest\.com/([^/"\'?\s#]+)', re.I),
}
PRICE_RE    = re.compile(r'(?:USD|GBP|EUR|BDT|INR|\$|£|€|৳|฿)\s*[\d,]+(?:\.\d{1,2})?|[\d,]+(?:\.\d{1,2})?\s*(?:USD|GBP|EUR|/mo|/month|/yr|per month)', re.I)
SKIP_EMAILS = {'noreply','no-reply','donotreply','example.com','test@','email@','your@',
                'postmaster','webmaster','bounce@','privacy@example','legal@example'}
KEY_PAGES   = ['contact','contact-us','contacts','about','about-us','team','our-team',
               'staff','people','services','products','solutions','pricing','plans','portfolio']

HEADERS = {
    'User-Agent':  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Accept':      'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
}

# ── Main entry ─────────────────────────────────────────────────────────────────

async def analyze(url: str, use_playwright: bool = False) -> dict:
    base     = urlparse(url)
    base_url = f"{base.scheme}://{base.netloc}"

    async with httpx.AsyncClient(headers=HEADERS, follow_redirects=True, timeout=20) as client:
        main_html = await _fetch(url, client)
        if not main_html:
            raise ValueError(f"Could not fetch: {url}")

        main_soup = BeautifulSoup(main_html, 'html.parser')
        key_urls  = _discover_pages(main_soup, url, base.netloc)

        sub_htmls = await asyncio.gather(*[_fetch(u, client) for u in key_urls])
        all_pages = [(url, main_html)] + [(u, h) for u, h in zip(key_urls, sub_htmls) if h]

    # Aggregate
    all_emails:   set[str]        = set()
    all_phones:   set[str]        = set()
    all_socials:  dict[str, str]  = {}
    all_products: list[dict]      = []
    all_team:     list[dict]      = []
    address:      str | None      = None
    business:     dict            = {}
    meta:         dict            = {}
    pages_found:  list[str]       = []

    for page_url, html in all_pages:
        soup = BeautifulSoup(html, 'html.parser')
        pages_found.append(urlparse(page_url).path or '/')

        if page_url == url:
            business = _business(soup, url)
            meta     = _meta(soup)

        # strip tags for text
        for tag in soup(['script','style','noscript']):
            tag.decompose()
        text = soup.get_text(separator=' ')

        emails = [e for e in EMAIL_RE.findall(text)
                  if not any(s in e.lower() for s in SKIP_EMAILS)
                  and '.' in e.split('@')[1] and len(e) <= 120]
        phones = [p.strip() for p in PHONE_RE.findall(text) if len(p.strip()) >= 6]

        all_emails.update(emails)
        all_phones.update(phones)

        for name, pat in SOCIAL_RE.items():
            if name not in all_socials:
                m = pat.search(html)
                if m:
                    all_socials[name] = m.group(0)

        if not address:
            address = _address(BeautifulSoup(html, 'html.parser'))

        all_products.extend(_products(html))
        all_team.extend(_team(BeautifulSoup(html, 'html.parser'), html))

    # Build contacts list
    company    = business.get('name', base.netloc)
    email_list = list(all_emails)[:40]
    phone_list = list(all_phones)[:40]

    contacts = []
    for i, email in enumerate(email_list):
        contacts.append({
            'email':   email,
            'phone':   phone_list[i] if i < len(phone_list) else None,
            'company': company,
        })
    for phone in phone_list[len(email_list):]:
        contacts.append({'phone': phone, 'company': company})

    # Enrich with team member contacts
    for m in _dedupe(all_team, 'name')[:20]:
        if m.get('email') and m['email'] not in all_emails:
            contacts.append({'name': m.get('name'), 'email': m.get('email'),
                             'company': company, 'industry': m.get('title')})

    return {
        'url':          url,
        'domain':       base.netloc,
        'business':     business,
        'meta':         meta,
        'address':      address,
        'contacts':     contacts,
        'social':       all_socials,
        'products':     _dedupe(all_products, 'name')[:20],
        'team':         _dedupe(all_team, 'name')[:20],
        'pages_found':  pages_found,
        'total_emails': len(all_emails),
        'total_phones': len(all_phones),
    }


# ── Sub-extractors ─────────────────────────────────────────────────────────────

async def _fetch(url: str, client: httpx.AsyncClient) -> str | None:
    try:
        r = await client.get(url)
        if r.status_code == 200 and 'text/html' in r.headers.get('content-type', ''):
            return r.text
    except Exception:
        pass
    return None


def _discover_pages(soup: BeautifulSoup, current: str, domain: str) -> list[str]:
    found, seen = [], set()
    for a in soup.find_all('a', href=True):
        full   = urljoin(current, str(a['href'])).split('?')[0].split('#')[0]
        parsed = urlparse(full)
        if parsed.netloc != domain or full in seen:
            continue
        seen.add(full)
        path = parsed.path.lower().strip('/')
        if any(kw in path for kw in KEY_PAGES):
            found.append(full)
    return found[:8]


def _business(soup: BeautifulSoup, url: str) -> dict:
    info: dict = {}
    for script in soup.find_all('script', type='application/ld+json'):
        try:
            items = json.loads(script.string or '{}')
            if isinstance(items, dict): items = [items]
            for item in items:
                t = item.get('@type','')
                if isinstance(t, list): t = t[0] if t else ''
                if not ('Business' in t or t in ('Organization','Corporation','NGO','EducationalOrganization','GovernmentOrganization')):
                    continue
                info.setdefault('name',        item.get('name'))
                info.setdefault('description', (item.get('description') or '')[:300] or None)
                info.setdefault('founded',     item.get('foundingDate'))
                info.setdefault('hours',       item.get('openingHours'))
                logo = item.get('logo')
                if not info.get('logo'):
                    info['logo'] = (logo.get('url') or logo.get('contentUrl')) if isinstance(logo, dict) else logo
                emp = item.get('numberOfEmployees')
                if emp and not info.get('employees'):
                    info['employees'] = emp.get('value') if isinstance(emp, dict) else emp
        except Exception:
            pass

    if not info.get('name'):
        for attr, key in [('property','og:site_name'),('name','application-name')]:
            t = soup.find('meta', {attr: key})
            if t and t.get('content'):
                info['name'] = str(t['content']); break
    if not info.get('name'):
        title = soup.find('title')
        if title and title.string:
            raw = title.string.strip()
            for sep in [' | ',' - ',' – ',' :: ',' · ']:
                if sep in raw: raw = raw.split(sep)[0].strip(); break
            info['name'] = raw[:80]

    if not info.get('description'):
        for attr, key in [('property','og:description'),('name','description')]:
            t = soup.find('meta', {attr: key})
            if t and t.get('content'):
                info['description'] = str(t['content'])[:300]; break

    if not info.get('logo'):
        t = soup.find('meta', property='og:image')
        if t and t.get('content'):
            info['logo'] = str(t['content'])

    return {k: v for k, v in info.items() if v}


def _meta(soup: BeautifulSoup) -> dict:
    m: dict = {}
    t = soup.find('title')
    if t: m['title'] = str(t.string or '').strip()
    for attr, key, field in [
        ('name','description','description'), ('name','keywords','keywords'),
        ('name','generator','generator'),     ('name','author','author'),
        ('property','og:url','og_url'),
    ]:
        tag = soup.find('meta', {attr: key})
        if tag and tag.get('content'):
            m[field] = str(tag['content'])[:200]
    return m


def _address(soup: BeautifulSoup) -> str | None:
    for script in soup.find_all('script', type='application/ld+json'):
        try:
            items = json.loads(script.string or '{}')
            if isinstance(items, dict): items = [items]
            for item in items:
                addr = item.get('address')
                if isinstance(addr, str) and addr: return addr[:200]
                if isinstance(addr, dict):
                    parts = list(filter(None,[
                        addr.get('streetAddress'), addr.get('addressLocality'),
                        addr.get('addressRegion'),  addr.get('postalCode'),
                        addr.get('addressCountry'),
                    ]))
                    if parts: return ', '.join(parts)
        except Exception:
            pass
    for cls in ['address','contact-address','location','vcard']:
        t = soup.find(class_=re.compile(cls, re.I))
        if t:
            text = t.get_text(separator=', ', strip=True)[:200]
            if len(text) > 8: return text
    return None


def _products(raw_html: str) -> list[dict]:
    prods: list[dict] = []
    soup  = BeautifulSoup(raw_html, 'html.parser')
    for script in soup.find_all('script', type='application/ld+json'):
        try:
            items = json.loads(script.string or '{}')
            if isinstance(items, dict): items = [items]
            for item in items:
                t = item.get('@type','')
                if isinstance(t, list): t = t[0] if t else ''
                if t not in ('Product','Service','Offer','SoftwareApplication'): continue
                p: dict = {'name': item.get('name'), 'type': t}
                if item.get('description'): p['description'] = str(item['description'])[:150]
                offer = item.get('offers') or item.get('offer') or {}
                if isinstance(offer, list): offer = offer[0] if offer else {}
                if isinstance(offer, dict) and offer.get('price'):
                    p['price']    = offer['price']
                    p['currency'] = offer.get('priceCurrency','USD')
                if p.get('name'): prods.append(p)
        except Exception:
            pass
    if not prods:
        prices = PRICE_RE.findall(raw_html)
        for price in prices[:5]:
            prods.append({'name': 'Service/Product', 'price_text': price.strip()})
    return prods


def _team(soup: BeautifulSoup, raw_html: str) -> list[dict]:
    team: list[dict] = []
    for script in soup.find_all('script', type='application/ld+json'):
        try:
            items = json.loads(script.string or '{}')
            if isinstance(items, dict): items = [items]
            for item in items:
                t = item.get('@type','')
                if isinstance(t, list): t = t[0] if t else ''
                if t != 'Person': continue
                m: dict = {'name': item.get('name'), 'title': item.get('jobTitle'), 'email': item.get('email')}
                img = item.get('image')
                m['image']    = (img.get('url') or img.get('contentUrl')) if isinstance(img,dict) else img
                m['linkedin'] = next((s for s in (item.get('sameAs') or []) if 'linkedin' in s), None)
                if m.get('name'): team.append({k:v for k,v in m.items() if v})
        except Exception:
            pass
    if not team:
        for cls in ['team-member','staff-member','person','employee','member','bio']:
            for card in soup.find_all(class_=re.compile(cls, re.I)):
                h = card.find(['h2','h3','h4','strong'])
                if not h: continue
                name = h.get_text(strip=True)
                if len(name) < 2 or len(name) > 80: continue
                m = {'name': name}
                role = card.find(class_=re.compile('title|role|position|job|dept',re.I))
                if role: m['title'] = role.get_text(strip=True)[:80]
                em = EMAIL_RE.search(str(card))
                if em: m['email'] = em.group(0)
                team.append(m)
    return team


def _dedupe(items: list[dict], key: str) -> list[dict]:
    seen, result = set(), []
    for item in items:
        k = (item.get(key) or '').lower().strip()
        if k and k not in seen:
            seen.add(k); result.append(item)
        elif not k:
            result.append(item)
    return result
