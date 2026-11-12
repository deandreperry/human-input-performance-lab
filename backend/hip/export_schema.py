"""Regenerate the shared contract after API changes."""

import json
from pathlib import Path

from .main import app

if __name__ == "__main__":
    destination = Path(__file__).resolve().parents[2] / "shared" / "openapi.json"
    destination.write_text(json.dumps(app.openapi(), indent=2) + "\n", encoding="utf-8")
