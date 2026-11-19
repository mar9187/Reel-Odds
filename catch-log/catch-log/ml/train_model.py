#!/usr/bin/env python3
"""Train logistic-regression models of catch probability and export them as JSON.

Input : training_data.csv (see training_view.sql)
Output: public/models/<species>.json plus public/models/index.json

Unit  : one row per fishing setup (one rig/lure/bait combination on one trip).
Target: 1 if that setup caught at least one fish of the species (or any species), else 0.
Model : L2-regularised logistic regression. Trip length enters as log(hours fished), so
        the exported model can answer "chance of at least one fish in N hours".
Eval  : cross-validation grouped by trip (setups from one outing never span train and test),
        reporting log loss and Brier score against a base-rate baseline, plus ROC AUC.
"""
import argparse
import json
import re
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

WEATHER = ["air_temp_f", "water_temp_f", "pressure_inhg", "wind_mph", "cloud_cover_pct"]
CYCLIC = ["hour_sin", "hour_cos", "month_sin", "month_cos", "moon_sin", "moon_cos"]
NUMERIC_ALL = ["log_hours"] + WEATHER + CYCLIC
CATEGORICAL = ["location", "rig", "lure_type", "lure_color", "bait", "precipitation"]
NONE_LABEL = "(none)"
C_GRID = np.logspace(-2, 2, 9)  # inverse regularisation strength candidates
ALL_SPECIES = "All species"
MODEL_VERSION = 2


def load(path, tz):
    df = pd.read_csv(path)
    df["hours_fished"] = pd.to_numeric(df["hours_fished"], errors="coerce")
    df = df[df["hours_fished"] > 0].copy()
    for col in WEATHER + ["moon_phase"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df["fish"] = pd.to_numeric(df["fish"], errors="coerce").fillna(0)
    df["log_hours"] = np.log(df["hours_fished"])

    # Hour of day and month wrap around, so encode them as sine/cosine pairs (local time).
    started = pd.to_datetime(df["started_at"], utc=True).dt.tz_convert(tz)
    hour = started.dt.hour + started.dt.minute / 60
    month = started.dt.month - 1
    df["hour_sin"], df["hour_cos"] = np.sin(2 * np.pi * hour / 24), np.cos(2 * np.pi * hour / 24)
    df["month_sin"], df["month_cos"] = np.sin(2 * np.pi * month / 12), np.cos(2 * np.pi * month / 12)
    df["moon_sin"], df["moon_cos"] = np.sin(2 * np.pi * df["moon_phase"]), np.cos(2 * np.pi * df["moon_phase"])

    for col in CATEGORICAL:
        df[col] = df[col].fillna(NONE_LABEL).astype(str).str.strip().replace("", NONE_LABEL)
    return df


def setup_table(df, species):
    """One row per setup with a 0/1 'caught' label for the chosen species."""
    base = df.drop_duplicates("setup_id").drop(columns=["species", "fish"]).copy()
    rows = df if species == ALL_SPECIES else df[df["species"] == species]
    counts = rows.groupby("setup_id")["fish"].sum()
    base["fish"] = base["setup_id"].map(counts).fillna(0)
    base["caught"] = (base["fish"] > 0).astype(int)
    return base.reset_index(drop=True)


def make_pipeline(numeric, c):
    pre = ColumnTransformer([
        ("num", Pipeline([("impute", SimpleImputer(strategy="mean")),
                          ("scale", StandardScaler())]), numeric),
        ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), CATEGORICAL),
    ])
    return Pipeline([("pre", pre), ("clf", LogisticRegression(C=c, max_iter=2000))])


def out_of_fold(base, numeric, y, c, folds):
    groups = base["trip_id"].to_numpy()
    pred = np.zeros(len(base))
    prior = np.zeros(len(base))
    splitter = StratifiedGroupKFold(n_splits=folds, shuffle=True, random_state=0)
    for train, test in splitter.split(base, y, groups):
        pipe = make_pipeline(numeric, c).fit(base.iloc[train], y[train])
        pred[test] = pipe.predict_proba(base.iloc[test])[:, 1]
        prior[test] = y[train].mean()
    eps = 1e-6
    return np.clip(pred, eps, 1 - eps), np.clip(prior, eps, 1 - eps)


def cross_validate(base, numeric, y):
    folds = max(2, min(5, base["trip_id"].nunique(), int(y.sum()), int(len(y) - y.sum())))
    best = None
    for c in C_GRID:
        pred, prior = out_of_fold(base, numeric, y, c, folds)
        loss = log_loss(y, pred)
        if best is None or loss < best["cv_log_loss"]:
            best = {"c": float(c), "cv_log_loss": loss, "baseline_log_loss": log_loss(y, prior),
                    "cv_brier": brier_score_loss(y, pred), "baseline_brier": brier_score_loss(y, prior),
                    "cv_auc": roc_auc_score(y, pred)}
    return best


def export(base, numeric, pipe, species, metrics):
    pre, clf = pipe.named_steps["pre"], pipe.named_steps["clf"]
    scaler = pre.named_transformers_["num"].named_steps["scale"]
    coef = clf.coef_[0]
    n = len(base)

    model = {
        "version": MODEL_VERSION,
        "type": "logistic",
        "species": species,
        "target": "catch_probability",
        "intercept": float(clf.intercept_[0]),
        "c": metrics["c"],
        "trained_on": {"setups": int(n), "trips": int(base["trip_id"].nunique()),
                       "successes": int(base["caught"].sum()), "fish": int(base["fish"].sum()),
                       "hours": round(float(base["hours_fished"].sum()), 1)},
        "hours_range": [float(base["hours_fished"].min()), float(base["hours_fished"].max())],
        "metrics": {k: round(float(v), 4) for k, v in metrics.items() if k != "c"},
        "numeric": [], "categorical": {},
    }
    for i, name in enumerate(numeric):
        model["numeric"].append({"name": name, "mean": float(scaler.mean_[i]),
                                 "scale": float(scaler.scale_[i]), "coef": float(coef[i])})

    pos = len(numeric)
    encoder = pre.named_transformers_["cat"]
    for col, cats in zip(CATEGORICAL, encoder.categories_):
        share = base[col].value_counts(normalize=True)
        entries = {str(cat): {"coef": float(coef[pos + j]), "share": float(share.get(cat, 0.0))}
                   for j, cat in enumerate(cats)}
        # Used when a field is left blank: the average log-odds effect across your own setups.
        unspecified = sum(e["coef"] * e["share"] for e in entries.values())
        model["categorical"][col] = {"categories": entries, "unspecified": float(unspecified)}
        pos += len(cats)
    return model


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv", help="training_data.csv exported from Supabase")
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "public" / "models"))
    ap.add_argument("--tz", default="America/Chicago", help="local time zone for hour-of-day (default: %(default)s)")
    ap.add_argument("--species", action="append", help="train only this species (repeatable)")
    ap.add_argument("--min-positives", type=int, default=10,
                    help="need at least this many setups that caught, and that did not (default 10)")
    ap.add_argument("--min-setups", type=int, default=30, help="skip if fewer setups (default 30)")
    args = ap.parse_args()

    df = load(args.csv, args.tz)
    species_seen = sorted(df["species"].dropna().unique())
    targets = args.species or [ALL_SPECIES] + species_seen

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    index = []
    for species in targets:
        base = setup_table(df, species)
        pos, neg = int(base["caught"].sum()), int((1 - base["caught"]).sum())
        if len(base) < args.min_setups or min(pos, neg) < args.min_positives:
            print(f"skip   {species}: {len(base)} setups, {pos} with a catch, {neg} without "
                  f"(need {args.min_setups} setups and {args.min_positives} of each outcome)")
            continue
        numeric = [c for c in NUMERIC_ALL if base[c].notna().any()]
        y = base["caught"].to_numpy()

        metrics = cross_validate(base, numeric, y)
        pipe = make_pipeline(numeric, metrics["c"]).fit(base, y)
        model = export(base, numeric, pipe, species, metrics)

        fname = f"{slug(species)}.json"
        (out / fname).write_text(json.dumps(model, indent=1))
        index.append({"species": species, "file": fname, "setups": len(base), "successes": pos,
                      "cv_auc": model["metrics"]["cv_auc"]})
        print(f"saved  {species}: {len(base)} setups, {pos} with a catch | "
              f"CV AUC {metrics['cv_auc']:.2f} | log loss {metrics['cv_log_loss']:.3f} "
              f"vs baseline {metrics['baseline_log_loss']:.3f}")

    (out / "index.json").write_text(json.dumps(index, indent=1))
    print(f"\nWrote {len(index)} model(s) to {out}")
    print("AUC of 0.5 is guessing and a log loss at or above the baseline means the model adds nothing; log more trips.")


if __name__ == "__main__":
    main()
