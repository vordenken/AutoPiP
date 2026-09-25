const video = document.querySelector('#test-video');
const playback = document.querySelector('#playback');
const mode = document.querySelector('#mode');
const history = document.querySelector('#history');
const events = document.querySelector('#events');
const transitions = ['inline'];
const runID = new URLSearchParams(location.search).get('id') || 'manual';

// The audio track is silent, but nonzero volume keeps Safari playing across tabs.
video.volume = 1;
playback.textContent = `Playback ${runID}: stopped`;
history.setAttribute('aria-label', `PiP transitions ${runID}`);
history.value = 'inline';
events.setAttribute('aria-label', `Visibility events ${runID}`);
mode.textContent = `PiP ${runID}: inline`;

document.addEventListener('visibilitychange', (event) => {
    events.value += `; hidden=${document.hidden}, trusted=${event.isTrusted}, source=${Boolean(event.sourceCapabilities)}, paused=${video.paused}, time=${video.currentTime.toFixed(1)}`;
});

function currentMode() {
    if (video.webkitPresentationMode) return video.webkitPresentationMode;
    return document.pictureInPictureElement === video ? 'picture-in-picture' : 'inline';
}

function recordMode() {
    const value = currentMode();
    mode.textContent = `PiP ${runID}: ${value}`;
    if (transitions[transitions.length - 1] !== value) {
        transitions.push(value);
        history.value = transitions.join(', ');
    }
}

video.addEventListener('webkitpresentationmodechanged', recordMode);
video.addEventListener('enterpictureinpicture', recordMode);
video.addEventListener('leavepictureinpicture', recordMode);
video.addEventListener('timeupdate', () => {
    if (!video.paused && video.currentTime > 0) {
        playback.textContent = `Playback ${runID}: playing`;
    }
});

const playButton = document.querySelector('#play');
playButton.textContent = `Play test video ${runID}`;
playButton.addEventListener('click', async () => {
    try {
        await video.play();
    } catch (error) {
        playback.textContent = `Playback ${runID}: ${error.name}`;
    }
});
playButton.focus();

setInterval(recordMode, 250);
