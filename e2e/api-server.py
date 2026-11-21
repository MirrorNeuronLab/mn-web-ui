"""Start a local service for the Playwright API tests."""

import sys

from api_fixture.server import run

if __name__ == "__main__":
    run(sys.argv[1])
