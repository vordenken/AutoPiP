cask "autopip" do
  version "2.1.0"
  sha256 "1f7a0f647c577b44e51d0ac5e450804369ada9d522d75fe4371855d5e768f01a"

  url "https://github.com/vordenken/AutoPiP/releases/download/v#{version}/AutoPiP.dmg"
  name "AutoPiP"
  desc "Safari extension for automatic Picture-in-Picture video playback"
  homepage "https://github.com/vordenken/AutoPiP"

  livecheck do
    url "https://raw.githubusercontent.com/vordenken/AutoPiP/main/appcast.xml"
    strategy :sparkle do |items|
      items.find { |item| item.channel.nil? }&.short_version
    end
  end

  auto_updates true
  depends_on macos: :ventura

  app "AutoPiP.app"

  preflight_steps do
    run "/usr/bin/xattr",
        args:         ["-dr", "com.apple.quarantine", "{{staged_path}}/AutoPiP.app"],
        must_succeed: false
  end

  uninstall quit: "com.vd.AutoPiP"

  zap trash: [
    "~/Library/Application Scripts/com.vd.AutoPiP",
    "~/Library/Application Scripts/com.vd.AutoPiP.Extension",
    "~/Library/Containers/com.vd.AutoPiP",
    "~/Library/Containers/com.vd.AutoPiP.Extension",
  ]

  caveats <<~EOS
    AutoPiP is not notarized. This cask removes its quarantine attribute during
    installation so macOS does not block the first launch.

    Launch AutoPiP once, then enable the extension in Safari Settings > Extensions.
  EOS
end
