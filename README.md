<p align="center">
  <a href="#">
    <img height="128" width="128" src="https://raw.github.com/vordenken/AutoPiP/main/AutoPiP/Assets.xcassets/AppIcon.appiconset/icon_512x512%402x.png">
  </a>
  <h1 align="center">AutoPiP for Safari</h1>
</p>

<p align="center">
  <img src="https://img.shields.io/github/downloads/vordenken/AutoPiP/total" alt="Downloads">
  <img src="https://img.shields.io/github/license/vordenken/AutoPiP" alt="License">
  <a href="https://makeapullrequest.com"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome"></a>
</p>

A Safari extension that automatically enables Picture-in-Picture (PiP) mode for videos when switching tabs or scrolling to comments.

## ✨ Features

- Automatic PiP when switching tabs or scrolling to YouTube comments
- Smart detection of actively playing videos
- Automatic disable when returning to video tab
- Support for multiple streaming platforms
- Global on/off toggle to temporarily disable AutoPiP without removing the extension
- Configurable keyboard shortcut to manually trigger PiP (default: ⌥P)
- Blacklist / Whitelist mode to control which sites AutoPiP is active on

## 🚀 Quick Start

1. Download the latest release [here](https://github.com/vordenken/AutoPiP/releases)
2. Install and enable the Safari extension
3. Start watching videos - PiP activates automatically!

> **Updating:** To receive updates, open the AutoPiP app from time to time. Sparkle checks for updates automatically (once per day).

### 🍺 Install with Homebrew

```sh
brew tap vordenken/autopip https://github.com/vordenken/AutoPiP
brew install --cask vordenken/autopip/autopip
```

## 🎯 Compatibility

| ✅ Supported | ❌ Not Supported | ⁉️ Untested |
|-------------|-----------------|------------|
| YouTube     | Amazon Prime    | MAX        |
| Twitch      | Apple TV+*     |            |
| Disney+     |                |            |
| Paramount+  |                |            |
| Netflix     |                |            |
| Jellyfin    |                |            |

*AppleTV opens the native app instead of Safari

> Most HTML5 video players should work. Compatibility may vary based on DRM restrictions and Safari/macOS versions.

## 💻 Requirements

- macOS 13.5 or later
- Safari 16 or later

> I wanted to add Chrome/Firefox support but Safari is the only browser that allows calling PiP without user-interaction - So unless this changes, AutoPiP will be Safari only

## 🤝 Contributing

As this is my first Swift/Xcode project, I welcome:
- Code reviews and suggestions
- Feature improvements
- Bug reports and fixes

*New to contributing?* Check out our [contributing guide](CONTRIBUTING.md).

## ❤️ Support

If you find AutoPiP helpful, consider supporting its development:

<p align="center">
  <a href="https://www.buymeacoffee.com/vordenken">
    <img src="https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png" alt="Buy Me A Coffee">
  </a>
  <a href="https://ko-fi.com/vordenken">
    <img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Ko-fi">
  </a>
</p>

## 📝 License & Privacy

- Licensed under GNU GPLv3 - see [LICENSE](LICENSE) file
- No personal data collection - see [Privacy Policy](PRIVACY.md)

## 🙏 Acknowledgments

- Inspired by various PiP extensions
- Built with Safari Web Extension technology
- Thanks to the Swift and Safari development community for resources and documentation
- Updates via [Sparkle](https://sparkle-project.org)
- Icons by [icons8](https://icons8.com)

---
Created by vordenken
