"""Serve current mn-api routes with isolated, deterministic runtime dependencies.

No real Core, Docker, catalog preparation, models, or user storage is used.
HTTP routing, authentication, validation, pagination, ETags, SSE and the Web UI
reverse proxy come from the sibling API, not a copy in the browser tests.
"""
import json
from io import BytesIO
import os
from pathlib import Path
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(os.environ.get("MN_WEB_E2E_API_SOURCE", str(ROOT.parent / "mn-api")))
SDK = SOURCE.parent / "mn-python-sdk"
sys.path.insert(0, str(SOURCE))
sys.path.insert(0, str(SDK))
for package in (SDK / "packages").glob("*/src"):
    sys.path.insert(0, str(package))

storage = tempfile.TemporaryDirectory(prefix="mn-web-ui-api-")
Path(storage.name, "index.json").write_text('{"blueprints": []}')
os.environ["MN_HOME"] = storage.name
os.environ["MN_HOST_SHARED_STORAGE_ROOT"] = storage.name
os.environ["MN_BLUEPRINT_SOURCE"] = "local"
os.environ["MN_BLUEPRINT_LOCAL"] = storage.name

import uvicorn  # noqa: E402

if sys.argv[1] == "web":
    from mn_api.web_ui_server import create_app
    app = create_app(ROOT / "dist", api_url="http://127.0.0.1:54009/api/v1")
    uvicorn.run(app, host="127.0.0.1", port=4174, log_level="warning", lifespan="off")
    sys.exit(0)

from fastapi.responses import HTMLResponse, Response  # noqa: E402
from fastapi import HTTPException  # noqa: E402
from mn_api import state  # noqa: E402
from mn_api.app import create_app  # noqa: E402
from mn_api.routes import jobs as monitor, runs as outputs, models  # noqa: E402
from mn_api.routes.v1 import jobs, blueprints  # noqa: E402
from mn_sdk.blueprints.authoring import write_blueprint_definition  # noqa: E402


def encoded(value):
    return json.dumps(value)


class Runtime:
    def __init__(self):
        self.jobs = {
            "job-history": self.job("job-history", run_count=51, latest_run_id="execution-live"),
            "job-ready": self.job("job-ready"),
            "job-service": self.job("job-service", type="service", run_count=1, latest_run_id="execution-service"),
        }
        self.runs = {
            **{f"execution-{n:03}": {"run_id": f"execution-{n:03}", "job_id": "job-history", "status": "completed", "created_at": f"2026-01-01T00:00:{n:02}Z"} for n in range(50)},
            "execution-live": {"run_id": "execution-live", "job_id": "job-history", "status": "running", "created_at": "2026-01-02T00:00:00Z"},
            "execution-service": {"run_id": "execution-service", "job_id": "job-service", "status": "running"},
        }
        self.operation_reads = 0
        self.next_run = 100

    @staticmethod
    def job(identity, **attrs):
        return {"job_id": identity, "job_name": identity, "status": "active", "type": "batch", "revision": 1, "created_at": "2026-01-01T00:00:00Z", "resolved_configuration": {}, "data_generation": 1, **attrs}

    def get_system_summary(self):
        return encoded({"nodes": [{"name": "Test PC", "self": True, "hardware": {"cpu": {"logical_processors": 8}, "memory": {"total_bytes": 17179869184}, "devices": []}}], "jobs": list(self.runs.values())})

    def get_job(self, job_id, **_):
        if job_id not in self.jobs:
            raise HTTPException(404, "Job not found")
        return encoded(self.jobs[job_id])

    def list_jobs(self, **_):
        return encoded({"items": list(self.jobs.values())})

    def list_runs(self, job_id, page_size=50, page_token="", **_):
        items = [run for run in self.runs.values() if run["job_id"] == job_id]
        start = int(page_token or 0)
        stop = start + page_size
        return encoded({"items": items[start:stop], "next_page_token": str(stop) if stop < len(items) else None})

    def get_run(self, run_id):
        return encoded({**self.runs[run_id], "runtime_run_id": f"output-{run_id}"})

    def change_run(self, run_id, status):
        self.runs[run_id]["status"] = status
        return self.get_run(run_id)

    def pause_run(self, run_id):
        return self.change_run(run_id, "paused")

    def resume_run(self, run_id):
        return self.change_run(run_id, "running")

    def cancel_run(self, run_id):
        return self.change_run(run_id, "cancelled")

    def delete_run(self, run_id, **_):
        del self.runs[run_id]
        return encoded({"run_id": run_id, "deleted": True})

    def start_run(self, job_id, run_id=None, replace_existing_run=False, **_):
        self.next_run += 1
        run_id = run_id or f"execution-new-{self.next_run}"
        if replace_existing_run:
            self.runs = {key: run for key, run in self.runs.items() if run["job_id"] != job_id}
        self.runs[run_id] = {"run_id": run_id, "job_id": job_id, "status": "running"}
        self.jobs[job_id].update(latest_run_id=run_id, run_count=1)
        return self.get_run(run_id)

    def create_job(self, _manifest, _payloads, job_id=None, resolved_configuration=None, **_):
        job_id = job_id or f"job-new-{len(self.jobs)}"
        self.jobs[job_id] = self.job(job_id, resolved_configuration=resolved_configuration or {})
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
        return encoded({"operation_id": operation_id, "status": "completed" if complete else "running"})


runtime = Runtime()
state.client = runtime
state.BUNDLE_UPLOAD_ROOT = Path(storage.name) / "uploads"


def compact(run_id, **_):
    run_id = run_id.removeprefix("output-")
    run = runtime.runs[run_id]
    return {"job": {"job_id": run_id, "run_id": f"output-{run_id}", "status": run["status"], "graph_id": "test-workflow"}, "agents": [{"id": "reviewer", "status": "running", "role": "Review"}], "recent_events": [], "artifacts": [{"artifact_id": "events_jsonl", "url": f"/api/v1/runs/output-{run_id}/artifacts/events.jsonl"}], "observability_summary": {"counts": {"events": 65}}}


def progress(run_id):
    return {"schema_version": 2, "job_id": run_id, "workflow_id": "test-workflow", "status": runtime.runs[run_id]["status"], "workflow_kind": "batch", "steps": [{"id": "review", "label": "Review evidence", "goal": "Inspect the result", "status": "running", "agents": [{"id": "reviewer", "role": "Review", "status": "running"}]}], "agent_count": {"total": 1, "running": 1}}


catalog = [{"id": f"blueprint-{n:03}", "name": f"Blueprint {n:03}", "version": "1.0.0"} for n in range(55)]
blueprints.load_blueprint_catalog = lambda _: (Path(storage.name), catalog)
blueprints.blueprint_public_projection = lambda value: value
blueprints.find_blueprint = lambda _, identity: (Path(storage.name), {"id": identity})
blueprints.legacy_blueprints.resolve_async_blueprint_run_request = lambda _, request: request


def launch(_root, blueprint, request):
    created = json.loads(runtime.create_job("{}", {}, resolved_configuration=request.config_overrides))
    return json.loads(runtime.start_run(created["job_id"]))


blueprints.legacy_blueprints.run_blueprint_record = launch
jobs.local_blueprint_from_path = lambda _: (Path(storage.name), {"id": "uploaded"})
jobs.load_blueprint_bundle = lambda *_args, **_kwargs: (encoded({"apiVersion": "mn.workflow/v1", "kind": "Workflow", "id": "test", "manifest_version": "1.0", "job_name": "test", "contract": {"inputs": {}, "outputs": {}}, "workflow": {"schema": "mn.workflow.problem_graph/v1", "workflow_id": "test", "steps": [{"id": "start"}], "edges": []}, "agents": {"nodes": [], "edges": []}, "runtime": {}}), {})
jobs._all_runs = lambda: list(runtime.runs.values())
monitor._compact_job_detail = compact
monitor._workflow_progress_snapshot_for_run = progress
outputs.get_run_events = lambda *_args, **_kwargs: {"data": [{"id": str(n), "type": f"evidence-{n:03}", "timestamp": "unknown" if n == 64 else f"2026-01-01T00:00:{n % 60:02}Z", "payload": {}} for n in range(65)]}
outputs.get_run_artifact = lambda *_args, **_kwargs: Response("fixture evidence", media_type="text/plain")
models.list_runtime_models = lambda installed_only=False: {"models": [{"id": f"model-{n:03}", "name": f"Model {n:03}", "installed": True, "provider": "docker_model_runner"} for n in range(55)] + ([] if installed_only else [{"id": "uninstalled", "installed": False}])}
models.benchmark_model = lambda model_id, *_args: {"model": model_id, "elapsed_ms": 1000, "first_token_ms": 50, "tokens_per_second": 20, "generated_tokens": 20, "sample": "Measured reply"}


def job_ui(job_id, *_args):
    latest = runtime.jobs[job_id].get("latest_run_id")
    status = runtime.runs[latest]["status"] if latest else "stopped"
    return {"job_id": job_id, "ui": {"renderer": "external-url", "title": "Operator UI"}, "web_ui": {"adapter": "external-url", "kind": "service", "url": "http://127.0.0.1:54009/fixture-ui", "title": "Operator UI", "status": status, "metadata": {"proxy": {"http_ports": [54009]}}}}


monitor.get_job_ui = job_ui
app = create_app()

bundle_source = Path(storage.name) / "fixture-blueprint"
write_blueprint_definition(bundle_source, {
    "id": "uploaded", "name": "Uploaded blueprint", "description": "Browser test",
    "workflow": {"steps": [{"id": "run"}]}, "agents": {}, "runtime": {},
})
bundle_bytes = BytesIO()
with zipfile.ZipFile(bundle_bytes, "w") as archive:
    for path in bundle_source.rglob("*"):
        if path.is_file():
            archive.writestr(path.relative_to(bundle_source).as_posix(), path.read_bytes())


@app.get("/api/v1/test/bundle")
def fixture_bundle():
    return Response(bundle_bytes.getvalue(), media_type="application/zip")


@app.get("/fixture-ui")
def fixture_ui():
    return HTMLResponse("<html><body><h1>Shared operator controls</h1></body></html>")


uvicorn.run(app, host="127.0.0.1", port=54009, log_level="warning", lifespan="off")
