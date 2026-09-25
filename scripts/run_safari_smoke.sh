#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT=8765

python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT_DIR/tests/fixtures" >/dev/null 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT

for attempt in 1 2 3 4 5 6 7 8 9 10; do
    if curl --fail --silent --output /dev/null "http://127.0.0.1:$PORT/video.html"; then
        break
    fi
    sleep 0.2
done

if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "Could not start the local video fixture on port $PORT" >&2
    exit 1
fi

export TEST_RUNNER_AUTOPIP_FIXTURE_URL="http://127.0.0.1:$PORT/video.html"
if [[ -n "${AUTOPIP_YOUTUBE_URL:-}" ]]; then
    export TEST_RUNNER_AUTOPIP_YOUTUBE_URL="$AUTOPIP_YOUTUBE_URL"
fi
if [[ "${AUTOPIP_TEST_SPACE:-}" == "1" ]]; then
    export TEST_RUNNER_AUTOPIP_TEST_SPACE=1
fi

xcodebuild test -quiet \
    -project "$ROOT_DIR/AutoPiP.xcodeproj" \
    -scheme AutoPiP \
    -destination 'platform=macOS,arch=arm64' \
    -only-testing:AutoPiPUITests/SafariSmokeTests \
    -parallel-testing-enabled NO
