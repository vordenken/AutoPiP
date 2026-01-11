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

// View elements
const mainView = document.getElementById('mainView');
const settingsView = document.getElementById('settingsView');
const settingsButton = document.getElementById('settingsButton');
const backButton = document.getElementById('backButton');

// State variables
let blacklistedSites = [];
let blacklistUseFullHostname = true;
let currentTabUrl = null;

// Set version from manifest
const version = 'v' + browser.runtime.getManifest().version;
document.getElementById('version').textContent = version;

// === ERROR HANDLING & STORAGE HELPERS ===

/**
 * Safely get values from browser storage with error handling
 * @param {Array|Object} keys - Storage keys to retrieve
 * @param {Object} defaults - Default values if storage fails
 * @returns {Promise<Object>} - Storage result or defaults
 */
async function safeStorageGet(keys, defaults = {}) {
    try {
        const result = await browser.storage.local.get(keys);
        if (browser.runtime.lastError) {
            console.error('[AutoPiP] Storage get error:', browser.runtime.lastError);
            return defaults;
        }
        return result;
    } catch (error) {
        console.error('[AutoPiP] Storage get exception:', error);
        return defaults;
    }
}

/**
 * Safely set values to browser storage with error handling
 * @param {Object} items - Key-value pairs to store
 * @returns {Promise<boolean>} - Success status
 */
async function safeStorageSet(items) {
    try {
        await browser.storage.local.set(items);
        if (browser.runtime.lastError) {
            console.error('[AutoPiP] Storage set error:', browser.runtime.lastError);
            return false;
        }
        return true;
    } catch (error) {
        console.error('[AutoPiP] Storage set exception:', error);
        return false;
    }
}

// === VIEW NAVIGATION ===
function showMainView() {
    mainView.classList.remove('hidden');
    settingsView.classList.add('hidden');
}

function showSettingsView() {
    mainView.classList.add('hidden');
    settingsView.classList.remove('hidden');
}

settingsButton.addEventListener('click', showSettingsView);
backButton.addEventListener('click', showMainView);

// === INITIALIZATION ===

// Load saved status with error handling
(async function initializePopup() {
    const defaults = {
        tabSwitchEnabled: true,
        windowSwitchEnabled: true,
        scrollSwitchEnabled: true,
        debugLoggingEnabled: false,
        blacklistedSites: [],
        blacklistUseFullHostname: true
    };
    
    const result = await safeStorageGet(
        ['tabSwitchEnabled', 'windowSwitchEnabled', 'scrollSwitchEnabled', 'debugLoggingEnabled', 'blacklistedSites', 'blacklistUseFullHostname'],
        defaults
    );
    
    const tabEnabled = result.tabSwitchEnabled ?? true;
    const windowEnabled = result.windowSwitchEnabled ?? true;
    const scrollEnabled = result.scrollSwitchEnabled ?? true;
    const debugEnabled = result.debugLoggingEnabled ?? false;
    
    blacklistedSites = result.blacklistedSites ?? [];
    blacklistUseFullHostname = result.blacklistUseFullHostname ?? true;

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
})();

// === EVENT LISTENERS ===
// Generic toggle handler factory
function createToggleHandler(checkbox, storageKey, command) {
    return async function() {
        const enabled = checkbox.checked;
        console.log(`${storageKey} changed to:`, enabled);
        
        await safeStorageSet({ [storageKey]: enabled });
        updateAllTabs(command, enabled);
    };
}

// Setup toggle event listeners
tabSwitchCheckbox.addEventListener('change', createToggleHandler(tabSwitchCheckbox, 'tabSwitchEnabled', 'toggleTabSwitch'));
windowSwitchCheckbox.addEventListener('change', createToggleHandler(windowSwitchCheckbox, 'windowSwitchEnabled', 'toggleWindowSwitch'));
scrollSwitchCheckbox.addEventListener('change', createToggleHandler(scrollSwitchCheckbox, 'scrollSwitchEnabled', 'toggleScrollSwitch'));
debugLoggingCheckbox.addEventListener('change', createToggleHandler(debugLoggingCheckbox, 'debugLoggingEnabled', 'toggleDebugLogging'));

// Hostname Toggle Event Listener
hostnameToggle.addEventListener('change', async function() {
    blacklistUseFullHostname = hostnameToggle.checked;
    console.log('Hostname mode changed to:', blacklistUseFullHostname ? 'full' : 'root');
    
    await safeStorageSet({ blacklistUseFullHostname: blacklistUseFullHostname });
    
    // Update current hostname display
    if (currentTabUrl) {
        const hostname = extractHostname(currentTabUrl, blacklistUseFullHostname);
        currentHostnameSpan.textContent = hostname;
        updateSiteToggle(hostname);
    }
});

// Site Toggle Event Listener
siteToggle.addEventListener('change', function() {
    if (!currentTabUrl) {
        console.warn('[AutoPiP] No current tab URL available');
        return;
    }
    
    const hostname = extractHostname(currentTabUrl, blacklistUseFullHostname);
    const isEnabled = siteToggle.checked;
    
    if (isEnabled) {
        removeFromBlacklist(hostname);
    } else {
        addToBlacklist(hostname);
    }
});

// Blacklist Header (Chevron) Click Event Listener
blacklistHeader.addEventListener('click', function() {
    const isExpanded = blacklistList.classList.toggle('expanded');
    chevron.classList.toggle('rotated');
    
    // Update ARIA attribute
    blacklistHeader.setAttribute('aria-expanded', isExpanded);
});

async function updateAllTabs(command, enabled = null, sites = undefined) {
    const tabs = await browser.tabs.query({});
    
    // Batch all tab updates with Promise.allSettled for better performance
    const promises = tabs.map(tab => {
        const message = { command };
        if (enabled !== null && enabled !== undefined) {
            message.enabled = enabled;
        }
        if (sites !== undefined) {
            message.sites = sites;
        }
        return browser.tabs.sendMessage(tab.id, message)
            .catch(err => console.warn('[AutoPiP] Failed to send message to tab:', err.message || err));
    });
    
    // Fire and forget (no need to wait)
    await Promise.allSettled(promises);
}

// Extract hostname from URL based on settings
function extractHostname(url, useFullHostname) {
    if (!url || typeof url !== 'string') {
        console.error('[AutoPiP] Invalid URL provided to extractHostname:', url);
        return '';
    }
    
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;
        
        if (!hostname) {
            console.warn('[AutoPiP] URL has no hostname:', url);
            return '';
        }
        
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
    } catch (error) {
        console.error('[AutoPiP] Error extracting hostname from URL:', url, error.message || error);
        return '';
    }
}

// Load current tab information
function loadCurrentTab() {
    browser.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (tabs.length > 0 && tabs[0].url) {
            currentTabUrl = tabs[0].url;
            const hostname = extractHostname(currentTabUrl, blacklistUseFullHostname);
            if (hostname) {
                currentHostnameSpan.textContent = hostname;
                updateSiteToggle(hostname);
            } else {
                currentHostnameSpan.textContent = 'Invalid URL';
                siteToggle.disabled = true;
            }
        } else {
            currentHostnameSpan.textContent = 'No active tab';
            siteToggle.disabled = true;
        }
    });
}

// Update site toggle checkbox based on blacklist status
function updateSiteToggle(hostname) {
    if (!hostname) {
        console.warn('[AutoPiP] updateSiteToggle called with empty hostname');
        siteToggle.disabled = true;
        return;
    }
    const isBlacklisted = blacklistedSites.includes(hostname);
    siteToggle.checked = !isBlacklisted;
    siteToggle.disabled = false;
}

// Add site to blacklist
function addToBlacklist(hostname) {
    if (!hostname) {
        console.warn('[AutoPiP] Attempted to add empty hostname to blacklist');
        return;
    }
    if (!blacklistedSites.includes(hostname)) {
        blacklistedSites.push(hostname);
        console.log('[AutoPiP] Added to blacklist:', hostname);
        saveBlacklist();
    }
}

// Remove site from blacklist
function removeFromBlacklist(hostname) {
    if (!hostname) {
        console.warn('[AutoPiP] Attempted to remove empty hostname from blacklist');
        return;
    }
    const index = blacklistedSites.indexOf(hostname);
    if (index > -1) {
        blacklistedSites.splice(index, 1);
        console.log('[AutoPiP] Removed from blacklist:', hostname);
        saveBlacklist();
    }
}

// Save blacklist to storage and update all tabs
async function saveBlacklist() {
    const success = await safeStorageSet({ blacklistedSites: blacklistedSites });
    if (!success) {
        console.error('[AutoPiP] Failed to save blacklist to storage');
    }
    updateAllTabs('updateBlacklist', null, blacklistedSites);
    renderBlacklistUI();
}

// Render blacklist UI with event delegation
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
            siteSpan.title = site;
            
            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-btn';
            removeBtn.textContent = '✕';
            removeBtn.title = 'Remove from blacklist';
            removeBtn.dataset.site = site; // Store site in data attribute for delegation
            
            item.appendChild(siteSpan);
            item.appendChild(removeBtn);
            blacklistList.appendChild(item);
        });
    }
}

// Event delegation for blacklist remove buttons (better performance)
blacklistList.addEventListener('click', function(e) {
    if (e.target.classList.contains('remove-btn')) {
        e.stopPropagation();
        const site = e.target.dataset.site;
        
        removeFromBlacklist(site);
        
        // Update site toggle if this was the current site
        if (currentTabUrl) {
            const currentHostname = extractHostname(currentTabUrl, blacklistUseFullHostname);
            if (currentHostname === site) {
                updateSiteToggle(currentHostname);
            }
        }
    }
});
