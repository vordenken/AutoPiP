// popup.js
const tabSwitchCheckbox = document.getElementById('tabSwitchCheckbox');
const windowSwitchCheckbox = document.getElementById('windowSwitchCheckbox');
const scrollSwitchCheckbox = document.getElementById('scrollSwitchCheckbox');
const debugLoggingCheckbox = document.getElementById('debugLoggingCheckbox');
const appIcon = document.getElementById('appIcon');
const advancedSettings = document.getElementById('advancedSettings');

// Set version from manifest
document.getElementById('version').textContent = 'v' + browser.runtime.getManifest().version;

// Easter egg: 5 clicks on logo to reveal advanced settings
let clickCount = 0;
let clickTimer = null;

appIcon.addEventListener('click', function() {
    clickCount++;
    
    // Reset counter after 2 seconds of no clicks
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => {
        clickCount = 0;
    }, 2000);
    
    // Show advanced settings after 5 clicks
    if (clickCount >= 5) {
        advancedSettings.classList.toggle('open');
        clickCount = 0;
    }
});

// Load saved status
browser.storage.local.get(['tabSwitchEnabled', 'windowSwitchEnabled', 'scrollSwitchEnabled', 'debugLoggingEnabled'], function(result) {
    const tabEnabled = result.tabSwitchEnabled === undefined ? true : result.tabSwitchEnabled;
    const windowEnabled = result.windowSwitchEnabled === undefined ? true : result.windowSwitchEnabled;
    const scrollEnabled = result.scrollSwitchEnabled === undefined ? true : result.scrollSwitchEnabled;
    const debugEnabled = result.debugLoggingEnabled === undefined ? false : result.debugLoggingEnabled;

    tabSwitchCheckbox.checked = tabEnabled;
    windowSwitchCheckbox.checked = windowEnabled;
    scrollSwitchCheckbox.checked = scrollEnabled;
    debugLoggingCheckbox.checked = debugEnabled;

    // Send initial status to all tabs
    updateAllTabs('toggleTabSwitch', tabEnabled);
    updateAllTabs('toggleWindowSwitch', windowEnabled);
    updateAllTabs('toggleScrollSwitch', scrollEnabled);
    updateAllTabs('toggleDebugLogging', debugEnabled);
});

// Tab Switch Checkbox Event Listener
tabSwitchCheckbox.addEventListener('change', function() {
    const enabled = tabSwitchCheckbox.checked;
    console.log('Tab Switch changed to:', enabled);

    browser.storage.local.set({ tabSwitchEnabled: enabled });
    updateAllTabs('toggleTabSwitch', enabled);
});

// Window Switch Checkbox Event Listener
windowSwitchCheckbox.addEventListener('change', function() {
    const enabled = windowSwitchCheckbox.checked;
    console.log('Window Switch changed to:', enabled);

    browser.storage.local.set({ windowSwitchEnabled: enabled });
    updateAllTabs('toggleWindowSwitch', enabled);
});

// Scroll Switch Checkbox Event Listener
scrollSwitchCheckbox.addEventListener('change', function() {
    const enabled = scrollSwitchCheckbox.checked;
    console.log('Scroll Switch changed to:', enabled);

    browser.storage.local.set({ scrollSwitchEnabled: enabled });
    updateAllTabs('toggleScrollSwitch', enabled);
});

// Debug Logging Checkbox Event Listener
debugLoggingCheckbox.addEventListener('change', function() {
    const enabled = debugLoggingCheckbox.checked;
    console.log('Debug Logging changed to:', enabled);

    browser.storage.local.set({ debugLoggingEnabled: enabled });
    updateAllTabs('toggleDebugLogging', enabled);
});

function updateAllTabs(command, enabled) {
    browser.tabs.query({}, function(tabs) {
        tabs.forEach(tab => {
            browser.tabs.sendMessage(tab.id, {
                command: command,
                enabled: enabled
            }).catch(err => console.log('Error sending message to tab:', err));
        });
    });
}
