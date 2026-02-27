// popup.js
const autopipEnabledCheckbox = document.getElementById('autopipEnabledCheckbox');
const tabSwitchCheckbox = document.getElementById('tabSwitchCheckbox');
const windowSwitchCheckbox = document.getElementById('windowSwitchCheckbox');
const scrollSwitchCheckbox = document.getElementById('scrollSwitchCheckbox');
const debugLoggingCheckbox = document.getElementById('debugLoggingCheckbox');
const hostnameToggle = document.getElementById('hostnameToggle');
const siteActionBtn = document.getElementById('siteActionBtn');
const currentHostnameSpan = document.getElementById('currentHostname');
const blacklistHeader = document.getElementById('blacklistHeader');
const chevron = document.getElementById('chevron');
const blacklistList = document.getElementById('blacklistList');
const blacklistCount = document.getElementById('blacklistCount');

// Whitelist DOM elements
const blacklistSection = document.getElementById('blacklistSection');
const whitelistSection = document.getElementById('whitelistSection');
const blacklistModeBtn = document.getElementById('blacklistModeBtn');
const whitelistModeBtn = document.getElementById('whitelistModeBtn');
const whitelistHeader = document.getElementById('whitelistHeader');
const whitelistChevron = document.getElementById('whitelistChevron');
const whitelistList = document.getElementById('whitelistList');
const whitelistCount = document.getElementById('whitelistCount');
const clearBlacklistBtn = document.getElementById('clearBlacklistBtn');
const clearWhitelistBtn = document.getElementById('clearWhitelistBtn');

// View elements
const mainView = document.getElementById('mainView');
const settingsView = document.getElementById('settingsView');
const settingsButton = document.getElementById('settingsButton');
const backButton = document.getElementById('backButton');

// State variables
let autopipEnabled = true;
let blacklistedSites = [];
let whitelistedSites = [];
let listMode = 'blacklist'; // 'blacklist' | 'whitelist'
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

// === GLOBAL TOGGLE STATE ===
function renderGlobalToggleState(enabled) {
    if (enabled) {
        mainView.classList.remove('autopip-disabled');
    } else {
        mainView.classList.add('autopip-disabled');
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

// === MODE SWITCHER ===

/**
 * Render the active mode: show the correct list section and highlight the active button
 * @param {string} mode - 'blacklist' | 'whitelist'
 */
function renderMode(mode) {
    if (mode === 'whitelist') {
        blacklistModeBtn.classList.remove('active');
        whitelistModeBtn.classList.add('active');
        blacklistSection.classList.add('hidden');
        whitelistSection.classList.remove('hidden');
    } else {
        blacklistModeBtn.classList.add('active');
        whitelistModeBtn.classList.remove('active');
        blacklistSection.classList.remove('hidden');
        whitelistSection.classList.add('hidden');
    }
    // Refresh site toggle to reflect the active list
    if (currentTabUrl) {
        const hostname = extractHostname(currentTabUrl, blacklistUseFullHostname);
        if (hostname) updateSiteActionBtn(hostname);
    }
}

blacklistModeBtn.addEventListener('click', async function() {
    if (listMode === 'blacklist') return;
    listMode = 'blacklist';
    await safeStorageSet({ listMode });
    renderMode(listMode);
    updateAllTabs('updateListMode', null, undefined, { mode: listMode, whitelistedSites });
});

whitelistModeBtn.addEventListener('click', async function() {
    if (listMode === 'whitelist') return;
    listMode = 'whitelist';
    await safeStorageSet({ listMode });
    renderMode(listMode);
    updateAllTabs('updateListMode', null, undefined, { mode: listMode, whitelistedSites });
});

// === INITIALIZATION ===

// Load saved status with error handling
(async function initializePopup() {
    const defaults = {
        autopipEnabled: true,
        tabSwitchEnabled: true,
        windowSwitchEnabled: true,
        scrollSwitchEnabled: true,
        debugLoggingEnabled: false,
        blacklistedSites: [],
        whitelistedSites: [],
        blacklistUseFullHostname: true,
        listMode: 'blacklist'
    };
    
    const result = await safeStorageGet(
        ['autopipEnabled', 'tabSwitchEnabled', 'windowSwitchEnabled', 'scrollSwitchEnabled',
         'debugLoggingEnabled', 'blacklistedSites', 'whitelistedSites', 'blacklistUseFullHostname', 'listMode'],
        defaults
    );
    
    autopipEnabled = result.autopipEnabled ?? true;
    const tabEnabled = result.tabSwitchEnabled ?? true;
    const windowEnabled = result.windowSwitchEnabled ?? true;
    const scrollEnabled = result.scrollSwitchEnabled ?? true;
    const debugEnabled = result.debugLoggingEnabled ?? false;
    
    blacklistedSites = result.blacklistedSites ?? [];
    whitelistedSites = result.whitelistedSites ?? [];
    blacklistUseFullHostname = result.blacklistUseFullHostname ?? true;
    listMode = result.listMode ?? 'blacklist';

    // Deduplicate: a site must not exist in both lists.
    // Blacklist takes precedence – remove any overlap from whitelist.
    const overlap = whitelistedSites.filter(s => blacklistedSites.includes(s));
    if (overlap.length > 0) {
        whitelistedSites = whitelistedSites.filter(s => !blacklistedSites.includes(s));
        await safeStorageSet({ whitelistedSites });
    }

    autopipEnabledCheckbox.checked = autopipEnabled;
    tabSwitchCheckbox.checked = tabEnabled;
    windowSwitchCheckbox.checked = windowEnabled;
    scrollSwitchCheckbox.checked = scrollEnabled;
    debugLoggingCheckbox.checked = debugEnabled;
    hostnameToggle.checked = blacklistUseFullHostname;

    // Send initial status to all tabs
    renderGlobalToggleState(autopipEnabled);
    updateAllTabs('toggleAutoPiP', autopipEnabled);
    updateAllTabs('toggleTabSwitch', tabEnabled);
    updateAllTabs('toggleWindowSwitch', windowEnabled);
    updateAllTabs('toggleScrollSwitch', scrollEnabled);
    updateAllTabs('toggleDebugLogging', debugEnabled);
    updateAllTabs('updateBlacklist', null, blacklistedSites);
    updateAllTabs('updateListMode', null, undefined, { mode: listMode, whitelistedSites });
    
    // Load current tab and update UI
    loadCurrentTab();
    renderBlacklistUI();
    renderWhitelistUI();
    renderMode(listMode);
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
autopipEnabledCheckbox.addEventListener('change', async function() {
    autopipEnabled = autopipEnabledCheckbox.checked;
    await safeStorageSet({ autopipEnabled });
    updateAllTabs('toggleAutoPiP', autopipEnabled);
    renderGlobalToggleState(autopipEnabled);
});

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
        updateSiteActionBtn(hostname);
    }
});

// Site Action Button Event Listener
siteActionBtn.addEventListener('click', function() {
    if (!currentTabUrl) {
        console.warn('[AutoPiP] No current tab URL available');
        return;
    }
    
    const hostname = extractHostname(currentTabUrl, blacklistUseFullHostname);
    
    if (listMode === 'whitelist') {
        if (whitelistedSites.includes(hostname)) {
            removeFromWhitelist(hostname);
        } else {
            addToWhitelist(hostname);
        }
    } else {
        if (blacklistedSites.includes(hostname)) {
            removeFromBlacklist(hostname);
        } else {
            addToBlacklist(hostname);
        }
    }
});

// Blacklist Header (Chevron) Click Event Listener
blacklistHeader.addEventListener('click', function() {
    const isExpanded = blacklistList.classList.toggle('expanded');
    chevron.classList.toggle('rotated');
    blacklistHeader.setAttribute('aria-expanded', isExpanded);
});

// Whitelist Header (Chevron) Click Event Listener
whitelistHeader.addEventListener('click', function() {
    const isExpanded = whitelistList.classList.toggle('expanded');
    whitelistChevron.classList.toggle('rotated');
    whitelistHeader.setAttribute('aria-expanded', isExpanded);
});

// === INLINE CONFIRM DIALOG ===
// window.confirm() is blocked in Safari extension popups,
// so we use a custom Promise-based overlay instead.

const confirmOverlay = document.getElementById('confirmOverlay');
const confirmMessage = document.getElementById('confirmMessage');
const confirmOk = document.getElementById('confirmOk');
const confirmCancel = document.getElementById('confirmCancel');

function showConfirm(message) {
    return new Promise((resolve) => {
        confirmMessage.textContent = message;
        confirmOverlay.classList.remove('hidden');
        confirmOk.focus();

        function cleanup(result) {
            confirmOverlay.classList.add('hidden');
            confirmOk.removeEventListener('click', onOk);
            confirmCancel.removeEventListener('click', onCancel);
            confirmOverlay.removeEventListener('click', onBackdrop);
            resolve(result);
        }

        function onOk() { cleanup(true); }
        function onCancel() { cleanup(false); }
        function onBackdrop(e) {
            if (e.target === confirmOverlay) cleanup(false);
        }

        confirmOk.addEventListener('click', onOk);
        confirmCancel.addEventListener('click', onCancel);
        confirmOverlay.addEventListener('click', onBackdrop);
    });
}

// Clear Blacklist Button
clearBlacklistBtn.addEventListener('click', async function(e) {
    e.stopPropagation();
    if (!blacklistedSites.length) return;
    const confirmed = await showConfirm('Clear all blacklisted sites?');
    if (confirmed) {
        blacklistedSites = [];
        await safeStorageSet({ blacklistedSites });
        updateAllTabs('updateBlacklist', null, blacklistedSites);
        renderBlacklistUI();
        if (currentTabUrl) {
            updateSiteActionBtn(extractHostname(currentTabUrl, blacklistUseFullHostname));
        }
    }
});

// Clear Whitelist Button
clearWhitelistBtn.addEventListener('click', async function(e) {
    e.stopPropagation();
    if (!whitelistedSites.length) return;
    const confirmed = await showConfirm('Clear all whitelisted sites?');
    if (confirmed) {
        whitelistedSites = [];
        await safeStorageSet({ whitelistedSites });
        updateAllTabs('updateWhitelist', null, whitelistedSites);
        renderWhitelistUI();
        if (currentTabUrl) {
            updateSiteActionBtn(extractHostname(currentTabUrl, blacklistUseFullHostname));
        }
    }
});

async function updateAllTabs(command, enabled = null, sites = undefined, extra = undefined) {
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
        if (extra !== undefined) {
            Object.assign(message, extra);
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
                updateSiteActionBtn(hostname);
            } else {
                currentHostnameSpan.textContent = 'Invalid URL';
                siteActionBtn.disabled = true;
            }
        } else {
            currentHostnameSpan.textContent = 'No active tab';
            siteActionBtn.disabled = true;
        }
    });
}

// Update site action button text and style based on active list and mode
function updateSiteActionBtn(hostname) {
    if (!hostname) {
        console.warn('[AutoPiP] updateSiteActionBtn called with empty hostname');
        siteActionBtn.disabled = true;
        return;
    }
    siteActionBtn.disabled = false;
    siteActionBtn.classList.remove('state-blocked', 'state-allowed');

    if (listMode === 'whitelist') {
        if (whitelistedSites.includes(hostname)) {
            siteActionBtn.textContent = '✓ Allowed';
            siteActionBtn.classList.add('state-allowed');
            siteActionBtn.title = 'Remove from whitelist';
        } else {
            siteActionBtn.textContent = 'Allow';
            siteActionBtn.title = 'Add to whitelist';
        }
    } else {
        if (blacklistedSites.includes(hostname)) {
            siteActionBtn.textContent = '✕ Blocked';
            siteActionBtn.classList.add('state-blocked');
            siteActionBtn.title = 'Remove from blacklist';
        } else {
            siteActionBtn.textContent = 'Block';
            siteActionBtn.title = 'Add to blacklist';
        }
    }
}

// Add site to blacklist (also removes from whitelist to avoid duplicates across lists)
async function addToBlacklist(hostname) {
    if (!hostname) {
        console.warn('[AutoPiP] Attempted to add empty hostname to blacklist');
        return;
    }
    // Remove from whitelist if present
    const wiIdx = whitelistedSites.indexOf(hostname);
    if (wiIdx > -1) {
        whitelistedSites.splice(wiIdx, 1);
        await safeStorageSet({ whitelistedSites });
        updateAllTabs('updateWhitelist', null, whitelistedSites);
        renderWhitelistUI();
    }
    if (!blacklistedSites.includes(hostname)) {
        blacklistedSites.push(hostname);
        console.log('[AutoPiP] Added to blacklist:', hostname);
        await saveBlacklist();
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
    const success = await safeStorageSet({ blacklistedSites });
    if (!success) {
        console.error('[AutoPiP] Failed to save blacklist to storage');
    }
    updateAllTabs('updateBlacklist', null, blacklistedSites);
    renderBlacklistUI();
    // Refresh action button for current tab
    if (currentTabUrl) {
        updateSiteActionBtn(extractHostname(currentTabUrl, blacklistUseFullHostname));
    }
}

// Add site to whitelist (also removes from blacklist to avoid duplicates across lists)
async function addToWhitelist(hostname) {
    if (!hostname) {
        console.warn('[AutoPiP] Attempted to add empty hostname to whitelist');
        return;
    }
    // Remove from blacklist if present
    const blIdx = blacklistedSites.indexOf(hostname);
    if (blIdx > -1) {
        blacklistedSites.splice(blIdx, 1);
        await safeStorageSet({ blacklistedSites });
        updateAllTabs('updateBlacklist', null, blacklistedSites);
        renderBlacklistUI();
    }
    if (!whitelistedSites.includes(hostname)) {
        whitelistedSites.push(hostname);
        console.log('[AutoPiP] Added to whitelist:', hostname);
        await saveWhitelist();
    }
}

// Remove site from whitelist
function removeFromWhitelist(hostname) {
    if (!hostname) {
        console.warn('[AutoPiP] Attempted to remove empty hostname from whitelist');
        return;
    }
    const index = whitelistedSites.indexOf(hostname);
    if (index > -1) {
        whitelistedSites.splice(index, 1);
        console.log('[AutoPiP] Removed from whitelist:', hostname);
        saveWhitelist();
    }
}

// Save whitelist to storage and update all tabs
async function saveWhitelist() {
    const success = await safeStorageSet({ whitelistedSites });
    if (!success) {
        console.error('[AutoPiP] Failed to save whitelist to storage');
    }
    updateAllTabs('updateWhitelist', null, whitelistedSites);
    renderWhitelistUI();
    // Refresh action button for current tab
    if (currentTabUrl) {
        updateSiteActionBtn(extractHostname(currentTabUrl, blacklistUseFullHostname));
    }
}

// Render whitelist UI with event delegation
function renderWhitelistUI() {
    whitelistCount.textContent = whitelistedSites.length;
    whitelistList.innerHTML = '';

    if (whitelistedSites.length === 0) {
        const emptyItem = document.createElement('div');
        emptyItem.className = 'blacklist-item empty';
        emptyItem.textContent = 'No sites whitelisted';
        whitelistList.appendChild(emptyItem);
    } else {
        whitelistedSites.forEach(site => {
            const item = document.createElement('div');
            item.className = 'blacklist-item';

            const siteSpan = document.createElement('span');
            siteSpan.className = 'site-name';
            siteSpan.textContent = site;
            siteSpan.title = site;

            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-btn whitelist-remove-btn';
            removeBtn.textContent = '✕';
            removeBtn.title = 'Remove from whitelist';
            removeBtn.dataset.site = site;

            item.appendChild(siteSpan);
            item.appendChild(removeBtn);
            whitelistList.appendChild(item);
        });
    }
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

// Event delegation for blacklist remove buttons
blacklistList.addEventListener('click', function(e) {
    if (e.target.classList.contains('remove-btn')) {
        e.stopPropagation();
        const site = e.target.dataset.site;
        removeFromBlacklist(site);
        if (currentTabUrl) {
            const currentHostname = extractHostname(currentTabUrl, blacklistUseFullHostname);
            if (currentHostname === site) updateSiteActionBtn(currentHostname);
        }
    }
});

// Event delegation for whitelist remove buttons
whitelistList.addEventListener('click', function(e) {
    if (e.target.classList.contains('remove-btn')) {
        e.stopPropagation();
        const site = e.target.dataset.site;
        removeFromWhitelist(site);
        if (currentTabUrl) {
            const currentHostname = extractHostname(currentTabUrl, blacklistUseFullHostname);
            if (currentHostname === site) updateSiteActionBtn(currentHostname);
        }
    }
});
