#!/usr/bin/env python3
"""Scrape the tables on the TPWD State Freshwater Records page and save them as CSV.

Usage:
    pip install requests beautifulsoup4
    python scrape_tpwd_records.py                 # writes tpwd_records.csv
    python scrape_tpwd_records.py -o records.csv  # custom output path
"""

import argparse
import csv
import sys
from pathlib import Path

import requests
from bs4 import BeautifulSoup

URL = (
    "https://tpwd.texas.gov/fishboat/fish/action/staterecords.php"
    "?env=FW&age_group=all&list=0&browse=Submit"
)
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; tpwd-records-scraper/1.0)"}


def fetch_html(url: str) -> str:
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    return resp.text


def parse_table(table) -> list[list[str]]:
    """Return a table as a list of rows; the first row is the header."""
    rows = []
    for tr in table.find_all("tr"):
        cells = tr.find_all(["th", "td"])
        if not cells:
            continue
        # Collapse internal whitespace/nbsp; keep empty cells so columns stay aligned.
        rows.append([" ".join(c.get_text(" ", strip=True).split()) for c in cells])
    return rows


def write_csv(rows: list[list[str]], path: Path) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        csv.writer(f).writerows(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("-o", "--output", default="tpwd_records.csv",
                        help="output CSV path (default: tpwd_records.csv)")
    args = parser.parse_args()

    soup = BeautifulSoup(fetch_html(URL), "html.parser")
    tables = [parse_table(t) for t in soup.find_all("table")]
    tables = [t for t in tables if len(t) > 1]  # drop empty/layout tables

    if not tables:
        print("No data tables found; the page layout may have changed.", file=sys.stderr)
        return 1

    out = Path(args.output)
    for i, rows in enumerate(tables, start=1):
        # One table -> the exact path given; several -> numbered suffixes.
        path = out if len(tables) == 1 else out.with_name(f"{out.stem}_{i}{out.suffix}")
        write_csv(rows, path)
        print(f"Saved {len(rows) - 1} rows x {len(rows[0])} columns -> {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())