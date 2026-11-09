#!/usr/bin/env python3
"""Pass 2: full-text search= with scholar surname, relevance-ranked, rate-limited."""
import json, sys, time, urllib.request, urllib.parse, ssl

CTX = ssl._create_unverified_context()
MAILTO = "dev@example.com"

def fetch(title):
    q = urllib.parse.quote(title)
    url = (f"https://api.openalex.org/works?search={q}"
           f"&per-page=1&select=display_name,publication_year,cited_by_count"
           f"&mailto={MAILTO}")
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=25, context=CTX) as r:
                d = json.load(r)
            rs = d.get("results", [])
            if rs:
                w = rs[0]
                return {"cites": w["cited_by_count"], "oa_title": w["display_name"], "oa_year": w["publication_year"]}
            return {"cites": 0}
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(2.5 * (attempt + 1)); continue
            return {"cites": 0, "error": f"HTTP {e.code}"}
        except Exception as e:
            return {"cites": 0, "error": str(e)[:80]}
    return {"cites": 0, "error": "rate_limited"}

def main():
    src, dst = sys.argv[1], sys.argv[2]
    queries = json.load(open(src))
    prev = {}
    try: prev = json.load(open(dst))
    except Exception: pass
    out = dict(prev)
    todo = [(k, v) for k, v in queries.items() if not prev.get(k, {}).get("cites")]
    print(f"{len(todo)} to fetch / {len(queries)}")
    for i, (tid, title) in enumerate(todo):
        out[tid] = fetch(title)
        print(f"[{i+1}/{len(todo)}] {tid}: {out[tid].get('cites')} <- {out[tid].get('oa_title','?')[:55]}", flush=True)
        time.sleep(0.35)
        if (i + 1) % 20 == 0:
            json.dump(out, open(dst, "w"), ensure_ascii=False, indent=1)
    json.dump(out, open(dst, "w"), ensure_ascii=False, indent=1)
    print("done ->", dst)

if __name__ == "__main__":
    main()
