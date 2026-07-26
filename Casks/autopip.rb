cask "autopip" do
  version "2.0.0"
  sha256 "8e095a94c466f02fa6b43833548d5aa73848793272132150ecb9d745613bc755"

  url "https://github.com/vordenken/AutoPiP/releases/download/v#{version}/AutoPiP.dmg"
  name "AutoPiP"
  name "AutoPiP for Safari"
  desc "Safari extension for automatic Picture-in-Picture video playback"
  homepage "https://github.com/vordenken/AutoPiP"

  # The appcast carries both channels: beta items have a <sparkle:channel>,
  # stable items have none. Pick the newest item without a channel.
  livecheck do
    url "https://raw.githubusercontent.com/vordenken/autopip/main/appcast.xml"
    strategy :sparkle do |items|
      items.find { |item| item.channel.nil? }&.short_version
    end
  end

  auto_updates true
  # The app requires macOS 13.5; Homebrew can only express major releases.
  depends_on macos: :ventura

  app "AutoPiP.app"

  # Releases are signed with an "Apple Development" certificate rather than a
  # Developer ID, and carry no notarization ticket — `spctl -a -t execute`
  # rejects the bundle outright. Homebrew quarantines what it installs, and
  # Gatekeeper answers a quarantined app it rejects by refusing the first
  # launch, so the attribute has to be gone before the app is ever opened.
  #
  # This runs in `preflight`, not `postflight`, and that is the whole point.
  # Homebrew applies quarantine to the *staged* copy in the Caskroom (see
  # Quarantine.propagate, called from Cask::Download#extract_primary_container),
  # and PreflightBlock sorts ahead of App in Artifact::AbstractArtifact's
  # sort_order — so this fires after staging but before the bundle is moved
  # into /Applications. Clearing it there needs nothing but write access to
  # Homebrew's own cache.
  #
  # Doing it in postflight instead would target the bundle after it has landed
  # in /Applications, and macOS 14+ gates modifying an installed app bundle
  # behind the App Management (TCC) permission, which the calling terminal has
  # usually not been granted. The xattr call would fail with "Operation not
  # permitted" and the install would report success while leaving an app macOS
  # refuses to launch.
  #
  # `command.run` rather than `system_command`: the latter raises on a non-zero
  # exit. `xattr -dr` exits non-zero for any file that does not carry the
  # attribute — symlinks, which Quarantine.propagate skips, and every file at
  # all once releases are notarized or when installing with
  # HOMEBREW_CASK_OPTS=--no-quarantine. That would turn a no-op into a failed
  # install. `run` defaults to must_succeed: false; stated explicitly so the
  # tolerance is deliberate.
  preflight do
    command.run "/usr/bin/xattr",
                args:         ["-dr", "com.apple.quarantine", "#{staged_path}/AutoPiP.app"],
                must_succeed: false
  end

  # Belt and braces: the launched bundle is the one in /Applications, so verify
  # it there. Gatekeeper keys the launch decision off the attribute on the app
  # bundle itself, so checking the root is the check that matters.
  #
  # If it is somehow still quarantined, try once more (harmless when preflight
  # already did the work) and fail the install with instructions rather than
  # hand over an app that will not open. Preflight has run and the artifacts
  # are installed by this point, so Homebrew unwinds them for us.
  postflight do
    installed_app = "#{appdir}/AutoPiP.app"

    quarantined = lambda do
      command.run("/usr/bin/xattr",
                  args:         ["-p", "com.apple.quarantine", installed_app],
                  print_stderr: false,
                  must_succeed: false).success?
    end

    next unless quarantined.call

    command.run "/usr/bin/xattr",
                args:         ["-dr", "com.apple.quarantine", installed_app],
                must_succeed: false

    next unless quarantined.call

    raise Cask::CaskError, <<~ERROR
      Could not clear the quarantine attribute from #{installed_app}.

      AutoPiP is signed with an Apple Development certificate and is not
      notarized, so macOS would refuse to open it on first launch.

      This usually means your terminal lacks App Management permission. Grant it
      in System Settings -> Privacy & Security -> App Management, then run:

        brew reinstall --cask vordenken/autopip/autopip

      Or clear the attribute yourself and skip it on future installs:

        xattr -dr com.apple.quarantine #{installed_app}
        HOMEBREW_CASK_OPTS=--no-quarantine brew reinstall --cask vordenken/autopip/autopip
    ERROR
  end

  uninstall quit: [
    "com.vd.AutoPiP",
    "com.vd.AutoPiP.Extension",
  ]

  zap trash: [
    "~/Library/Application Scripts/com.vd.AutoPiP",
    "~/Library/Application Scripts/com.vd.AutoPiP.Extension",
    "~/Library/Containers/com.vd.AutoPiP",
    "~/Library/Containers/com.vd.AutoPiP.Extension",
  ]

  caveats <<~EOS
    AutoPiP is signed with an Apple Development certificate rather than a
    Developer ID, and is not notarized. This cask therefore removes the
    quarantine attribute during install so the first launch is not blocked —
    macOS has not vetted this build, and you are trusting the publisher.

    Launch AutoPiP once, then enable the extension in Safari under
    Settings → Extensions. Updates are handled by Sparkle from within the app.
  EOS
end
