const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const contentScript = fs.readFileSync(
    path.join(__dirname, '..', 'AutoPiP Extension', 'Resources', 'content.js'),
    'utf8'
);

class FakeEventTarget {
    constructor() {
        this.listeners = new Map();
    }

    addEventListener(type, listener) {
        const listeners = this.listeners.get(type) || [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
    }

    dispatch(type, event = {}) {
        for (const listener of this.listeners.get(type) || []) {
            listener(event);
        }
    }
}

function createVideo(overrides = {}) {
    return {
        paused: false,
        currentTime: 10,
        ended: false,
        webkitSupportsPresentationMode: true,
        webkitPresentationMode: 'inline',
        presentationModes: [],
        getBoundingClientRect() {
            return { top: 0, left: 0, bottom: 720, right: 1280, height: 720 };
        },
        webkitSetPresentationMode(mode) {
            this.webkitPresentationMode = mode;
            this.presentationModes.push(mode);
        },
        ...overrides
    };
}

function loadContentScript({ hostname = 'www.youtube.com', storage = {}, video = createVideo(), deferFocusTimers = false } = {}) {
    let hasFocus = true;
    let mutationCallback;
    let queryCount = 0;
    const pendingFocusTimers = [];
    const document = new FakeEventTarget();
    Object.assign(document, {
        hidden: false,
        readyState: 'complete',
        pictureInPictureElement: null,
        documentElement: { clientHeight: 900, clientWidth: 1440 },
        hasFocus: () => hasFocus,
        contains: (element) => element === video,
        querySelector: () => {
            queryCount += 1;
            return video;
        }
    });

    const window = new FakeEventTarget();
    Object.assign(window, {
        document,
        location: { hostname },
        innerHeight: 900,
        innerWidth: 1440
    });

    let messageListener;
    let observerCallback;
    const context = vm.createContext({
        browser: {
            runtime: {
                lastError: null,
                onMessage: { addListener: (listener) => { messageListener = listener; } }
            },
            storage: { local: { get: async () => storage } }
        },
        console,
        document,
        window,
        MutationObserver: class {
            constructor(callback) {
                mutationCallback = callback;
            }

            observe() {}
        },
        IntersectionObserver: class {
            constructor(callback) {
                observerCallback = callback;
            }

            observe() {}
            unobserve() {}
        },
        setTimeout: (callback, delay) => {
            if (deferFocusTimers && delay === 100) {
                pendingFocusTimers.push(callback);
                return 1;
            }
            callback();
            return 1;
        },
        clearTimeout() {}
    });

    vm.runInContext(contentScript, context, { filename: 'content.js' });

    return {
        context,
        document,
        window,
        video,
        evaluate(expression) {
            return vm.runInContext(expression, context);
        },
        dispatchMessage(message) {
            let response;
            messageListener(message, {}, (value) => { response = value; });
            return response;
        },
        getQueryCount() {
            return queryCount;
        },
        intersect(entries) {
            observerCallback(entries);
        },
        mutate() {
            mutationCallback();
        },
        setFocus(value) {
            hasFocus = value;
        },
        runFocusTimers() {
            for (const callback of pendingFocusTimers.splice(0)) callback();
        }
    };
}

test('trusted tab switch enters and leaves Picture-in-Picture', () => {
    const harness = loadContentScript();

    harness.document.hidden = true;
    harness.document.dispatch('visibilitychange', { isTrusted: true });
    assert.deepEqual(harness.video.presentationModes, ['picture-in-picture']);

    harness.document.hidden = false;
    harness.document.dispatch('visibilitychange', { isTrusted: true });
    assert.deepEqual(harness.video.presentationModes, ['picture-in-picture', 'inline']);
});

test('untrusted visibility events are ignored', () => {
    const harness = loadContentScript();

    harness.document.hidden = true;
    harness.document.dispatch('visibilitychange', { isTrusted: false });

    assert.deepEqual(harness.video.presentationModes, []);
});

test('global switch and site lists gate automatic Picture-in-Picture', () => {
    const disabledHarness = loadContentScript();
    const response = disabledHarness.dispatchMessage({ command: 'toggleAutoPiP', enabled: false });
    assert.equal(response.enabled, false);
    disabledHarness.document.hidden = true;
    disabledHarness.document.dispatch('visibilitychange', { isTrusted: true });
    assert.deepEqual(disabledHarness.video.presentationModes, []);

    const blacklistHarness = loadContentScript();
    blacklistHarness.dispatchMessage({ command: 'updateBlacklist', sites: ['youtube.com'] });
    blacklistHarness.document.hidden = true;
    blacklistHarness.document.dispatch('visibilitychange', { isTrusted: true });
    assert.deepEqual(blacklistHarness.video.presentationModes, []);

    const whitelistHarness = loadContentScript();
    whitelistHarness.dispatchMessage({
        command: 'updateListMode',
        mode: 'whitelist',
        whitelistedSites: ['youtube.com']
    });
    whitelistHarness.document.hidden = true;
    whitelistHarness.document.dispatch('visibilitychange', { isTrusted: true });
    assert.deepEqual(whitelistHarness.video.presentationModes, ['picture-in-picture']);
});

test('window focus changes enter and leave Picture-in-Picture', () => {
    const harness = loadContentScript();

    harness.setFocus(false);
    harness.window.dispatch('blur', { isTrusted: true });
    assert.deepEqual(harness.video.presentationModes, ['picture-in-picture']);

    harness.setFocus(true);
    harness.window.dispatch('focus', { isTrusted: true });
    assert.deepEqual(harness.video.presentationModes, ['picture-in-picture', 'inline']);
});

test('hidden window blur enters PiP when visibilitychange is consumed', () => {
    const harness = loadContentScript();

    harness.document.hidden = true;
    harness.setFocus(false);
    harness.window.dispatch('blur', { isTrusted: true });
    assert.deepEqual(harness.video.presentationModes, ['picture-in-picture']);

    // Both events can arrive in the usual Safari path; PiP should enter once.
    harness.document.dispatch('visibilitychange', { isTrusted: true });
    assert.deepEqual(harness.video.presentationModes, ['picture-in-picture']);
});

test('hidden blur respects the tab switch setting', () => {
    const harness = loadContentScript();

    harness.dispatchMessage({ command: 'toggleTabSwitch', enabled: false });
    harness.document.hidden = true;
    harness.setFocus(false);
    harness.window.dispatch('blur', { isTrusted: true });
    assert.deepEqual(harness.video.presentationModes, []);
});

test('focus closes PiP after a hidden Space becomes visible', () => {
    const harness = loadContentScript({ deferFocusTimers: true });

    harness.dispatchMessage({ command: 'toggleWindowSwitch', enabled: false });
    harness.document.hidden = true;
    harness.setFocus(false);
    harness.window.dispatch('blur', { isTrusted: true });
    harness.runFocusTimers();
    assert.deepEqual(harness.video.presentationModes, ['picture-in-picture']);

    harness.setFocus(true);
    harness.window.dispatch('focus', { isTrusted: true });
    harness.document.hidden = false;
    harness.runFocusTimers();
    assert.deepEqual(harness.video.presentationModes, ['picture-in-picture', 'inline']);
});

test('focus leaves manually started PiP alone when window switching is disabled', () => {
    const harness = loadContentScript();

    harness.dispatchMessage({ command: 'toggleWindowSwitch', enabled: false });
    harness.video.webkitPresentationMode = 'picture-in-picture';
    harness.window.dispatch('focus', { isTrusted: true });
    assert.deepEqual(harness.video.presentationModes, []);
});

test('internal focus changes do not enter Picture-in-Picture', () => {
    const harness = loadContentScript();

    harness.window.dispatch('blur', { isTrusted: true });

    assert.deepEqual(harness.video.presentationModes, []);
});

test('YouTube scroll visibility drives Picture-in-Picture', () => {
    const harness = loadContentScript();

    harness.intersect([{ target: harness.video, isIntersecting: false }]);
    harness.intersect([{ target: harness.video, isIntersecting: true }]);

    assert.deepEqual(harness.video.presentationModes, ['picture-in-picture', 'inline']);
});

test('configured keyboard shortcut toggles manual Picture-in-Picture', () => {
    const harness = loadContentScript();
    let prevented = false;
    harness.dispatchMessage({ command: 'toggleKeyboardShortcut', enabled: true });
    harness.dispatchMessage({ command: 'updateShortcutKey', key: 'KeyP', modifier: 'alt' });

    harness.document.dispatch('keydown', {
        code: 'KeyP',
        altKey: true,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        preventDefault() { prevented = true; }
    });

    assert.equal(prevented, true);
    assert.deepEqual(harness.video.presentationModes, ['picture-in-picture']);
});

test('manual toggle falls back to the WebKit API when the standard API rejects', async () => {
    const video = createVideo({
        requestPictureInPicture: () => Promise.reject(new Error('not available'))
    });
    const harness = loadContentScript({ video });

    harness.evaluate('togglePiP()');
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(video.presentationModes, ['picture-in-picture']);
});

test('video lookup is cached until a DOM mutation invalidates it', () => {
    const harness = loadContentScript();
    const initialQueries = harness.getQueryCount();

    harness.evaluate('getVideo()');
    harness.evaluate('getVideo()');
    assert.equal(harness.getQueryCount(), initialQueries);

    harness.mutate();
    harness.evaluate('getVideo()');
    assert.equal(harness.getQueryCount(), initialQueries + 1);
});
