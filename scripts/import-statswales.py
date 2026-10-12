"""Validate one supported StatsWales CSV export and produce a reviewable candidate."""
import argparse
import csv
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile

ROOT = Path(__file__).resolve().parents[1]
IDS = {
    "characteristics": "2018f447-f4c0-438d-bb88-2a72af967724",
    "year_groups": "9b0d8f7a-02f9-4663-8093-ec975074f4ea",
    "fsm": "996385d1-061e-4835-8c92-60d232277216",
}
COLUMNS = {
    "characteristics": ["Data values", "Data description", "School", "Local Authority", "Sector", "Type", "Governance", "School Language", "Notes"],
    "year_groups": ["Data values", "Data description", "School", "Sector", "Year group", "Notes"],
    "fsm": ["Data values", "Data description", "School", "Category", "Notes"],
}
CATEGORIES = {"Eligible for free school meals": "eligible",
              "Eligible for free school meals or transitionally protected": "eligible_or_transitionally_protected",
              "All pupils": "all_pupils"}
NOTES = {"Confidential": "suppressed", "Not available": "unavailable", "Not applicable": "not_applicable"}


def measure(row):
    raw, note = row["Data values"].strip(), row["Notes"].strip()
    if note:
        if note not in NOTES or raw:
            raise ValueError("Unknown note or value accompanying non-reported note")
        return {"value": None, "status": NOTES[note], "note": note}
    if not raw:
        return {"value": None, "status": "unavailable"}
    if not re.fullmatch(r"\d+(\.\d+)?", raw):
        raise ValueError("Invalid numeric value")
    value = float(raw) if "." in raw else int(raw)
    if row["Data description"] == "Number of pupils":
        if int(value) != value:
            raise ValueError("Pupil count must be an integer")
        value = int(value)
    elif row["Data description"] == "Percentage of pupils":
        if not 0 <= value <= 100:
            raise ValueError("Percentage outside 0–100")
    else:
        raise ValueError("Unknown measure")
    return {"value": value, "status": "reported"}


def build(kind, csv_path, before, after, period, census_date):
    if before["id"] != IDS[kind] or after["id"] != IDS[kind]:
        raise ValueError("Wrong dataset")
    revision = before["published_revision"]
    if revision != after["published_revision"]:
        raise ValueError("Metadata changed during download")
    metadata = next(m for m in revision["metadata"] if m["language"].lower() == "en-gb")
    if re.findall(r"\d{4}/\d{2}", metadata["title"]) != [period]:
        raise ValueError("Reporting period disagrees with English metadata")
    start = int(period[:4])
    if period[5:] != str(start + 1)[-2:] or census_date.year != start + 1:
        raise ValueError("Invalid period/census year")
    if census_date > dt.date.fromisoformat(revision["publish_at"][:10]):
        raise ValueError("Census date is later than publication")
    if revision["rounding_applied"] != (kind == "fsm"):
        raise ValueError("Rounding policy changed; review definitions")
    records = {}
    keys = set()
    with csv_path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != COLUMNS[kind]:
            raise ValueError("Export columns changed")
        for row in reader:
            if None in row or any(v is None for v in row.values()):
                raise ValueError("Incomplete CSV row")
            match = re.fullmatch(r"(\d{7}) - (.+)", row["School"])
            if not match:
                raise ValueError("Malformed school identifier")
            sid, name = match.groups()
            if kind == "characteristics" and (row["Local Authority"] == "Cardiff") != sid.startswith("681"):
                raise ValueError("Cardiff authority/identifier disagreement")
            if row["Data description"] not in ("Number of pupils", "Percentage of pupils"):
                raise ValueError("Unknown measure")
            if kind != "fsm" and row["Data description"] != "Number of pupils":
                raise ValueError("Unexpected percentage")
            if kind == "fsm":
                if row["Category"] not in CATEGORIES:
                    raise ValueError("Unknown FSM category")
                if row["Category"] == "All pupils" and row["Data description"] != "Number of pupils":
                    raise ValueError("Unexpected all-pupils percentage")
                key = (sid, row["Category"], row["Data description"])
            elif kind == "year_groups":
                if not re.fullmatch(r"Nursery [12]|Reception|Year Group ([1-9]|1[0-4])", row["Year group"]):
                    raise ValueError("Unknown year group")
                key = (sid, row["Year group"])
            else:
                key = (sid,)
            if key in keys:
                raise ValueError("Duplicate measure key")
            keys.add(key)
            if kind == "characteristics" and any(not row[field].strip() for field in ["Local Authority", "Sector", "Type", "Governance", "School Language"]):
                raise ValueError("Missing characteristic")
            if kind == "year_groups" and not row["Sector"].strip():
                raise ValueError("Missing sector")
            value = measure(row)
            if kind == "fsm" and row["Data description"] == "Number of pupils" and value["value"] is not None and value["value"] % 5:
                raise ValueError("FSM count violates published rounding")
            if not sid.startswith("681"):
                continue
            record = records.setdefault(sid, {"school_id": sid, "source_name": name})
            if record["source_name"] != name:
                raise ValueError("Conflicting source names")
            if kind == "characteristics":
                record.update(total=value, characteristics={
                    "name": name, "sector": row["Sector"], "school_type": row["Type"],
                    "governance": row["Governance"], "language_category": row["School Language"],
                    "local_authority": row["Local Authority"],
                })
            elif kind == "year_groups":
                record.setdefault("values", {})[row["Year group"]] = value
                if "sector" in record and record["sector"] != row["Sector"]:
                    raise ValueError("Conflicting year-group sectors")
                record["sector"] = row["Sector"]
            else:
                category = CATEGORIES[row["Category"]]
                if category == "all_pupils":
                    record[category] = value
                else:
                    field = "count" if row["Data description"] == "Number of pupils" else "percentage"
                    record.setdefault(category, {})[field] = value
    if not records:
        raise ValueError("No Cardiff records")
    definitions = {
        "characteristics": "PLASC pupil headcounts, including published nursery and post-16 provision; subsidiary pupils excluded. Not FTE, capacity or live enrolment.",
        "year_groups": "Published PLASC pupil headcounts by year group. Omitted groups are not inferred to be zero.",
        "fsm": "Means-tested FSM eligibility, separately from eligibility or transitional protection. Excludes meals received solely through universal primary provision. Counts rounded to nearest 5; use published percentages, never reconstruct confidential figures.",
    }
    return {"source": {
        "provider": "Welsh Government", "publishing_service": "StatsWales",
        "dataset": metadata["title"], "dataset_id": IDS[kind],
        "revision_id": revision["id"],
        "source_url": f"https://stats.gov.wales/en-GB/{IDS[kind]}",
        "download_url": f"https://api.stats.gov.wales/v2/{IDS[kind]}/data?format=csv&language=en-gb",
        "publication_date": revision["publish_at"][:10], "reporting_period": period,
        "census_date": census_date.isoformat(),
        "snapshot_imported_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "input_sha256": hashlib.sha256(csv_path.read_bytes()).hexdigest(),
        "metadata_sha256": hashlib.sha256(json.dumps(before, sort_keys=True).encode()).hexdigest(),
        "definition": definitions[kind], "rounding": "nearest_5_counts" if kind == "fsm" else "none",
        "attribution": "Contains public sector information licensed under the Open Government Licence v3.0. Source: Welsh Government (StatsWales).",
    }, "schools": records}


def report(snapshot, previous, register, kind):
    records = snapshot["schools"]
    old = previous.get("schools", {})
    ids = set(register)
    changes = {sid: {"before": old[sid], "after": row} for sid, row in records.items()
               if sid in old and old[sid] != row}
    large = []
    if kind == "characteristics":
        for sid in changes:
            a, b = old[sid]["total"]["value"], records[sid]["total"]["value"]
            if a is not None and b is not None and (abs(b-a) > a * .2):
                large.append(sid)
    differences = {}
    if kind == "characteristics":
        for sid in ids & records.keys():
            differing = {field: {"register": register[sid].get(field), "statswales": value}
                         for field, value in records[sid]["characteristics"].items()
                         if (register[sid].get(field, "").casefold().removesuffix(" schools") != value.casefold().removesuffix(" schools"))}
            if differing:
                differences[sid] = differing
    return {"school_count": len(records), "matched": len(ids & records.keys()),
            "missing_register_schools": sorted(ids - records.keys()),
            "unmatched_statswales_schools": sorted(records.keys() - ids),
            "added_ids": sorted(records.keys() - old.keys()), "removed_ids": sorted(old.keys() - records.keys()),
            "changed_records": changes, "pupil_changes_above_20_percent": large,
            "source_characteristic_differences": differences,
            "previous_period": previous.get("source", {}).get("reporting_period"),
            "period": snapshot["source"]["reporting_period"],
            "previous_revision": previous.get("source", {}).get("revision_id"),
            "revision": snapshot["source"]["revision_id"]}


def atomic_write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    name = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False, encoding="utf-8") as f:
            name = f.name
            json.dump(value, f, ensure_ascii=False, indent=2)
            f.write("\n")
        os.replace(name, path)
    finally:
        if name and Path(name).exists():
            Path(name).unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("kind", choices=IDS)
    parser.add_argument("csv", type=Path)
    parser.add_argument("--metadata-before", required=True, type=Path)
    parser.add_argument("--metadata-after", required=True, type=Path)
    parser.add_argument("--period", required=True)
    parser.add_argument("--census-date", required=True, type=dt.date.fromisoformat)
    parser.add_argument("--candidate", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    parser.add_argument("--register", type=Path, default=ROOT / "src/schools/directory.json")
    args = parser.parse_args()
    # This command only writes candidates. Promotion is a separate reviewed step.
    canonical = ROOT / f"src/schools/statswales/{args.kind}.json"
    protected = {args.register.resolve(), *(ROOT / f"src/schools/statswales/{kind}.json" for kind in IDS)}
    protected = {p.resolve() for p in protected}
    inputs = {args.csv.resolve(), args.metadata_before.resolve(), args.metadata_after.resolve()}
    if args.candidate.resolve() in protected | inputs or args.report.resolve() in protected | inputs or args.candidate.resolve() == args.report.resolve():
        raise ValueError("Candidate/report must be distinct from inputs and canonical snapshots; review before promotion")
    snapshot = build(args.kind, args.csv, json.loads(args.metadata_before.read_text()),
                     json.loads(args.metadata_after.read_text()), args.period, args.census_date)
    register = {s["school_id"]: s for s in json.loads(args.register.read_text())["schools"]}
    previous = json.loads(canonical.read_text()) if canonical.exists() else {}
    diff = report(snapshot, previous, register, args.kind)
    # Compare matching-period complete year-group totals with the independently stored total.
    other = ROOT / "src/schools/statswales" / ("year_groups.json" if args.kind == "characteristics" else "characteristics.json")
    diff["year_group_total_discrepancies"] = []
    if args.kind in ("characteristics", "year_groups") and other.exists():
        counterpart = json.loads(other.read_text())
        if counterpart["source"]["reporting_period"] == args.period:
            totals, years = (snapshot, counterpart) if args.kind == "characteristics" else (counterpart, snapshot)
            for sid in totals["schools"].keys() & years["schools"].keys():
                total = totals["schools"][sid]["total"]["value"]
                values = [v["value"] for v in years["schools"][sid]["values"].values()]
                if total is not None and all(v is not None for v in values) and sum(values) != total:
                    diff["year_group_total_discrepancies"].append({"school_id": sid, "total": total, "year_groups_sum": sum(values)})
    atomic_write(args.report, diff)
    atomic_write(args.candidate, snapshot)
    print(json.dumps({k: v for k, v in diff.items() if k != "changed_records"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
