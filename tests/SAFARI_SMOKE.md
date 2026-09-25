# Safari smoke tests

The UI test target can drive the real Safari extension and inspect the macOS
Picture-in-Picture window. It uses a small, locally served HTML5 video for
repeatable tab and window tests. Optional live YouTube tests exercise scrolling,
tab switching, window switching, and switching to another Space. The local
fixture needs no network connection; the YouTube tests do.

## One-time setup

1. Build and run the `AutoPiP` scheme with development signing in Xcode.
2. Enable AutoPiP in Safari Settings > Extensions, grant website access to
   `127.0.0.1` and `youtube.com`, and enable AutoPiP's tab, window, and YouTube
   scroll triggers in the popup.
3. Allow Xcode's UI test runner to control the computer if macOS asks. Close
   any existing Picture-in-Picture window before starting.
4. For live YouTube tests, allow autoplay for YouTube in Safari and choose a
   video that starts playing on navigation. Vinegar or another player-changing
   extension can remain enabled. A URL with `autoplay=1` is useful. Confirm
   playback and the correct player once before using the URL for regression
   runs; YouTube's consent pages, ads, and autoplay policy can interfere.

Run the local fixture tests:

```bash
./scripts/run_safari_smoke.sh
```

Run the fixture and live YouTube tests:

```bash
AUTOPIP_YOUTUBE_URL='https://www.youtube.com/watch?v=VIDEO_ID&autoplay=1' \
  ./scripts/run_safari_smoke.sh
```

To test the Space transition, create a full-screen Space immediately to the
right of Safari and enable the macOS Control-Right/Control-Left shortcuts for
moving between Spaces. Then run the same command with
`AUTOPIP_TEST_SPACE=1`. The Space case is skipped otherwise.

The script starts a temporary HTTP server on `127.0.0.1:8765`, runs only
`SafariSmokeTests`, and stops the server afterward. The tests open their own
tab in the active Safari window and close it at the end. Run them in a logged-in
desktop session while Safari is free for automation. The test runner needs a
signed build for the Safari extension; `CODE_SIGNING_ALLOWED=NO` is suitable only for compiling
the tests.

The live tests verify the actual PiP window but depend on YouTube's current UI,
autoplay behavior, and network availability. The local fixture covers the
extension's generic HTML5 path. Other providers should get their own live
smoke case before claiming they have been tested.
