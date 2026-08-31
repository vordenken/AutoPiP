//
//  AutoPiPTests.swift
//  AutoPiPTests
//
//  Created by vordenken on 18.11.24.
//

import Testing
@testable import AutoPiP

struct AutoPiPTests {

    @Test func parsesOnboardingSettings() throws {
        let settings = try #require(OnboardingSettings(
            jsonString: #"{"autoCheck":true,"autoDownload":false,"beta":true}"#
        ))

        #expect(settings.autoCheck == true)
        #expect(settings.autoDownload == false)
        #expect(settings.beta == true)
    }

    @Test func ignoresInvalidSettingTypesIndividually() throws {
        let settings = try #require(OnboardingSettings(
            jsonString: #"{"autoCheck":true,"autoDownload":"yes"}"#
        ))

        #expect(settings.autoCheck == true)
        #expect(settings.autoDownload == nil)
        #expect(settings.beta == nil)
    }

    @Test func rejectsMalformedOnboardingJSON() {
        #expect(OnboardingSettings(jsonString: "not-json") == nil)
    }

}
