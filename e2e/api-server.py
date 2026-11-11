"""Run the browser against the current REST surface and native runtime service."""

from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from threading import Event
from textwrap import dedent
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = (
    Path(os.environ.get("MN_WEB_E2E_API_SOURCE", str(ROOT.parent / "mn-api")))
    .expanduser()
    .resolve()
)
SDK = SOURCE.parent / "mn-python-sdk"
sys.path.insert(0, str(SOURCE))
sys.path.insert(0, str(SDK))
for package in (SDK / "packages").glob("*/src"):
    sys.path.insert(0, str(package))

API_PORT = 54009
RUNTIME_PORT = 54010
WORKER_PORT = 54011
WEB_PORT = 4174
RUNTIME_TOKEN = "web-ui-runtime-fixture"
SURFACE_TOKEN = "web-ui-surface-fixture"
NODE_NAME = "test-pc@127.0.0.1"


def encoded(value):
    return json.dumps(value)


class SignalFeed:
    def __init__(self, first_event):
        self.first_event = first_event
        self.closed = Event()

    def __next__(self):
        if self.first_event:
            event, self.first_event = self.first_event, None
            return encoded(event)
        if self.closed.wait(timeout=1):
            raise StopIteration
        return encoded({"type": "stream_heartbeat"})

    def close(self):
        self.closed.set()


class CoreFixture:
    def __init__(self, home):
        self.signal_feeds = {}
        self.ui_dir = home / "job-data" / "job-service"
        self.ui_dir.mkdir(parents=True)
        (self.ui_dir / "ui.json").write_text(
            encoded({"job_id": "job-service", "renderer": "external-url"})
        )
        self.jobs = {
            "job-history": self.job(
                "job-history", run_count=51, latest_run_id="execution-live"
            ),
            "job-ready": self.job("job-ready"),
            "job-service": self.job(
                "job-service",
                type="service",
                run_count=1,
                latest_run_id="execution-service",
                owner_node=NODE_NAME,
            ),
        }
        self.runs = {
            **{
                f"execution-{n:03}": {
                    "run_id": f"execution-{n:03}",
                    "job_id": "job-history",
                    "status": "completed",
                    "created_at": f"2026-01-01T00:00:{n:02}Z",
                }
                for n in range(50)
            },
            "execution-live": {
                "run_id": "execution-live",
                "job_id": "job-history",
                "status": "running",
                "created_at": "2026-01-02T00:00:00Z",
            },
            "execution-service": {
                "run_id": "execution-service",
                "job_id": "job-service",
                "status": "running",
            },
        }
        self.operation_reads = 0
        self.next_run = 100
        self.update_ui("execution-service", "running")

    @staticmethod
    def job(identity, **attrs):
        return {
            "job_id": identity,
            "job_name": identity,
            "status": "active",
            "type": "batch",
            "revision": 1,
            "created_at": "2026-01-01T00:00:00Z",
            "resolved_configuration": {},
            "data_generation": 1,
            **attrs,
        }

    def stream_events(self, run_id, *, channel, after_sequence, **_):
        event = None
        if (
            run_id == "execution-live"
            and channel == "responses"
            and after_sequence == 0
        ):
            event = {
                "schema": "mn.runtime.event.v1",
                "type": "run.command.completed",
                "channel": "responses",
                "sequence": 1,
                "observed_ms": 1767225600000,
                "payload": {"command_id": "fixture-command", "status": "completed"},
            }
        feed = SignalFeed(event)
        self.signal_feeds.setdefault(run_id, []).append(feed)
        return feed

    def get_system_summary(self, **_):
        return encoded(
            {
                "nodes": [
                    {
                        "name": NODE_NAME,
                        "address": "127.0.0.1",
                        "self?": True,
                        "hardware": {
                            "cpu": {"logical_processors": 8},
                            "memory": {"total_bytes": 17179869184},
                            "devices": [],
                        },
                    }
                ],
                "jobs": list(self.runs.values()),
            }
        )

    def get_job(self, job_id, **_):
        if job_id not in self.jobs:
            from mn_sdk.errors import AppError

            raise AppError("MN_JOB_NOT_FOUND", "Job not found", http_status=404)
        return encoded(self.jobs[job_id])

    def list_jobs(self, **_):
        return encoded({"items": list(self.jobs.values())})

    def list_runs(self, job_id, page_size=50, page_token="", **_):
        items = [run for run in self.runs.values() if run["job_id"] == job_id]
        start = int(page_token or 0)
        stop = start + page_size
        return encoded(
            {
                "items": items[start:stop],
                "next_page_token": str(stop) if stop < len(items) else None,
            }
        )

    def get_run(self, run_id):
        return encoded(
            {
                **self.runs[run_id],
                "owner_node": NODE_NAME,
                "runtime_run_id": f"output-{run_id}",
            }
        )

    def change_run(self, run_id, status):
        self.runs[run_id]["status"] = status
        if self.runs[run_id]["job_id"] == "job-service":
            self.update_ui(run_id, status)
        return self.get_run(run_id)

    def update_ui(self, run_id, status):
        (self.ui_dir / "web_ui.json").write_text(
            encoded(
                {
                    "job_id": "job-service",
                    "adapter": "external-url",
                    "kind": "service",
                    "url": f"http://127.0.0.1:{WORKER_PORT}/",
                    "title": "Operator UI",
                    "status": status,
                    "metadata": {
                        "execution_id": run_id,
                        "proxy": {"websocket_ports": [WORKER_PORT]},
                    },
                }
            )
        )

    def pause_run(self, run_id):
        return self.change_run(run_id, "paused")

    def resume_run(self, run_id):
        return self.change_run(run_id, "running")

    def cancel_run(self, run_id, **_):
        return self.change_run(run_id, "cancelled")

    def delete_run(self, run_id, **_):
        del self.runs[run_id]
        return encoded({"run_id": run_id, "deleted": True})

    def start_run(self, job_id, run_id=None, replace_existing_run=False, **_):
        self.next_run += 1
        run_id = run_id or f"execution-new-{self.next_run}"
        if replace_existing_run:
            self.runs = {
                key: run for key, run in self.runs.items() if run["job_id"] != job_id
            }
        self.runs[run_id] = {"run_id": run_id, "job_id": job_id, "status": "running"}
        self.jobs[job_id].update(latest_run_id=run_id, run_count=1)
        if job_id == "job-service":
            self.update_ui(run_id, "running")
        return self.get_run(run_id)

    def create_job(
        self, _manifest, _payloads, job_id=None, resolved_configuration=None, **_
    ):
        job_id = job_id or f"job-new-{len(self.jobs)}"
        self.jobs[job_id] = self.job(
            job_id, resolved_configuration=resolved_configuration or {}
        )
        return self.get_job(job_id)

    def archive_job(self, job_id, **_):
        self.jobs[job_id].update(status="archived", revision=2)
        return self.get_job(job_id)

    def delete_job(self, job_id, **_):
        del self.jobs[job_id]
        return encoded({"job_id": job_id, "deleted": True})

    def start_operation(self, kind, options):
        self.operation_reads = 0
        self.operation_job = options["job_id"]
        return encoded({"operation_id": "op-reset", "kind": kind, "status": "running"})

    def get_operation(self, operation_id):
        self.operation_reads += 1
        complete = self.operation_reads >= 2
        if complete:
            self.jobs[self.operation_job]["data_generation"] = 2
        return encoded(
            {
                "operation_id": operation_id,
                "status": "completed" if complete else "running",
            }
        )


def fixture_runtime(home, release_launch):
    from mn_runtime.control_service import RuntimeControlService
    from mn_runtime.services import job_projection, run_projection, state
    from mn_runtime.services.launch_progress import (
        observe_submission,
        progress_reporter,
    )
    from mn_runtime.services.results import FileResult
    from mn_runtime.services.routes import models
    from mn_runtime.services.routes.v1 import blueprints, jobs
    from mn_sdk.proto.runtime_control_pb2_grpc import (
        add_RuntimeControlServiceServicer_to_server,
    )
    import grpc

    core = CoreFixture(home)
    state.client = core
    artifact = home / "events.jsonl"
    artifact.write_text("fixture evidence")

    def compact(run_id, **_):
        run = json.loads(core.get_run(run_id))
        return {
            "job": {
                "job_id": run_id,
                "run_id": run["runtime_run_id"],
                "status": run["status"],
                "graph_id": "test-workflow",
            },
            "agents": [{"id": "reviewer", "status": "running", "role": "Review"}],
            "recent_events": [],
            "artifacts": [
                {
                    "artifact_id": "events_jsonl",
                    "url": f"/api/v1/runs/{run['runtime_run_id']}/artifacts/events.jsonl",
                }
            ],
            "observability_summary": {"counts": {"events": 65}},
        }

    def progress(run_id):
        return {
            "schema_version": 2,
            "job_id": run_id,
            "workflow_id": "test-workflow",
            "status": json.loads(core.get_run(run_id))["status"],
            "workflow_kind": "batch",
            "steps": [
                {
                    "id": "review",
                    "label": "Review evidence",
                    "goal": "Inspect the result",
                    "status": "running",
                    "agents": [
                        {"id": "reviewer", "role": "Review", "status": "running"}
                    ],
                }
            ],
            "agent_count": {"total": 1, "running": 1},
        }

    def launch(_root, _blueprint, request):
        with observe_submission(request.progress_id):
            report = progress_reporter(request.progress_id)
            if report:
                report(
                    "Preparing fixture bundle",
                    "Waiting for the browser to observe progress.",
                    "",
                )
                if not release_launch.wait(timeout=12):
                    raise TimeoutError("Browser did not observe launch progress")
            created = json.loads(
                core.create_job(
                    "{}", {}, resolved_configuration=request.config_overrides
                )
            )
            return json.loads(core.start_run(created["job_id"]))

    catalog = [
        {"id": f"blueprint-{n:03}", "name": f"Blueprint {n:03}", "version": "1.0.0"}
        for n in range(55)
    ]
    blueprints.load_blueprint_catalog = lambda _: (home, catalog)
    blueprints.blueprint_public_projection = lambda value: value
    blueprints.find_blueprint = lambda _, identity: (home, {"id": identity})
    blueprints.blueprint_launch.resolve_async_blueprint_run_request = (
        lambda _, request: request
    )
    blueprints.blueprint_launch.run_blueprint_record = launch
    jobs.load_blueprint_bundle = lambda *_args, **_kwargs: ("{}", {})
    jobs._all_runs = lambda: list(core.runs.values())
    job_projection._compact_job_detail = compact
    job_projection._workflow_progress_snapshot_for_run = progress
    run_projection.get_run_events = lambda *_args, **_kwargs: {
        "data": [
            {
                "id": str(n),
                "type": f"evidence-{n:03}",
                "timestamp": "unknown" if n == 64 else f"2026-01-01T00:00:{n % 60:02}Z",
                "payload": {},
            }
            for n in range(65)
        ]
    }
    run_projection.get_run_artifact = lambda *_args, **_kwargs: FileResult(
        artifact, filename=artifact.name, media_type="text/plain"
    )
    models.list_runtime_models = lambda installed_only=False: {
        "models": [
            {
                "id": f"model-{n:03}",
                "name": f"Model {n:03}",
                "installed": True,
                "provider": "docker_model_runner",
            }
            for n in range(55)
        ]
        + ([] if installed_only else [{"id": "uninstalled", "installed": False}])
    }
    models.benchmark_model = lambda model_id, *_args: {
        "model": model_id,
        "elapsed_ms": 1000,
        "first_token_ms": 50,
        "tokens_per_second": 20,
        "generated_tokens": 20,
        "sample": "Measured reply",
    }

    (home / "runtime.token").write_text(RUNTIME_TOKEN)
    (home / "install_metadata.json").write_text(
        '{"install_role":"runtime","installation_id":"test-runtime"}'
    )
    service = RuntimeControlService(home=home, core_client=core)
    server = grpc.server(ThreadPoolExecutor(max_workers=16))
    add_RuntimeControlServiceServicer_to_server(service, server)
    server.add_insecure_port(f"127.0.0.1:{RUNTIME_PORT}")
    server.start()
    return server, service


def fixture_bundle(home):
    from mn_sdk.blueprints.authoring import write_blueprint_definition

    source = home / "fixture-blueprint"
    write_blueprint_definition(
        source,
        {
            "id": "uploaded",
            "name": "Uploaded blueprint",
            "description": "Browser test",
            "workflow": {"steps": [{"id": "run"}]},
            "agents": {},
            "runtime": {},
        },
    )
    bundle = BytesIO()
    with zipfile.ZipFile(bundle, "w") as archive:
        for path in source.rglob("*"):
            if path.is_file():
                archive.write(path, path.relative_to(source))
    return bundle.getvalue()


def worker_app(core, release_launch):
    from fastapi import FastAPI, WebSocket
    from fastapi.responses import HTMLResponse, Response

    app = FastAPI()

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.post("/fixture-launch-release")
    def finish_launch():
        release_launch.set()

    @app.get("/fixture-signals/{run_id}")
    def signal_status(run_id: str):
        return {
            "active": sum(
                not feed.closed.is_set() for feed in core.signal_feeds.get(run_id, [])
            )
        }

    @app.get("/")
    def fixture_ui():
        return HTMLResponse(
            '<!doctype html><html><head><script src="fixture-app.js" defer></script></head>'
            '<body><h1>Shared operator controls</h1><p id="status"></p></body></html>'
        )

    @app.get("/fixture-app.js")
    def fixture_js():
        return Response(
            f"""
            const url = new URL(window.__MN_JOB_UI_PROXY_BASE__ + '/{WORKER_PORT}/ws/', location.origin);
            url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
            const socket = new WebSocket(url, 'fixture.v1');
            socket.addEventListener('open', () => socket.send('Companion connected'));
            socket.addEventListener('message', event => {{
              document.querySelector('#status').textContent = event.data;
              socket.close();
            }});
            """,
            media_type="text/javascript",
        )

    @app.websocket("/")
    async def companion(socket: WebSocket):
        if (
            "authorization" in socket.headers
            or "fixture.v1" not in socket.scope["subprotocols"]
        ):
            await socket.close(code=1008)
            return
        await socket.accept(subprotocol="fixture.v1")
        await socket.send_text(await socket.receive_text())
        await socket.close()

    return app


def serve(app, port):
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning", lifespan="off")


def main(mode, home):
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
        from fastapi.responses import Response
        from mn_api.app import create_app
        from mn_sdk.runtime_connection import connect
        import grpc

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


if __name__ == "__main__":
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
        main(sys.argv[1], Path(storage))
