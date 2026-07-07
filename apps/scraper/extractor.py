"""
Contact/lead extractor — works on any HTML string.
Priority order: JSON-LD schema.org → microdata → meta/OG tags → regex
"""

import re
import json
from bs4 import BeautifulSoup
from urllib.parse import urlparse

# ── Regex patterns ─────────────────────────────────────────────────────────────

EMAIL_RE = re.compile(
    r'\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b'
)

PHONE_RE = re.compile(
    r'(?<!\w)(?:'
    r'\+?880[\s.\-]?\d{4}[\s.\-]?\d{6}'          # Bangladesh: +880 1XXX XXXXXX
    r'|\+?44[\s.\-]?\(?0?\)?[\s.\-]?\d{3,5}[\s.\-]?\d{3,8}'  # UK: +44
    r'|\+?1[\s.\-]?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}'    # US/CA
    r'|\+?91[\s.\-]?\d{5}[\s.\-]?\d{5}'           # India
    r'|\+\d{1,3}[\s.\-]?\d{2,4}[\s.\-]?\d{3,9}'  # Generic international
    r'|0\d[\s.\-]?\d{3,4}[\s.\-]?\d{3,6}'        # Local 10-12 digit
    r')(?!\w)',
    re.ASCII
)

SKIP_EMAILS = {
    'noreply', 'no-reply', 'donotreply', 'webmaster', 'mailer-daemon',
    'bounce', 'postmaster', 'spam', 'example.com', 'test@', 'email@',
    'your@', 'name@', 'user@', 'admin@example', 'info@example',
}

KNOWN_SCHEMA_TYPES = {
    'LocalBusiness', 'Organization', 'Person', 'Restaurant', 'Hotel',
    'Store', 'MedicalBusiness', 'HealthAndBeautyBusiness', 'FoodEstablishment',
    'AutoDealer', 'LegalService', 'RealEstateAgent', 'ProfessionalService',
    'EntertainmentBusiness', 'SportsActivityLocation', 'TravelAgency',
}

# ── Main entry point ───────────────────────────────────────────────────────────

def extract_leads(html: str, source_url: str) -> list[dict]:
    soup = BeautifulSoup(html, 'lxml')
    leads: list[dict] = []
    seen_keys: set[str] = set()

    # 1. JSON-LD structured data (best quality)
    for tag in soup.find_all('script', type='application/ld+json'):
        try:
            raw = json.loads(tag.string or '{}')
            items = raw if isinstance(raw, list) else [raw]
            for item in items:
                lead = _from_jsonld(item, source_url)
                if lead:
                    key = _lead_key(lead)
                    if key not in seen_keys:
                        seen_keys.add(key)
                        leads.append(lead)
        except Exception:
            pass

    # 2. Strip scripts/styles for text extraction
    for tag in soup(['script', 'style', 'noscript', 'head']):
        tag.decompose()
    visible_text = soup.get_text(separator=' ', strip=True)

    # 3. Page-level company from meta/OG
    meta_company = _meta_company(soup)

    # 4. Regex: emails
    raw_emails = EMAIL_RE.findall(visible_text)
    valid_emails = [
        e for e in raw_emails
        if not any(s in e.lower() for s in SKIP_EMAILS)
        and len(e) <= 120
        and '.' in e.split('@')[1]
    ]

    # 5. Regex: phones
    raw_phones = PHONE_RE.findall(visible_text)
    clean_phones = [p.strip() for p in raw_phones if len(p.strip()) >= 7]

    # 6. Build leads from emails not already captured by JSON-LD
    email_idx = 0
    phone_idx = 0
    for email in valid_emails[:40]:
        if email in seen_keys:
            continue
        domain = email.split('@')[1]
        company = meta_company or domain.split('.')[0].replace('-', ' ').title()
        lead = _clean({
            'name':       company,
            'company':    company,
            'email':      email,
            'phone':      clean_phones[phone_idx] if phone_idx < len(clean_phones) else None,
            'website':    f'https://www.{domain}',
            'source_url': source_url,
        })
        seen_keys.add(email)
        leads.append(lead)
        email_idx += 1
        phone_idx += 1

    # 7. If zero emails but phones found — still stage them
    if not valid_emails and clean_phones:
        for phone in clean_phones[:20]:
            key = f'phone:{phone}'
            if key in seen_keys:
                continue
            seen_keys.add(key)
            company = meta_company or urlparse(source_url).netloc
            leads.append(_clean({
                'name':       company,
                'company':    company,
                'phone':      phone,
                'website':    source_url,
                'source_url': source_url,
            }))

    # 8. Enrich existing JSON-LD leads that lack phones
    ph_i = 0
    for lead in leads:
        if not lead.get('phone') and ph_i < len(clean_phones):
            lead['phone'] = clean_phones[ph_i]
            ph_i += 1

    return leads


# ── Helpers ────────────────────────────────────────────────────────────────────

def _from_jsonld(item: dict, source_url: str) -> dict | None:
    type_ = item.get('@type', '')
    if isinstance(type_, list):
        type_ = next((t for t in type_ if t in KNOWN_SCHEMA_TYPES), type_[0] if type_ else '')

    if type_ not in KNOWN_SCHEMA_TYPES:
        return None

    name = item.get('name') or item.get('legalName')
    if not name:
        return None

    email     = item.get('email')
    phone     = item.get('telephone') or item.get('phone')
    url       = item.get('url')
    same_as   = item.get('sameAs')
    website   = url or (same_as[0] if isinstance(same_as, list) and same_as else same_as)

    address_raw = item.get('address', {})
    address = None
    if isinstance(address_raw, str):
        address = address_raw
    elif isinstance(address_raw, dict):
        parts = filter(None, [
            address_raw.get('streetAddress'),
            address_raw.get('addressLocality'),
            address_raw.get('addressRegion'),
            address_raw.get('postalCode'),
            address_raw.get('addressCountry'),
        ])
        address = ', '.join(parts) or None

    is_person = type_ == 'Person'
    company_name = name if not is_person else (
        item.get('worksFor', {}).get('name') if isinstance(item.get('worksFor'), dict) else None
    )
    job_title = item.get('jobTitle') if is_person else None

    return _clean({
        'name':       name,
        'company':    company_name,
        'email':      email,
        'phone':      phone,
        'website':    website,
        'address':    address,
        'industry':   job_title or item.get('description', '')[:80] or None,
        'source_url': source_url,
    })


def _meta_company(soup: BeautifulSoup) -> str | None:
    for attr, key in [('property', 'og:site_name'), ('name', 'application-name'), ('name', 'author')]:
        tag = soup.find('meta', {attr: key})
        if tag and tag.get('content'):
            return str(tag['content'])
    title = soup.find('title')
    if title and title.string:
        # Take first segment before separator
        for sep in [' | ', ' - ', ' – ', ' :: ']:
            if sep in title.string:
                return title.string.split(sep)[0].strip()
    return None


def _lead_key(lead: dict) -> str:
    return (lead.get('email') or lead.get('phone') or lead.get('name') or '').lower().strip()


def _clean(d: dict) -> dict:
    return {k: v for k, v in d.items() if v is not None and v != ''}
