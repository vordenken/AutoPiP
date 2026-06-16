//
//  ViewController.swift
//  AutoPiP
//
//  Created by vordenken on 18.11.24.
//

import Cocoa
import SafariServices
import WebKit

let extensionBundleIdentifier = "com.vd.AutoPiP.Extension"

class ViewController: NSViewController, WKNavigationDelegate, WKScriptMessageHandler {

    @IBOutlet var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()

        self.webView.navigationDelegate = self

        self.webView.configuration.userContentController.add(self, name: "controller")

        self.webView.loadFileURL(Bundle.main.url(forResource: "Main", withExtension: "html")!, allowingReadAccessTo: Bundle.main.resourceURL!)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String {
            webView.evaluateJavaScript("setVersion('\(version)')")
        }

        let onboardingDone = UserDefaults.standard.bool(forKey: "OnboardingCompleted")

        if !onboardingDone {
            webView.evaluateJavaScript("startOnboarding()")
            return
        }

        showMainView()
    }

    private func showMainView() {
        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleIdentifier) { (state, error) in
            DispatchQueue.main.async {
                guard let state = state, error == nil else {
                    self.webView.evaluateJavaScript("show(null, true)")
                    return
                }

                if #available(macOS 13, *) {
                    self.webView.evaluateJavaScript("show(\(state.isEnabled), true)")
                } else {
                    self.webView.evaluateJavaScript("show(\(state.isEnabled), false)")
                }
            }
        }

        if let appDelegate = NSApp.delegate as? AppDelegate {
            let uc = appDelegate.updateController
            let json = """
            {autoCheck:\(uc.automaticallyChecksForUpdates),autoDownload:\(uc.automaticallyDownloadsUpdates),beta:\(uc.isBetaUpdatesEnabled)}
            """
            webView.evaluateJavaScript("setUpdateSettings(\(json))")
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? String else { return }

        if body == "open-preferences" {
            openSafariAndQuit()
            return
        }

        if body.hasPrefix("open-url:") {
            let urlString = String(body.dropFirst("open-url:".count))
            if let url = URL(string: urlString) {
                NSWorkspace.shared.open(url)
            }
            return
        }

        if body.hasPrefix("onboarding-done:") {
            let jsonString = String(body.dropFirst("onboarding-done:".count))
            handleOnboardingDone(jsonString)
            return
        }

        guard let uc = (NSApp.delegate as? AppDelegate)?.updateController else { return }

        switch body {
        case "check-for-updates":
            uc.checkForUpdates()
        case let s where s.hasPrefix("set-auto-check:"):
            uc.automaticallyChecksForUpdates = s.hasSuffix("true")
        case let s where s.hasPrefix("set-auto-download:"):
            uc.automaticallyDownloadsUpdates = s.hasSuffix("true")
        case let s where s.hasPrefix("set-beta:"):
            uc.isBetaUpdatesEnabled = s.hasSuffix("true")
        default:
            break
        }
    }

    private func handleOnboardingDone(_ jsonString: String) {
        guard let data = jsonString.data(using: .utf8),
              let settings = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let uc = (NSApp.delegate as? AppDelegate)?.updateController else { return }

        if let autoCheck = settings["autoCheck"] as? Bool {
            uc.automaticallyChecksForUpdates = autoCheck
        }
        if let autoDownload = settings["autoDownload"] as? Bool {
            uc.automaticallyDownloadsUpdates = autoDownload
        }
        if let beta = settings["beta"] as? Bool {
            uc.isBetaUpdatesEnabled = beta
        }

        UserDefaults.standard.set(true, forKey: "OnboardingCompleted")
        openSafariAndQuit()
    }

    private func openSafariAndQuit() {
        SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { error in
            DispatchQueue.main.async {
                if error != nil, let safariURL = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.apple.Safari") {
                    NSWorkspace.shared.openApplication(at: safariURL, configuration: NSWorkspace.OpenConfiguration())
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    NSApplication.shared.terminate(nil)
                }
            }
        }
    }

}
