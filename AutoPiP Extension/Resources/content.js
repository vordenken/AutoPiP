// content.js

// Configuration constants
const FOCUS_CHECK_DELAY_MS = 100; // Delay to distinguish internal focus changes from actual window blur
let DEBUG_LOGGING = false; // Can be toggled via popup settings

// State variables
let tabSwitchEnabled = true;
let windowSwitchEnabled = true;
let scrollSwitchEnabled = true;
let lastScrollPosition = window.scrollY;
let isVideoVisible = true;
let blacklistedSites = [];

// Debug logging helper
function debugLog(...args) {
    if (DEBUG_LOGGING) {
        console.log('[AutoPiP]', ...args);
    }
}

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

// === INITIALIZATION ===

// === INITIALIZATION ===

// Load initial status with error handling
(async function initializeContentScript() {
    const defaults = {
        tabSwitchEnabled: true,
        windowSwitchEnabled: true,
        scrollSwitchEnabled: true,
        debugLoggingEnabled: false,
        blacklistedSites: []
    };
    
    const result = await safeStorageGet(
        ['tabSwitchEnabled', 'windowSwitchEnabled', 'scrollSwitchEnabled', 'debugLoggingEnabled', 'blacklistedSites'],
        defaults
    );
    
    tabSwitchEnabled = result.tabSwitchEnabled ?? true;
    windowSwitchEnabled = result.windowSwitchEnabled ?? true;
    scrollSwitchEnabled = result.scrollSwitchEnabled ?? true;
    DEBUG_LOGGING = result.debugLoggingEnabled ?? false;
    blacklistedSites = result.blacklistedSites ?? [];
    
    debugLog('Initial status loaded - Tab Switch:', tabSwitchEnabled,
                'Window Switch:', windowSwitchEnabled,
                'Scroll Switch:', scrollSwitchEnabled,
                'Blacklisted Sites:', blacklistedSites);
})();

// === MESSAGE HANDLERS ===
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.command === "toggleTabSwitch") {
        tabSwitchEnabled = message.enabled;
        debugLog('Tab Switch toggled to:', tabSwitchEnabled);
        
        if (!tabSwitchEnabled) {
            const video = getVideo();
            if (video && isPiPActive(video)) {
                disablePiP();
            }
        }
        
        sendResponse({enabled: tabSwitchEnabled});
        return true;
    }
    else if (message.command === "toggleWindowSwitch") {
        windowSwitchEnabled = message.enabled;
        debugLog('Window Switch toggled to:', windowSwitchEnabled);
        
        if (!windowSwitchEnabled) {
            const video = getVideo();
            if (video && isPiPActive(video)) {
                disablePiP();
            }
        }
        
        sendResponse({enabled: windowSwitchEnabled});
        return true;
    }
    else if (message.command === "toggleScrollSwitch") {
        scrollSwitchEnabled = message.enabled;
        debugLog('Scroll Switch toggled to:', scrollSwitchEnabled);
        
        if (!scrollSwitchEnabled) {
            const video = getVideo();
            if (video && isPiPActive(video)) {
                disablePiP();
            }
        }
        
        sendResponse({enabled: scrollSwitchEnabled});
        return true;
    }
    else if (message.command === "toggleDebugLogging") {
        DEBUG_LOGGING = message.enabled;
        debugLog('Debug Logging toggled to:', DEBUG_LOGGING);
        
        sendResponse({enabled: DEBUG_LOGGING});
        return true;
    }
    else if (message.command === "updateBlacklist") {
        blacklistedSites = message.sites || [];
        debugLog('Blacklist updated to:', blacklistedSites);
        debugLog('Current hostname:', window.location.hostname, 'is blacklisted:', isBlacklisted());
        
        // Disable PiP if current site is now blacklisted
        if (isBlacklisted()) {
            const video = getVideo();
            if (video && isPiPActive(video)) {
                debugLog('Site is now blacklisted, disabling PiP');
                disablePiP();
            }
        }
        
        sendResponse({success: true});
        return true;
    }
});

// Check if current site is blacklisted
function isBlacklisted() {
    const currentHostname = window.location.hostname;
    const isBlocked = blacklistedSites.includes(currentHostname);
    debugLog('Blacklist check:', currentHostname, 'blocked:', isBlocked);
    return isBlocked;
}

// Helper function for PiP status
function isPiPActive(video) {
    return document.pictureInPictureElement ||
        (video.webkitPresentationMode && video.webkitPresentationMode === "picture-in-picture");
}

// Helper function to check if element is in viewport
function isElementInViewport(el) {
    const rect = el.getBoundingClientRect();
    return (
        rect.top >= -rect.height &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) + rect.height &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
}

// Event handlers with strict event separation
document.addEventListener("visibilitychange", (event) => {
    // Ignore visibility changes triggered by window blur/focus
    if (!event.isTrusted || event.sourceCapabilities) {
        return;
    }

    // Check if tab switch is enabled before proceeding
    if (!tabSwitchEnabled) {
        debugLog('Tab switch is disabled, ignoring visibility change');
        return;
    }

    const video = getVideo();
    if (!video) return;

    debugLog('Tab visibility changed, hidden:', document.hidden);

    if (document.hidden) {
        if (!video.paused && video.currentTime > 0 && !video.ended) {
            debugLog('Enabling PiP on tab switch');
            enablePiP();
        }
    } else {
        if (document.hasFocus() && isPiPActive(video)) {
            debugLog('Disabling PiP on tab switch');
            disablePiP();
        }
    }
});

window.addEventListener("blur", (event) => {
    // Ignore blur events triggered by tab switching
    if (!event.isTrusted || document.hidden) {
        return;
    }

    // Check if window switch is enabled before proceeding
    if (!windowSwitchEnabled) {
        debugLog('Window switch is disabled, ignoring blur');
        return;
    }
    
    // Wait briefly to check if focus moved to another element within the same document
    setTimeout(() => {
        // If focus is still within the document, it's just an internal focus change (e.g., clicking chat)
        if (document.hasFocus()) {
            debugLog('Focus is still within document, ignoring blur');
            return;
        }
        
        const video = getVideo();
        if (!video) return;

        if (!video.paused && video.currentTime > 0 && !video.ended) {
            debugLog('Enabling PiP on window blur');
            enablePiP();
        }
    }, FOCUS_CHECK_DELAY_MS);
});

window.addEventListener("focus", (event) => {
    // Ignore focus events triggered by tab switching
    if (!event.isTrusted || document.hidden) {
        return;
    }

    // Check if window switch is enabled before proceeding
    if (!windowSwitchEnabled) {
        debugLog('Window switch is disabled, ignoring focus');
        return;
    }

    const video = getVideo();
    if (!video) return;

    if (!document.hidden && document.hasFocus() && isPiPActive(video)) {
        debugLog('Disabling PiP on window focus');
        disablePiP();
    }
});

// Scroll event listener
window.addEventListener('scroll', debounce(() => {
    if (!scrollSwitchEnabled) {
        debugLog('Scroll switch is disabled, ignoring scroll');
        return;
    }

    const video = getVideo();
    if (!video || !isYouTubePage()) return;
    
    const videoVisible = isElementInViewport(video);
    
    if (!videoVisible && isVideoVisible && !video.paused) {
        debugLog('Video scrolled out of view, enabling PiP');
        enablePiP();
        isVideoVisible = false;
    } else if (videoVisible && !isVideoVisible) {
        debugLog('Video scrolled into view, disabling PiP');
        disablePiP();
        isVideoVisible = true;
    }
}, 150));

// Debounce helper function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Helper function to check if current page is YouTube
function isYouTubePage() {
    const allowedHosts = ['youtube.com', 'www.youtube.com'];
        const hostname = window.location.hostname;
        return allowedHosts.includes(hostname);
}

// Watch for DOM changes
new MutationObserver(checkForVideo).observe(document, {
    subtree: true,
    childList: true
});

function dispatchMessage(messageName, parameters) {
    browser.runtime.sendMessage({
        name: messageName,
        params: parameters
    });
}

var previousResult = null;

function checkForVideo() {
    if (getVideo() != null) {
        if (previousResult === null || previousResult === false) {
            dispatchMessage("videoCheck", {found: true});
        }
        previousResult = true;
    } else if (window == window.top) {
        if (previousResult === null || previousResult === true) {
            dispatchMessage("videoCheck", {found: false});
        }
        previousResult = false;
    }
}

function getVideo() {
    // Prioritize YouTube player
    const youtubeVideo = document.querySelector('.html5-main-video');
    if (youtubeVideo) return youtubeVideo;
    
    // Disney+ Videoplayer
    const disneyPlusVideo = document.querySelector('#hivePlayer');
    if (disneyPlusVideo) return disneyPlusVideo;

    // Twitch: Search for typical Twitch video containers
    const twitchVideo = document.querySelector('.video-player__container video, video[data-a-player-state]');
    if (twitchVideo) return twitchVideo;

    // Fallback: Search for generic video-Element
    return document.querySelector('video');
}

function enablePiP() {
    // Check if current site is blacklisted
    if (isBlacklisted()) {
        debugLog('Site is blacklisted, skipping PiP activation');
        return;
    }
    
    const video = getVideo();
    if (!video) {
        debugLog('No video element found for PiP');
        return;
    }
    
    if (!video.paused && video.currentTime > 0 && !video.ended) {
        try {
            if (video.webkitSupportsPresentationMode &&
                typeof video.webkitSetPresentationMode === "function") {
                video.webkitSetPresentationMode('picture-in-picture');
                debugLog('PiP enabled successfully (webkit)');
            } else if (typeof video.requestPictureInPicture === "function") {
                video.requestPictureInPicture()
                    .then(() => debugLog('PiP enabled successfully (standard)'))
                    .catch(error => {
                        console.error('[AutoPiP] PiP request failed:', error.message || error);
                        debugLog('PiP activation failed:', error.name);
                    });
            } else {
                debugLog('PiP not supported on this video element');
            }
        } catch (error) {
            console.error('[AutoPiP] PiP enable exception:', error.message || error);
            debugLog('PiP activation exception:', error.name);
        }
    } else {
        debugLog('Video not in playable state for PiP:', {
            paused: video.paused,
            currentTime: video.currentTime,
            ended: video.ended
        });
    }
}

function disablePiP() {
    const video = getVideo();
    if (!video) {
        debugLog('No video element found for PiP disable');
        return;
    }

    try {
        if (video.webkitSupportsPresentationMode &&
            typeof video.webkitSetPresentationMode === "function") {
            video.webkitSetPresentationMode('inline');
            debugLog('PiP disabled successfully (webkit)');
        } else if (document.pictureInPictureElement) {
            document.exitPictureInPicture()
                .then(() => debugLog('PiP disabled successfully (standard)'))
                .catch(error => {
                    console.error('[AutoPiP] PiP exit failed:', error.message || error);
                    debugLog('PiP exit failed:', error.name);
                });
        } else {
            debugLog('No active PiP to disable');
        }
    } catch (error) {
        console.error('[AutoPiP] PiP disable exception:', error.message || error);
        debugLog('PiP disable exception:', error.name);
    }
}
