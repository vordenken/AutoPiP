//Created by vordenken on 26.11.24
//UpdateController.swift

import Sparkle

private class UpdaterDelegate: NSObject, SPUUpdaterDelegate {
    func allowedChannels(for updater: SPUUpdater) -> Set<String> {
        UserDefaults.standard.bool(forKey: "BetaUpdatesEnabled") ? Set(["beta"]) : Set()
    }
}

class UpdateController {
    private let delegate = UpdaterDelegate()
    private let updaterController: SPUStandardUpdaterController
    
    var updater: SPUUpdater { updaterController.updater }
    
    init() {
        updaterController = SPUStandardUpdaterController(
            startingUpdater: true,
            updaterDelegate: delegate,
            userDriverDelegate: nil
        )
    }
    
    func checkForUpdates() {
        updaterController.checkForUpdates(nil)
    }
    
    var automaticallyChecksForUpdates: Bool {
        get { updater.automaticallyChecksForUpdates }
        set { updater.automaticallyChecksForUpdates = newValue }
    }
    
    var automaticallyDownloadsUpdates: Bool {
        get { updater.automaticallyDownloadsUpdates }
        set { updater.automaticallyDownloadsUpdates = newValue }
    }
    
    var isBetaUpdatesEnabled: Bool {
        get { UserDefaults.standard.bool(forKey: "BetaUpdatesEnabled") }
        set {
            UserDefaults.standard.set(newValue, forKey: "BetaUpdatesEnabled")
            updater.resetUpdateCycleAfterShortDelay()
        }
    }
}
