// content.js

// Configuration constants
const FOCUS_CHECK_DELAY_MS = 100; // Delay to distinguish internal focus changes from actual window blur
const CACHE_DURATION_MS = 1000; // Video selector cache duration in milliseconds
const INTERSECTION_THRESHOLD = 0.1; // IntersectionObserver threshold (10% visibility)
const DOM_READY_DELAY_MS = 500; // Delay before initializing IntersectionObserver

let DEBUG_LOGGING = false; // Can be toggled via popup settings

// State variables
let tabSwitchEnabled = true;
let windowSwitchEnabled = true;
let scrollSwitchEnabled = true;
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

// === HELPER FUNCTIONS ===

/**
 * Check if video is in playable state
 * @param {HTMLVideoElement} video - Video element to check
 * @returns {boolean} - True if video can be played
 */
function isVideoPlayable(video) {
    return !video.paused && video.currentTime > 0 && !video.ended;
}

/**
 * Set webkit presentation mode if supported
 * @param {HTMLVideoElement} video - Video element
 * @param {string} mode - Presentation mode ('picture-in-picture' or 'inline')
 * @returns {boolean} - True if mode was set successfully
 */
function setWebkitPresentationMode(video, mode) {
    if (video.webkitSupportsPresentationMode && 
        typeof video.webkitSetPresentationMode === 'function') {
        video.webkitSetPresentationMode(mode);
        return true;
    }
    return false;
}

/**
 * Disable PiP if currently active
 */
function disablePiPIfActive() {
    const video = getVideo();
    if (video && isPiPActive(video)) {
        disablePiP();
    }
}

/**
 * Check if video cache is still valid
 * @param {number} now - Current timestamp
 * @returns {boolean} - True if cache is valid
 */
function isCacheValid(now) {
    return cachedVideo && 
           now - cacheTimestamp < CACHE_DURATION_MS && 
           document.contains(cachedVideo);
}

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
// Message handler map
const messageHandlers = {
    toggleTabSwitch: (message) => {
        tabSwitchEnabled = message.enabled;
        debugLog('Tab Switch toggled to:', tabSwitchEnabled);
        
        if (!tabSwitchEnabled) {
            disablePiPIfActive();
        }
        
        return { enabled: tabSwitchEnabled };
    },
    
    toggleWindowSwitch: (message) => {
        windowSwitchEnabled = message.enabled;
        debugLog('Window Switch toggled to:', windowSwitchEnabled);
        
        if (!windowSwitchEnabled) {
            disablePiPIfActive();
        }
        
        return { enabled: windowSwitchEnabled };
    },
    
    toggleScrollSwitch: (message) => {
        scrollSwitchEnabled = message.enabled;
        debugLog('Scroll Switch toggled to:', scrollSwitchEnabled);
        
        // Re-setup observer when scroll switch is toggled
        setupVideoObserver();
        
        if (!scrollSwitchEnabled) {
            disablePiPIfActive();
        }
        
        return { enabled: scrollSwitchEnabled };
    },
    
    toggleDebugLogging: (message) => {
        DEBUG_LOGGING = message.enabled;
        debugLog('Debug Logging toggled to:', DEBUG_LOGGING);
        
        return { enabled: DEBUG_LOGGING };
    },
    
    updateBlacklist: (message) => {
        blacklistedSites = message.sites || [];
        debugLog('Blacklist updated to:', blacklistedSites);
        
        // Disable PiP if current site is now blacklisted
        if (isBlacklisted()) {
            disablePiPIfActive();
        }
        
        return { success: true };
    }
};

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const handler = messageHandlers[message.command];
    
    if (handler) {
        const response = handler(message);
        sendResponse(response);
        return true;
    }
    
    return false;
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
        (video.webkitPresentationMode && video.webkitPresentationMode === 'picture-in-picture');
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
        if (isVideoPlayable(video)) {
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

        if (isVideoPlayable(video)) {
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

// IntersectionObserver for scroll-based PiP (better performance than scroll listener)
let videoObserver = null;
let observedVideo = null;

function setupVideoObserver() {
    if (!scrollSwitchEnabled || !isYouTubePage()) {
        if (videoObserver && observedVideo) {
            videoObserver.unobserve(observedVideo);
            observedVideo = null;
        }
        return;
    }

    const video = getVideo();
    if (!video || video === observedVideo) return;

    // Clean up previous observer
    if (videoObserver && observedVideo) {
        videoObserver.unobserve(observedVideo);
    }

    // Track visibility state for this video
    let wasVisible = isElementInViewport(video);

    // Create observer if needed
    if (!videoObserver) {
        videoObserver = new IntersectionObserver((entries) => {
            if (!scrollSwitchEnabled) return;

            entries.forEach(entry => {
                const video = entry.target;
                const isVisible = entry.isIntersecting;

                if (!isVisible && wasVisible && !video.paused) {
                    debugLog('Video scrolled out of view, enabling PiP');
                    enablePiP();
                    wasVisible = false;
                } else if (isVisible && !wasVisible) {
                    debugLog('Video scrolled into view, disabling PiP');
                    disablePiP();
                    wasVisible = true;
                }
            });
        }, {
            threshold: INTERSECTION_THRESHOLD
        });
    }

    // Observe new video
    videoObserver.observe(video);
    observedVideo = video;
}

// Helper function to check if current page is YouTube
function isYouTubePage() {
    const hostname = window.location.hostname;
    return ['youtube.com', 'www.youtube.com'].includes(hostname);
}

// Watch for DOM changes and invalidate video cache
new MutationObserver(() => {
    invalidateVideoCache();
}).observe(document, {
    subtree: true,
    childList: true
});

// Video selector caching with invalidation
let cachedVideo = null;
let cacheTimestamp = 0;

// Video selectors in priority order
const VIDEO_SELECTORS = [
    { name: 'YouTube', selector: '.html5-main-video' },
    { name: 'Disney+', selector: '#hivePlayer' },
    { name: 'Twitch', selector: '.video-player__container video, video[data-a-player-state]' },
    { name: 'Generic', selector: 'video' }
];

function getVideo() {
    const now = Date.now();
    
    // Return cached video if still valid
    if (isCacheValid(now)) {
        return cachedVideo;
    }
    
    // Try each selector in priority order
    for (const { selector } of VIDEO_SELECTORS) {
        const video = document.querySelector(selector);
        if (video) {
            cachedVideo = video;
            cacheTimestamp = now;
            return video;
        }
    }
    
    return null;
}

// Invalidate video cache when DOM changes significantly
function invalidateVideoCache() {
    cachedVideo = null;
    cacheTimestamp = 0;
}

// Initialize IntersectionObserver after getVideo is defined
// Wait for DOM to be ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(setupVideoObserver, DOM_READY_DELAY_MS);
    });
} else {
    setTimeout(setupVideoObserver, DOM_READY_DELAY_MS);
}

// === PIP CONTROL FUNCTIONS ===

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
    
    if (!isVideoPlayable(video)) {
        debugLog('Video not in playable state for PiP:', {
            paused: video.paused,
            currentTime: video.currentTime,
            ended: video.ended
        });
        return;
    }
    
    try {
        if (setWebkitPresentationMode(video, 'picture-in-picture')) {
            debugLog('PiP enabled successfully');
        } else {
            debugLog('PiP not supported on this video element');
        }
    } catch (error) {
        console.error('[AutoPiP] PiP enable exception:', error.message || error);
        debugLog('PiP activation exception:', error.name);
    }
}

function disablePiP() {
    const video = getVideo();
    if (!video) {
        debugLog('No video element found for PiP disable');
        return;
    }
    
    if (!isPiPActive(video)) {
        debugLog('No active PiP to disable');
        return;
    }

    try {
        if (setWebkitPresentationMode(video, 'inline')) {
            debugLog('PiP disabled successfully');
        } else {
            debugLog('PiP disable failed - webkit API not available');
        }
    } catch (error) {
        console.error('[AutoPiP] PiP disable exception:', error.message || error);
        debugLog('PiP disable exception:', error.name);
    }
}
