import XCTest

@MainActor
final class SafariSmokeTests: XCTestCase {
    private let safari = XCUIApplication(bundleIdentifier: "com.apple.Safari")
    private let pipAgent = XCUIApplication(bundleIdentifier: "com.apple.PIPAgent")
    private let fixtureID = UUID().uuidString
    private var openedTestTab = false
    private var openedSwitchTab = false

    override func setUpWithError() throws {
        continueAfterFailure = false
        guard ProcessInfo.processInfo.environment["AUTOPIP_FIXTURE_URL"] != nil else {
            throw XCTSkip("Run scripts/run_safari_smoke.sh to start the local video fixture")
        }
        if name.contains("YouTube"), ProcessInfo.processInfo.environment["AUTOPIP_YOUTUBE_URL"] == nil {
            throw XCTSkip("Set AUTOPIP_YOUTUBE_URL to run live YouTube/Vinegar tests")
        }
        if name.contains("SpaceSwitch"), ProcessInfo.processInfo.environment["AUTOPIP_TEST_SPACE"] != "1" {
            throw XCTSkip("Set AUTOPIP_TEST_SPACE=1 with a full-screen Space to the right")
        }

        // Running the signed host app makes the development extension available to Safari.
        XCUIApplication().launch()
        safari.activate()
        safari.typeKey("t", modifierFlags: .command)
        openedTestTab = true
    }

    override func tearDownWithError() throws {
        if openedTestTab {
            safari.activate()
            if openedSwitchTab {
                safari.typeKey("w", modifierFlags: .command)
            }
            safari.typeKey("w", modifierFlags: .command)
        }
    }

    func testFixtureTabSwitch() throws {
        try openFixture()

        try openSwitchTab()

        safari.typeKey(XCUIKeyboardKey.tab, modifierFlags: [.control, .shift])
        XCTAssertTrue(safari.staticTexts["Playback \(fixtureID): playing"].waitForExistence(timeout: 10))
        let initialHistory = fixtureHistory.value as? String ?? ""

        safari.typeKey(XCUIKeyboardKey.tab, modifierFlags: .control)
        XCTAssertTrue(safari.staticTexts["AutoPiP Switch Tab"].waitForExistence(timeout: 5))
        XCTAssertTrue(pipWindow.waitForExistence(timeout: 5), "PiP window did not open on tab switch")

        safari.typeKey(XCUIKeyboardKey.tab, modifierFlags: [.control, .shift])
        assertFixtureTransition(after: initialHistory, trigger: "tab switch")
        XCTAssertTrue(pipWindow.waitForNonExistence(timeout: 5), "PiP window did not close on tab return")

        safari.typeKey(XCUIKeyboardKey.tab, modifierFlags: .control)
        safari.typeKey("w", modifierFlags: .command)
        openedSwitchTab = false
        XCTAssertTrue(safari.staticTexts["PiP \(fixtureID): inline"].exists)
    }

    func testFixtureWindowSwitch() throws {
        try openFixture()
        let initialHistory = fixtureHistory.value as? String ?? ""

        XCUIApplication(bundleIdentifier: "com.apple.finder").activate()
        XCTAssertTrue(pipWindow.waitForExistence(timeout: 5), "PiP window did not open on window switch")

        safari.activate()
        assertFixtureTransition(after: initialHistory, trigger: "window switch")
        XCTAssertTrue(pipWindow.waitForNonExistence(timeout: 5), "PiP window did not close on window return")
        XCTAssertTrue(safari.staticTexts["PiP \(fixtureID): inline"].exists)
    }

    func testYouTubeTabSwitch() throws {
        try openYouTube()

        try openSwitchTab()
        safari.typeKey(XCUIKeyboardKey.tab, modifierFlags: [.control, .shift])
        safari.typeKey(XCUIKeyboardKey.tab, modifierFlags: .control)
        XCTAssertTrue(pipWindow.waitForExistence(timeout: 8), "YouTube PiP did not open on tab switch")

        safari.typeKey(XCUIKeyboardKey.tab, modifierFlags: [.control, .shift])
        XCTAssertTrue(pipWindow.waitForNonExistence(timeout: 8), "YouTube PiP did not close on return")

        safari.typeKey(XCUIKeyboardKey.tab, modifierFlags: .control)
        safari.typeKey("w", modifierFlags: .command)
        openedSwitchTab = false
    }

    func testYouTubeWindowSwitch() throws {
        try openYouTube()

        XCUIApplication(bundleIdentifier: "com.apple.finder").activate()
        XCTAssertTrue(pipWindow.waitForExistence(timeout: 8), "YouTube PiP did not open on window switch")

        safari.activate()
        XCTAssertTrue(pipWindow.waitForNonExistence(timeout: 8), "YouTube PiP did not close on return")
    }

    func testYouTubeScroll() throws {
        try openYouTube()

        let page = safari.webViews.firstMatch
        XCTAssertTrue(page.waitForExistence(timeout: 10))
        page.scroll(byDeltaX: 0, deltaY: 1200)
        XCTAssertTrue(pipWindow.waitForExistence(timeout: 8), "YouTube PiP did not open after scrolling")

        page.scroll(byDeltaX: 0, deltaY: -1200)
        XCTAssertTrue(pipWindow.waitForNonExistence(timeout: 8), "YouTube PiP did not close after scrolling back")
    }

    func testYouTubeSpaceSwitch() throws {
        try openYouTube()

        safari.typeKey(XCUIKeyboardKey.rightArrow, modifierFlags: .control)
        XCTAssertTrue(pipWindow.waitForExistence(timeout: 8), "YouTube PiP did not open on Space switch")

        safari.typeKey(XCUIKeyboardKey.leftArrow, modifierFlags: .control)
        XCTAssertTrue(pipWindow.waitForNonExistence(timeout: 8), "YouTube PiP did not close on Space return")
    }

    private var pipWindow: XCUIElement {
        pipAgent.windows.firstMatch
    }

    private var fixtureHistory: XCUIElement {
        safari.textFields["PiP transitions \(fixtureID)"]
    }

    private func assertFixtureTransition(after initialHistory: String, trigger: String) {
        var history = fixtureHistory.value as? String ?? ""
        for _ in 0..<10 where history == initialHistory {
            Thread.sleep(forTimeInterval: 0.5)
            history = fixtureHistory.value as? String ?? ""
        }
        let events = safari.textFields["Visibility events \(fixtureID)"].value as? String ?? "unavailable"
        XCTAssertNotEqual(history, initialHistory, "No PiP transition on \(trigger). History: \(history). Events: \(events)")
        XCTAssertTrue(history.contains("picture-in-picture"), "PiP was never entered on \(trigger): \(history)")
        XCTAssertTrue(history.hasSuffix(", inline"), "PiP did not close on \(trigger): \(history)")
    }

    private func openFixture() throws {
        let url = try XCTUnwrap(ProcessInfo.processInfo.environment["AUTOPIP_FIXTURE_URL"])
        open("\(url)?id=\(fixtureID)")

        XCTAssertTrue(safari.buttons["Play test video \(fixtureID)"].waitForExistence(timeout: 10), "Local test page did not load")
        safari.typeKey(" ", modifierFlags: [])
        XCTAssertTrue(safari.staticTexts["Playback \(fixtureID): playing"].waitForExistence(timeout: 10), "Local video did not start playing")
        XCTAssertTrue(fixtureHistory.waitForExistence(timeout: 5))
        XCTAssertFalse(pipWindow.exists, "Close any existing PiP window before running smoke tests")
    }

    private func openSwitchTab() throws {
        let fixtureURL = try XCTUnwrap(URL(string: ProcessInfo.processInfo.environment["AUTOPIP_FIXTURE_URL"] ?? ""))
        safari.typeKey("t", modifierFlags: .command)
        openedSwitchTab = true
        open(fixtureURL.deletingLastPathComponent().appendingPathComponent("switch.html").absoluteString)
        XCTAssertTrue(safari.staticTexts["AutoPiP Switch Tab"].waitForExistence(timeout: 10))
    }

    private func openYouTube() throws {
        guard let url = ProcessInfo.processInfo.environment["AUTOPIP_YOUTUBE_URL"], !url.isEmpty else {
            throw XCTSkip("Set AUTOPIP_YOUTUBE_URL to run live YouTube/Vinegar tests")
        }
        open(url)
        XCTAssertTrue(safari.webViews.firstMatch.waitForExistence(timeout: 15))
        XCTAssertFalse(pipWindow.exists, "Close any existing PiP window before running smoke tests")
    }

    private func open(_ url: String) {
        safari.typeKey("l", modifierFlags: .command)
        safari.typeText(url)
        safari.typeKey(XCUIKeyboardKey.return, modifierFlags: [])
    }
}
