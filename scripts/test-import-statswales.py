"""Deterministic importer regression tests (standard library only)."""
import csv
import datetime
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("importer", ROOT / "scripts/import-statswales.py")
imp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(imp)
FIXTURES = ROOT / "scripts/fixtures/statswales"


class ImportTests(unittest.TestCase):
    def build(self, kind, rows=None, metadata=None):
        m = metadata or json.loads((FIXTURES / f"{kind}-metadata.json").read_text())
        if rows is None:
            return imp.build(kind, FIXTURES / f"{kind}.csv", m, m, "2025/26", datetime.date(2026, 1, 20))
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "data.csv"
            with path.open("w", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=rows[0].keys())
                writer.writeheader()
                writer.writerows(rows)
            return imp.build(kind, path, m, m, "2025/26", datetime.date(2026, 1, 20))

    def rows(self, kind):
        with (FIXTURES / f"{kind}.csv").open() as f:
            return list(csv.DictReader(f))

    def test_representative_school_joins(self):
        for kind in imp.IDS:
            result = self.build(kind)
            self.assertEqual(set(result["schools"]), {"6814039", "6812003", "6814071"})
            self.assertEqual(result["source"]["publication_date"], "2026-08-05")
        self.assertEqual(self.build("characteristics")["schools"]["6814039"]["total"]["value"], 1795)
        self.assertEqual(self.build("fsm")["schools"]["6814071"]["all_pupils"]["value"], 1530)

    def test_statuses_and_zero(self):
        for note, status in imp.NOTES.items():
            self.assertEqual(imp.measure({"Data values": "", "Notes": note, "Data description": "Number of pupils"})["status"], status)
        self.assertEqual(imp.measure({"Data values": "0", "Notes": "", "Data description": "Number of pupils"})["value"], 0)
        self.assertEqual(imp.measure({"Data values": "", "Notes": "", "Data description": "Number of pupils"})["status"], "unavailable")

    def test_reject_bad_rows(self):
        mutations = [
            ("characteristics", "School", "681123 - Bad ID"),
            ("characteristics", "Local Authority", "Swansea"),
            ("characteristics", "Data values", "-1"),
            ("characteristics", "Data values", "1.2"),
            ("characteristics", "Data description", "Unknown"),
            ("characteristics", "Notes", "Unrecognised"),
            ("year_groups", "Year group", "New group"),
            ("fsm", "Category", "Unknown"),
            ("fsm", "Data values", "6"),
        ]
        for kind, field, value in mutations:
            rows = self.rows(kind)
            rows[0][field] = value
            with self.subTest(kind=kind, field=field):
                with self.assertRaises(ValueError):
                    self.build(kind, rows)
        for kind in imp.IDS:
            rows = self.rows(kind)
            rows.append(rows[0])
            with self.assertRaises(ValueError):
                self.build(kind, rows)
        with self.assertRaises(ValueError):
            imp.measure({"Data values": "101", "Notes": "", "Data description": "Percentage of pupils"})

    def test_period_and_revision_validation(self):
        m = json.loads((FIXTURES / "characteristics-metadata.json").read_text())
        after = json.loads(json.dumps(m))
        after["published_revision"]["id"] = "changed"
        with self.assertRaises(ValueError):
            imp.build("characteristics", FIXTURES / "characteristics.csv", m, after, "2025/26", datetime.date(2026, 1, 20))
        m["published_revision"]["metadata"][0]["title"] = "2024/25"
        with self.assertRaises(ValueError):
            self.build("characteristics", metadata=m)

    def test_failed_candidate_preserves_previous_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            candidate = Path(tmp) / "candidate.json"
            candidate.write_text("last valid snapshot")
            bad = Path(tmp) / "bad.csv"
            bad.write_text("unexpected,columns\n1,2\n")
            result = subprocess.run(["python3", str(ROOT / "scripts/import-statswales.py"), "characteristics", str(bad),
                                     "--metadata-before", str(FIXTURES / "characteristics-metadata.json"),
                                     "--metadata-after", str(FIXTURES / "characteristics-metadata.json"),
                                     "--period", "2025/26", "--census-date", "2026-01-20",
                                     "--candidate", str(candidate), "--report", str(Path(tmp) / "report.json")],
                                    capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(candidate.read_text(), "last valid snapshot")

    def test_difference_report(self):
        snapshot = self.build("characteristics")
        previous = json.loads(json.dumps(snapshot))
        previous["schools"]["6814039"]["total"]["value"] = 1000
        previous["schools"]["6819999"] = previous["schools"]["6812003"]
        register = {"6814039": {"name": "Alternative", "governance": "Foundation"}, "6818888": {}}
        result = imp.report(snapshot, previous, register, "characteristics")
        self.assertEqual(result["removed_ids"], ["6819999"])
        self.assertEqual(result["missing_register_schools"], ["6818888"])
        self.assertEqual(result["pupil_changes_above_20_percent"], ["6814039"])
        self.assertIn("6814039", result["source_characteristic_differences"])


if __name__ == "__main__":
    unittest.main()
