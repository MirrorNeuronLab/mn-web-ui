"""Local blueprint catalog and ZIP upload for browser integration tests."""

import json
import zipfile
from io import BytesIO
from pathlib import Path


def write_blueprint(path: Path, blueprint_id: str, name: str) -> None:
    from mn_sdk.blueprints.authoring import write_blueprint_definition

    write_blueprint_definition(
        path,
        {
            "id": blueprint_id,
            "name": name,
            "description": "Browser test",
            "workflow": {"steps": [{"id": "run"}]},
            "agents": {},
            "runtime": {},
        },
    )


def write_catalog(home: Path) -> Path:
    catalog = home / "catalog"
    ids = [f"blueprint-{n:03}" for n in range(55)]
    for n, identity in enumerate(ids):
        write_blueprint(catalog / identity, identity, f"Blueprint {n:03}")
    (catalog / "index.json").write_text(json.dumps(ids), encoding="utf-8")
    return catalog


def fixture_bundle(home: Path) -> bytes:
    source = home / "fixture-blueprint"
    write_blueprint(source, "uploaded", "Uploaded blueprint")
    bundle = BytesIO()
    with zipfile.ZipFile(bundle, "w") as archive:
        for path in source.rglob("*"):
            if path.is_file():
                archive.write(path, path.relative_to(source))
    return bundle.getvalue()
