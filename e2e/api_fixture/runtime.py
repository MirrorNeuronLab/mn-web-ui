"""Start the native gRPC runtime using the deterministic Core."""

import json
from concurrent.futures import ThreadPoolExecutor

from .core import CoreFixture
from .settings import RUNTIME_PORT, RUNTIME_TOKEN


def fixture_runtime(home, release_launch):
    import grpc
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
