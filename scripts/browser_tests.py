"""Run the entire browser suite against a disposable local research database."""

import os
import secrets
import subprocess
import tempfile
import time
import urllib.request
from contextlib import ExitStack
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
PY_BIN = ROOT / ".venv/bin"


def main():
    with tempfile.TemporaryDirectory(prefix="hip-browser-") as folder, ExitStack() as stack:
        env = {
            **os.environ,
            "HIP_DATABASE_URL": f"sqlite:///{folder}/lab.sqlite3",
            "HIP_API_ORIGIN": "http://127.0.0.1:8001",
            "HIP_FRONTEND_ORIGIN": "http://127.0.0.1:3001",
            "PLAYWRIGHT_BASE_URL": "http://127.0.0.1:3001",
            "HIP_E2E_ISOLATED": "1",
            "HIP_NEXT_DIST": ".next-test",
            "HIP_RESEARCHER_PASSWORD": secrets.token_urlsafe(32),
        }
        subprocess.run(
            [PY_BIN / "alembic", "-c", "backend/alembic.ini", "upgrade", "head"],
            cwd=ROOT,
            env=env,
            check=True,
        )
        services = [
            (
                "api",
                [PY_BIN / "uvicorn", "backend.hip.main:app", "--port", "8001", "--no-access-log"],
                ROOT,
                env["HIP_API_ORIGIN"] + "/api/health",
            ),
            (
                "frontend",
                [
                    FRONTEND / "node_modules/.bin/next",
                    "dev",
                    "--hostname",
                    "127.0.0.1",
                    "--port",
                    "3001",
                ],
                FRONTEND,
                env["PLAYWRIGHT_BASE_URL"] + "/session",
            ),
        ]
        for name, command, cwd, url in services:
            log = stack.enter_context((Path(folder) / (name + ".log")).open("w+"))
            proc = subprocess.Popen(command, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT)
            stack.callback(proc.wait, timeout=10)
            stack.callback(proc.terminate)
            for _ in range(120):
                if proc.poll() is not None:
                    break
                try:
                    with urllib.request.urlopen(url, timeout=2) as response:
                        if response.status == 200:
                            break
                except OSError:
                    time.sleep(0.25)
            else:
                raise RuntimeError(f"{name} readiness timeout")
            if proc.poll() is not None:
                log.seek(0)
                raise RuntimeError(log.read())
        result = subprocess.run(
            [FRONTEND / "node_modules/.bin/playwright", "test", "--workers=1", "--reporter=line"],
            cwd=FRONTEND,
            check=False,
            env=env,
        )
        return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
