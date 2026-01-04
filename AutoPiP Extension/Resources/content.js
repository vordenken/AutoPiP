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

// Debug logging helper
function debugLog(...args) {
    if (DEBUG_LOGGING) {
        console.log('[AutoPiP]', ...args);
    }
}

// Load initial status
browser.storage.local.get(['tabSwitchEnabled', 'windowSwitchEnabled', 'scrollSwitchEnabled', 'debugLoggingEnabled'], function(result) {
    tabSwitchEnabled = result.tabSwitchEnabled === undefined ? true : result.tabSwitchEnabled;
    windowSwitchEnabled = result.windowSwitchEnabled === undefined ? true : result.windowSwitchEnabled;
    scrollSwitchEnabled = result.scrollSwitchEnabled === undefined ? true : result.scrollSwitchEnabled;
    DEBUG_LOGGING = result.debugLoggingEnabled === undefined ? false : result.debugLoggingEnabled;
    debugLog('Initial status loaded - Tab Switch:', tabSwitchEnabled,
                'Window Switch:', windowSwitchEnabled,
                'Scroll Switch:', scrollSwitchEnabled);
});

// Message listener for toggle commands
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
});

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
    const video = getVideo();
    if (!video) return;
    
    if (!video.paused && video.currentTime > 0 && !video.ended) {
        try {
            if (video.webkitSupportsPresentationMode &&
                typeof video.webkitSetPresentationMode === "function") {
                video.webkitSetPresentationMode('picture-in-picture');
            } else {
                video.requestPictureInPicture()
                    .catch(console.error);
            }
            debugLog('PiP enabled successfully');
        } catch (error) {
            console.error('PiP enable error:', error);
        }
    }
}

function disablePiP() {
    const video = getVideo();
    if (!video) return;

    try {
        if (video.webkitSupportsPresentationMode &&
            typeof video.webkitSetPresentationMode === "function") {
            video.webkitSetPresentationMode('inline');
        } else if (document.pictureInPictureElement) {
            document.exitPictureInPicture();
        }
        debugLog('PiP disabled successfully');
    } catch (error) {
        console.error('PiP disable error:', error);
    }
}
