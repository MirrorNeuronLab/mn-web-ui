"""The test worker HTTP service and its authenticated WebSocket."""

from .settings import WORKER_PORT


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
