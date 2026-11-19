#!/usr/bin/env python3
"""Generate SYNTHETIC training_data.csv so you can test the pipeline before you have real logs.
Never present synthetic output as real results (say so in the README if you ship it)."""
import argparse
import uuid
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

rng = np.random.default_rng(42)
LOCS = {"(Fake Data)Lake Worth": 0.0, "(Fake Data)Lake Tawakoni": 0.35, "(Fake Data)Trinity River": -0.25}
RIGS = {"Texas rig": 0.30, "Carolina rig": 0.15, "Kentucky rig": 0.0, "Drop shot": 0.10}
LURES = {"Jig": 0.2, "Crankbait": 0.0, "Soft plastic worm": 0.25, "Spinnerbait": -0.05}
COLORS = ["green pumpkin", "black/blue", "chartreuse", "white"]
BAITS = ["(none)", "Fresh cut shad", "Frozen cut shad", "Live minnow"]
SPECIES = {"Largemouth bass": 0.9, "Channel catfish": 0.45, "Bluegill": 0.7}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--trips", type=int, default=90)
    ap.add_argument("--out", default="training_data.csv")
    a = ap.parse_args()

    rows = []
    start = datetime(2026, 3, 1, tzinfo=timezone.utc)
    for _ in range(a.trips):
        trip_id = str(uuid.uuid4())
        when = start + timedelta(days=int(rng.integers(0, 240)), hours=int(rng.integers(11, 24)))
        month, hour = when.month, (when.hour - 5) % 24
        water = float(np.clip(48 + 8 * np.sin((month - 3) / 12 * 2 * np.pi) * 1.6 + rng.normal(0, 3), 45, 88))
        air, wind = water + rng.normal(4, 5), float(np.clip(rng.gamma(2.5, 3), 0, 30))
        pressure, clouds = float(rng.normal(30.0, 0.25)), int(rng.integers(0, 101))
        loc = str(rng.choice(list(LOCS)))
        precip = str(rng.choice(["none", "none", "none", "drizzle", "rain"]))
        moon = round(float(rng.random()), 2)
        for _ in range(int(rng.integers(1, 4))):
            rig, lure = str(rng.choice(list(RIGS))), str(rng.choice(list(LURES)))
            color, bait = str(rng.choice(COLORS)), str(rng.choice(BAITS))
            hours = round(float(rng.uniform(0.5, 4)), 2)
            base = (0.15 + 0.02 * (water - 60) - 0.012 * wind + LOCS[loc] + RIGS[rig] + LURES[lure]
                    + (0.2 if hour in (6, 7, 8, 18, 19, 20) else 0) - 0.1 * (precip == "rain"))
            setup_id, any_fish = str(uuid.uuid4()), False
            for sp, mult in SPECIES.items():
                n = int(rng.poisson(max(base, 0.02) * mult * hours))
                if n:
                    any_fish = True
                    rows.append((setup_id, trip_id, when, loc, rig, lure, color, bait, hours, air, water,
                                 pressure, wind, clouds, precip, moon, sp, n))
            if not any_fish:
                rows.append((setup_id, trip_id, when, loc, rig, lure, color, bait, hours, air, water,
                             pressure, wind, clouds, precip, moon, None, 0))

    cols = ["setup_id", "trip_id", "started_at", "location", "rig", "lure_type", "lure_color", "bait",
            "hours_fished", "air_temp_f", "water_temp_f", "pressure_inhg", "wind_mph", "cloud_cover_pct",
            "precipitation", "moon_phase", "species", "fish"]
    df = pd.DataFrame(rows, columns=cols)
    df["bait"] = df["bait"].replace("(none)", np.nan)
    df.to_csv(a.out, index=False, float_format="%.2f")
    print(f"Wrote {len(df)} rows ({df.trip_id.nunique()} trips) to {a.out}")


if __name__ == "__main__":
    main()
