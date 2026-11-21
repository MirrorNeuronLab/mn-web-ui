"""Run the API, runtime, or web proxy in isolated temporary storage."""

import os
import subprocess
import sys
import tempfile
from pathlib import Path
from textwrap import dedent
from threading import Event

from .blueprints import fixture_bundle, write_catalog
from .runtime import fixture_runtime
from .settings import (
    API_PORT,
    RUNTIME_PORT,
    RUNTIME_TOKEN,
    SURFACE_TOKEN,
    WEB_PORT,
    WORKER_PORT,
)
from .worker import worker_app

ROOT = Path(__file__).resolve().parents[2]


def serve(app, port):
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning", lifespan="off")


def main(mode, home):
    if mode in {"runtime", "api"}:
        os.environ.update(
            MN_BLUEPRINT_SOURCE="local", MN_BLUEPRINT_LOCAL=str(write_catalog(home))
        )
    if mode == "runtime":
        os.environ.update(MN_HOST_SHARED_STORAGE_ROOT=str(home / "shared"))
        release_launch = Event()
        server, service = fixture_runtime(home, release_launch)
        try:
            serve(worker_app(service.core_client, release_launch), WORKER_PORT)
        finally:
            server.stop(0).wait()
            service.close()
    elif mode == "api":
        import grpc
        from fastapi.responses import Response
        from mn_api.app import create_app
        from mn_sdk.runtime_connection import connect

        (home / "install_metadata.json").write_text('{"install_role":"client"}')
        target = f"127.0.0.1:{RUNTIME_PORT}"
        with grpc.insecure_channel(target) as channel:
            grpc.channel_ready_future(channel).result(timeout=15)
        connect(target, RUNTIME_TOKEN)
        app = create_app()
        bundle = fixture_bundle(home)

        @app.get("/api/v1/test/bundle")
        def download_fixture_bundle():
            return Response(bundle, media_type="application/zip")

        serve(app, API_PORT)
    elif mode == "compose":
        # Run the Compose service's actual server against the same build and API.
        compose = (ROOT.parent / "mn-deploy" / "docker-compose.yml").read_text()
        script = compose.split("<<'NODE'\n", 1)[1].split("\n        NODE\n", 1)[0]
        server = home / "server.mjs"
        server.write_text(dedent(script))
        os.environ.update(
            MN_WEB_UI_SITE_DIR=str(ROOT / "dist"), MN_WEB_UI_API_HOST="127.0.0.1"
        )
        subprocess.run(["node", str(server)], check=True)
    elif mode == "web":
        from mn_api.web_ui_server import create_app

        serve(create_app(ROOT / "dist"), WEB_PORT)
    else:
        raise SystemExit(f"Unknown browser fixture service: {mode}")


def run(mode: str) -> None:
    # Playwright can select an uninstalled API checkout and its sibling SDK.
    source = (
        Path(os.environ.get("MN_WEB_E2E_API_SOURCE", ROOT.parent / "mn-api"))
        .expanduser()
        .resolve()
    )
    sdk = source.parent / "mn-python-sdk"
    sys.path.insert(0, str(source))
    sys.path.insert(0, str(sdk))
    for package in (sdk / "packages").glob("*/src"):
        sys.path.insert(0, str(package))

    with tempfile.TemporaryDirectory(prefix="mn-web-ui-api-") as storage:
        for key in list(os.environ):
            if key.startswith("MN_"):
                del os.environ[key]
        os.environ.update(
            MN_ENV="test",
            MN_HOME=storage,
            MN_API_HOST="127.0.0.1",
            MN_API_PORT=str(API_PORT),
            MN_API_TOKEN=SURFACE_TOKEN,
            MN_WEB_UI_PORT=str(WEB_PORT),
        )
        os.chdir(storage)
        main(mode, Path(storage))
