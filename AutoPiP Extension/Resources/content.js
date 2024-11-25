// content.js
document.addEventListener("visibilitychange", function() {
    const video = getVideo();
    if (!video) return;

    if (document.hidden) {
        // Tab wird verlassen - aktiviere PiP wenn Video läuft
        if (!video.paused && video.currentTime > 0 && !video.ended) {
            enablePiP();
        }
    } else {
        // Tab wird wieder aktiv - beende PiP
        if (document.pictureInPictureElement ||
            (video.webkitPresentationMode && video.webkitPresentationMode === "picture-in-picture")) {
            disablePiP();
        }
    }
});

// DOM Änderungen überwachen
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
    // Priorisiere YouTube Player
    const youtubeVideo = document.querySelector('.html5-main-video');
    if (youtubeVideo) return youtubeVideo;
    
    // Fallback für andere Video-Player
    return document.querySelector('video');
}

function enablePiP() {
    const video = getVideo();
    if (!video) return;
    
    // Prüfe ob Video wirklich läuft
    if (!video.paused && video.currentTime > 0 && !video.ended) {
        try {
            if (video.webkitSupportsPresentationMode &&
                typeof video.webkitSetPresentationMode === "function") {
                video.webkitSetPresentationMode('picture-in-picture');
            } else {
                video.requestPictureInPicture()
                    .catch(console.error);
            }
        } catch (error) {
            console.error('PiP Fehler:', error);
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
    } catch (error) {
        console.error('PiP Deaktivierung Fehler:', error);
    }
}
