// popup.js
const tabSwitchCheckbox = document.getElementById('tabSwitchCheckbox');
const windowSwitchCheckbox = document.getElementById('windowSwitchCheckbox');
const scrollSwitchCheckbox = document.getElementById('scrollSwitchCheckbox');
const debugLoggingCheckbox = document.getElementById('debugLoggingCheckbox');
const hostnameToggle = document.getElementById('hostnameToggle');
const siteToggle = document.getElementById('siteToggle');
const currentHostnameSpan = document.getElementById('currentHostname');
const blacklistHeader = document.getElementById('blacklistHeader');
const chevron = document.getElementById('chevron');
const blacklistList = document.getElementById('blacklistList');
const blacklistCount = document.getElementById('blacklistCount');
const appIcon = document.getElementById('appIcon');
const advancedSettings = document.getElementById('advancedSettings');

// State variables
let blacklistedSites = [];
let blacklistUseFullHostname = true;
let currentTabUrl = null;

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
browser.storage.local.get(['tabSwitchEnabled', 'windowSwitchEnabled', 'scrollSwitchEnabled', 'debugLoggingEnabled', 'blacklistedSites', 'blacklistUseFullHostname'], function(result) {
    const tabEnabled = result.tabSwitchEnabled === undefined ? true : result.tabSwitchEnabled;
    const windowEnabled = result.windowSwitchEnabled === undefined ? true : result.windowSwitchEnabled;
    const scrollEnabled = result.scrollSwitchEnabled === undefined ? true : result.scrollSwitchEnabled;
    const debugEnabled = result.debugLoggingEnabled === undefined ? false : result.debugLoggingEnabled;
    
    blacklistedSites = result.blacklistedSites === undefined ? [] : result.blacklistedSites;
    blacklistUseFullHostname = result.blacklistUseFullHostname === undefined ? true : result.blacklistUseFullHostname;

    tabSwitchCheckbox.checked = tabEnabled;
    windowSwitchCheckbox.checked = windowEnabled;
    scrollSwitchCheckbox.checked = scrollEnabled;
    debugLoggingCheckbox.checked = debugEnabled;
    hostnameToggle.checked = blacklistUseFullHostname;

    // Send initial status to all tabs
    updateAllTabs('toggleTabSwitch', tabEnabled);
    updateAllTabs('toggleWindowSwitch', windowEnabled);
    updateAllTabs('toggleScrollSwitch', scrollEnabled);
    updateAllTabs('toggleDebugLogging', debugEnabled);
    updateAllTabs('updateBlacklist', null, blacklistedSites);
    
    // Load current tab and update UI
    loadCurrentTab();
    renderBlacklistUI();
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

// Hostname Toggle Event Listener
hostnameToggle.addEventListener('change', function() {
    blacklistUseFullHostname = hostnameToggle.checked;
    console.log('Hostname mode changed to:', blacklistUseFullHostname ? 'full' : 'root');
    
    browser.storage.local.set({ blacklistUseFullHostname: blacklistUseFullHostname });
    
    // Update current hostname display
    if (currentTabUrl) {
        const hostname = extractHostname(currentTabUrl, blacklistUseFullHostname);
        currentHostnameSpan.textContent = hostname;
        updateSiteToggle(hostname);
    }
});

// Site Toggle Event Listener
siteToggle.addEventListener('change', function() {
    if (!currentTabUrl) return;
    
    const hostname = extractHostname(currentTabUrl, blacklistUseFullHostname);
    const isEnabled = siteToggle.checked;
    
    if (isEnabled) {
        // Remove from blacklist
        removeFromBlacklist(hostname);
    } else {
        // Add to blacklist
        addToBlacklist(hostname);
    }
});

// Blacklist Header (Chevron) Click Event Listener
blacklistHeader.addEventListener('click', function() {
    blacklistList.classList.toggle('expanded');
    chevron.classList.toggle('rotated');
});

function updateAllTabs(command, enabled, sites) {
    browser.tabs.query({}, function(tabs) {
        tabs.forEach(tab => {
            const message = { command: command };
            if (enabled !== null && enabled !== undefined) {
                message.enabled = enabled;
            }
            if (sites !== undefined) {
                message.sites = sites;
            }
            browser.tabs.sendMessage(tab.id, message).catch(err => console.log('Error sending message to tab:', err));
        });
    });
}

// Extract hostname from URL based on settings
function extractHostname(url, useFullHostname) {
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;
        
        if (useFullHostname) {
            return hostname;
        } else {
            // Extract root domain (last 2 parts)
            const parts = hostname.split('.');
            if (parts.length >= 2) {
                return parts.slice(-2).join('.');
            }
            return hostname;
        }
    } catch (e) {
        console.error('Error extracting hostname:', e);
        return '';
    }
}

// Load current tab information
function loadCurrentTab() {
    browser.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (tabs.length > 0 && tabs[0].url) {
            currentTabUrl = tabs[0].url;
            const hostname = extractHostname(currentTabUrl, blacklistUseFullHostname);
            currentHostnameSpan.textContent = hostname;
            updateSiteToggle(hostname);
        } else {
            currentHostnameSpan.textContent = 'No active tab';
            siteToggle.disabled = true;
        }
    });
}

// Update site toggle checkbox based on blacklist status
function updateSiteToggle(hostname) {
    const isBlacklisted = blacklistedSites.includes(hostname);
    siteToggle.checked = !isBlacklisted;
}

// Add site to blacklist
function addToBlacklist(hostname) {
    if (!blacklistedSites.includes(hostname)) {
        blacklistedSites.push(hostname);
        saveBlacklist();
    }
}

// Remove site from blacklist
function removeFromBlacklist(hostname) {
    const index = blacklistedSites.indexOf(hostname);
    if (index > -1) {
        blacklistedSites.splice(index, 1);
        saveBlacklist();
    }
}

// Save blacklist to storage and update all tabs
function saveBlacklist() {
    browser.storage.local.set({ blacklistedSites: blacklistedSites }, function() {
        console.log('Blacklist saved:', blacklistedSites);
        updateAllTabs('updateBlacklist', null, blacklistedSites);
        renderBlacklistUI();
    });
}

// Render blacklist UI
function renderBlacklistUI() {
    // Update count
    blacklistCount.textContent = blacklistedSites.length;
    
    // Clear and rebuild list
    blacklistList.innerHTML = '';
    
    if (blacklistedSites.length === 0) {
        const emptyItem = document.createElement('div');
        emptyItem.className = 'blacklist-item empty';
        emptyItem.textContent = 'No sites blacklisted';
        blacklistList.appendChild(emptyItem);
    } else {
        blacklistedSites.forEach(site => {
            const item = document.createElement('div');
            item.className = 'blacklist-item';
            
            const siteSpan = document.createElement('span');
            siteSpan.className = 'site-name';
            siteSpan.textContent = site;
            
            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-btn';
            removeBtn.textContent = '✕';
            removeBtn.title = 'Remove from blacklist';
            removeBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                removeFromBlacklist(site);
                
                // Update site toggle if this was the current site
                if (currentTabUrl) {
                    const currentHostname = extractHostname(currentTabUrl, blacklistUseFullHostname);
                    if (currentHostname === site) {
                        updateSiteToggle(currentHostname);
                    }
                }
            });
            
            item.appendChild(siteSpan);
            item.appendChild(removeBtn);
            blacklistList.appendChild(item);
        });
    }
}
