"""Fetch recent, real OpenAlex publication metadata (never synthesize news)."""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "research.json"


def update():
    tracks = json.loads((ROOT / "data" / "paths.json").read_text(encoding="utf-8"))
    from_date = (datetime.now(timezone.utc) - timedelta(days=30)).date().isoformat()
    result = {"updated_at": None, "provider": "OpenAlex", "items": {}, "errors": []}
    succeeded = 0

    for path in tracks:
        params = {
            "search": path["research"],
            "filter": f"from_publication_date:{from_date},type:article",
            "sort": "publication_date:desc",
            "per-page": 8,
            "select": "id,title,publication_date,doi,primary_location,authorships"
        }
        url = "https://api.openalex.org/works?" + urlencode(params)
        request = Request(url, headers={
            "User-Agent": "WhatNextAI/1.0 (academic research discovery)",
            "Accept": "application/json"
        })
        try:
            with urlopen(request, timeout=25) as response:
                works = json.load(response).get("results", [])
            cleaned = []
            for paper in works:
                title = (paper.get("title") or "").strip()
                link = paper.get("doi") or paper.get("id") or ""
                date = paper.get("publication_date") or ""
                if not (title and date >= from_date and link.startswith("https://")):
                    continue
                journal = ((paper.get("primary_location") or {}).get("source") or {}).get("display_name")
                cleaned.append({
                    "title": title[:200],
                    "date": date,
                    "url": link,
                    "venue": journal or "OpenAlex indexed publication"
                })
                if len(cleaned) >= 5:
                    break
            result["items"][path["id"]] = cleaned
            succeeded += 1
        except Exception as exc:
            result["errors"].append(f"{path['id']}: {type(exc).__name__}")
            print(f"Could not refresh {path['id']}: {exc}")

    # Retain only previously obtained real source records when an individual feed fails.
    if OUT.exists():
        try:
            old = json.loads(OUT.read_text(encoding="utf-8"))
            for path in tracks:
                if path["id"] not in result["items"]:
                    result["items"][path["id"]] = old.get("items", {}).get(path["id"], [])
        except (ValueError, OSError):
            pass

    if succeeded:
        result["updated_at"] = datetime.now(timezone.utc).isoformat()
    OUT.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"OpenAlex refresh successful for {succeeded}/{len(tracks)} fields.")
    if not succeeded:
        print("No fabricated research records were created.")


if __name__ == "__main__":
    update()
