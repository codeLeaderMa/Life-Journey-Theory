#!/usr/bin/env python3
"""Fetch cited_by_count from OpenAlex for each canonical work.
Usage: python3 fetch_citations.py works_query.json citations.json
works_query.json: {"theory_id": "search title", ...}
citations.json:   {"theory_id": {"cites": N, "oa_title": "...", "oa_year": Y}, ...}
"""
import json, sys, time, urllib.request, urllib.parse, ssl

try:
    CTX = ssl.create_default_context()
    urllib.request.urlopen("https://api.openalex.org", timeout=10, context=CTX).read(1)
except Exception:
    CTX = ssl._create_unverified_context()

def fetch(title):
    q = urllib.parse.quote(title)
    url = (f"https://api.openalex.org/works?filter=title.search:{q}"
           f"&sort=cited_by_count:desc&per-page=1"
           f"&select=display_name,publication_year,cited_by_count"
           f"&mailto=dev@example.com")
    try:
        with urllib.request.urlopen(url, timeout=20, context=CTX) as r:
            d = json.load(r)
        rs = d.get("results", [])
        if rs:
            w = rs[0]
            return {"cites": w["cited_by_count"], "oa_title": w["display_name"], "oa_year": w["publication_year"]}
    except Exception as e:
        return {"cites": 0, "error": str(e)[:80]}
    return {"cites": 0}

def main():
    src, dst = sys.argv[1], sys.argv[2]
    queries = json.load(open(src))
    out = {}
    for i, (tid, title) in enumerate(queries.items()):
        out[tid] = fetch(title)
        print(f"[{i+1}/{len(queries)}] {tid}: {out[tid].get('cites')} <- {out[tid].get('oa_title','?')[:50]}", flush=True)
        time.sleep(0.12)  # ~8 req/s, polite
    json.dump(out, open(dst, "w"), ensure_ascii=False, indent=1)
    print("done ->", dst)

if __name__ == "__main__":
    main()
