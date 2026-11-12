"""CLI for reproducible local analysis and an auditable record of exclusions."""

import argparse
import hashlib
import json
from importlib.metadata import version
from pathlib import Path

from .model import analyze
from .synthetic import synthetic_trials


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--input", type=Path, help="Authenticated flat trial JSON export")
    source.add_argument(
        "--demo", action="store_true", help="Use deterministic synthetic data (seed 713)"
    )
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--widths", nargs="+", type=float, default=[24, 40, 64])
    parser.add_argument("--distances", nargs="+", type=float, default=[150, 300, 450])
    parser.add_argument("--figures", action="store_true", help="Write private PNG and SVG figures")
    parser.add_argument("--pdf", action="store_true", help="Write an aggregate research report")
    parser.add_argument(
        "--protocol", type=Path, help="Frozen study JSON with title, question, hypotheses"
    )
    args = parser.parse_args()
    if args.input and args.input.resolve() in {
        (args.out / name).resolve()
        for name in (
            "private-analysis.json",
            "manifest.json",
            "research-report.pdf",
            "private-research-figures.png",
            "private-research-figures.svg",
        )
    }:
        parser.error("The output would overwrite the source export. Use a separate output directory.")
    raw = args.input.read_bytes() if args.input else json.dumps(synthetic_trials()).encode()
    rows = json.loads(raw)
    report = analyze(rows, args.widths, args.distances)
    manifest = {
        "sha256": hashlib.sha256(raw).hexdigest(),
        "analysis_version": "1.0",
        "planned_widths": args.widths,
        "planned_distances": args.distances,
        "source": report["quality"]["source"],
        "seed": 713 if args.demo else None,
        "packages": {k: version(k) for k in ("numpy", "pandas", "scipy", "statsmodels")},
    }
    args.out.mkdir(parents=True, exist_ok=True)
    if args.demo:
        (args.out / "synthetic-trials.json").write_bytes(raw)
    for name, obj in (("manifest", manifest), ("private-analysis", report)):
        (args.out / f"{name}.json").write_text(json.dumps(obj, allow_nan=False, indent=2) + "\n")
    if args.pdf:
        from .report import write_report

        protocol = json.loads(args.protocol.read_text()) if args.protocol else {}
        write_report(report, args.out / "research-report.pdf", protocol)
    if args.figures and report["quality"]["eligible_rows"]:
        import matplotlib

        matplotlib.use("Agg")  # File exports also run without a window server.
        from .plots import export_figures

        export_figures(rows, args.out)


if __name__ == "__main__":
    main()
