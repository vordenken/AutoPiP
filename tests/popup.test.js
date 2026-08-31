const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const popupScript = fs.readFileSync(
    path.join(__dirname, '..', 'AutoPiP Extension', 'Resources', 'popup.js'),
    'utf8'
);

class FakeClassList {
    constructor() {
        this.values = new Set();
    }

    add(...names) {
        names.forEach((name) => this.values.add(name));
    }

    remove(...names) {
        names.forEach((name) => this.values.delete(name));
    }

    contains(name) {
        return this.values.has(name);
    }

    toggle(name, force) {
        const enabled = force === undefined ? !this.contains(name) : force;
        enabled ? this.add(name) : this.remove(name);
        return enabled;
    }
}

class FakeElement {
    constructor() {
        this.checked = false;
        this.children = [];
        this.classList = new FakeClassList();
        this.dataset = {};
        this.disabled = false;
        this.listeners = new Map();
        this.style = {};
        this.textContent = '';
    }

    addEventListener(type, listener) {
        const listeners = this.listeners.get(type) || [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
    }

    removeEventListener(type, listener) {
        const listeners = this.listeners.get(type) || [];
        this.listeners.set(type, listeners.filter((candidate) => candidate !== listener));
    }

    appendChild(child) {
        this.children.push(child);
    }

    focus() {}

    setAttribute(name, value) {
        this[name] = value;
    }
}

function loadPopup({ storage = {}, activeUrl = 'https://media.example.com/watch' } = {}) {
    const elements = new Map();
    const document = new FakeElement();
    document.getElementById = (id) => {
        if (!elements.has(id)) elements.set(id, new FakeElement());
        return elements.get(id);
    };
    document.createElement = () => new FakeElement();

    const storageWrites = [];
    const messages = [];
    const tabs = [{ id: 1, url: activeUrl }, { id: 2, url: 'https://example.org' }];
    const browser = {
        runtime: {
            lastError: null,
            getManifest: () => ({ version: '2.1.0' })
        },
        storage: {
            local: {
                get: async () => storage,
                set: async (items) => { storageWrites.push(JSON.parse(JSON.stringify(items))); }
            }
        },
        tabs: {
            query(options, callback) {
                const result = options.active ? [tabs[0]] : tabs;
                if (callback) {
                    callback(result);
                    return undefined;
                }
                return Promise.resolve(result);
            },
            sendMessage: async (tabId, message) => {
                messages.push({ tabId, message: JSON.parse(JSON.stringify(message)) });
            }
        }
    };

    const quietConsole = { error() {}, log() {}, warn() {} };
    const context = vm.createContext({ browser, console: quietConsole, document, Promise, URL });
    vm.runInContext(popupScript, context, { filename: 'popup.js' });

    return {
        context,
        elements,
        messages,
        storageWrites,
        evaluate(expression) {
            return vm.runInContext(expression, context);
        }
    };
}

test('hostname extraction supports full and root-domain modes', () => {
    const harness = loadPopup();

    assert.equal(
        harness.evaluate("extractHostname('https://media.example.com/watch', true)"),
        'media.example.com'
    );
    assert.equal(
        harness.evaluate("extractHostname('https://media.example.com/watch', false)"),
        'example.com'
    );
    assert.equal(harness.evaluate("extractHostname('not a URL', true)"), '');
});

test('shortcut labels use physical key codes and native modifier symbols', () => {
    const harness = loadPopup();

    assert.equal(harness.evaluate("formatShortcutLabel('alt', 'KeyP')"), '\u2325P');
});

test('mode rendering switches the visible list and active button', () => {
    const harness = loadPopup();

    harness.evaluate("renderMode('whitelist')");

    assert.equal(harness.elements.get('blacklistSection').classList.contains('hidden'), true);
    assert.equal(harness.elements.get('whitelistSection').classList.contains('hidden'), false);
    assert.equal(harness.elements.get('whitelistModeBtn').classList.contains('active'), true);
});

test('moving a site to the blacklist removes it from the whitelist', async () => {
    const harness = loadPopup();
    harness.evaluate("blacklistedSites = []; whitelistedSites = ['example.com']; currentTabUrl = null");

    await harness.evaluate("addToBlacklist('example.com')");

    assert.equal(harness.evaluate("blacklistedSites.includes('example.com')"), true);
    assert.equal(harness.evaluate("whitelistedSites.includes('example.com')"), false);
    assert.equal(
        harness.storageWrites.some((write) => Array.isArray(write.whitelistedSites) && write.whitelistedSites.length === 0),
        true
    );
});