"""Deterministic Core responses and event streams for browser tests."""

import json
from threading import Event

from .settings import WORKER_PORT

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
