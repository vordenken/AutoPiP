//
//  UpdateController.swift
//  AutoPiP
//
//  Created by vordenken on 26.11.24.
//

import Sparkle

class UpdateController {
    private let updaterController: SPUStandardUpdaterController

    init() {
        // Initialize the updater
        updaterController = SPUStandardUpdaterController(
            startingUpdater: true,
            updaterDelegate: nil,
            userDriverDelegate: nil
        )
    }
    
    func checkForUpdates() {
        updaterController.checkForUpdates(nil)
    }
}
