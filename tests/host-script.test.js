const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const hostScript = fs.readFileSync(
    path.join(__dirname, '..', 'AutoPiP', 'Resources', 'Script.js'),
    'utf8'
);

class FakeElement {
    constructor() {
        this.checked = false;
        this.classList = {
            values: new Set(),
            add: (...names) => names.forEach((name) => this.classList.values.add(name)),
            remove: (...names) => names.forEach((name) => this.classList.values.delete(name)),
            toggle: (name, force) => force ? this.classList.values.add(name) : this.classList.values.delete(name)
        };
        this.disabled = false;
        this.href = '';
        this.listeners = new Map();
        this.textContent = '';
    }

    addEventListener(type, listener) {
        const listeners = this.listeners.get(type) || [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
    }

    dispatch(type, event = {}) {
        for (const listener of this.listeners.get(type) || []) listener.call(this, event);
    }
}

function loadHostScript() {
    const ids = [
        'page-welcome', 'page-features', 'page-updates', 'page-main',
        'version-label', 'main-version-label', 'welcome-next', 'features-back',
        'features-next', 'updates-back', 'onb-auto-check', 'onb-auto-download',
        'onb-beta', 'onb-check-updates', 'updates-done', 'check-updates-btn',
        'auto-check-toggle', 'auto-download-toggle', 'beta-toggle'
    ];
    const elements = new Map(ids.map((id) => [id, new FakeElement()]));
    const preferencesButton = new FakeElement();
    const links = ['https://github.com/vordenken/AutoPiP', 'https://ko-fi.com/vordenken']
        .map((href) => Object.assign(new FakeElement(), { href }));
    const stateElements = new Map([
        ['state-on', [new FakeElement()]],
        ['state-off', [new FakeElement()]],
        ['state-unknown', [new FakeElement()]],
        ['open-preferences', [preferencesButton]]
    ]);
    const document = new FakeElement();
    document.body = new FakeElement();
    document.getElementById = (id) => elements.get(id);
    document.getElementsByClassName = (name) => stateElements.get(name) || [];
    document.querySelector = () => preferencesButton;
    document.querySelectorAll = (selector) => selector === '.page'
        ? ['page-welcome', 'page-features', 'page-updates', 'page-main'].map((id) => elements.get(id))
        : links;

    const messages = [];
    const context = vm.createContext({
        document,
        webkit: {
            messageHandlers: {
                controller: { postMessage: (message) => messages.push(message) }
            }
        }
    });
    vm.runInContext(hostScript, context, { filename: 'Script.js' });
    document.dispatch('DOMContentLoaded');

    return { context, document, elements, messages };
}

test('onboarding navigation advances and returns between pages', () => {
    const harness = loadHostScript();

    vm.runInContext('startOnboarding()', harness.context);
    assert.equal(harness.elements.get('page-welcome').classList.values.has('hidden'), false);

    harness.elements.get('welcome-next').dispatch('click');
    assert.equal(harness.elements.get('page-features').classList.values.has('hidden'), false);

    harness.elements.get('features-next').dispatch('click');
    assert.equal(harness.elements.get('page-updates').classList.values.has('hidden'), false);

    harness.elements.get('updates-back').dispatch('click');
    assert.equal(harness.elements.get('page-features').classList.values.has('hidden'), false);
});

test('disabling automatic checks also disables automatic downloads', () => {
    const harness = loadHostScript();
    const autoCheck = harness.elements.get('onb-auto-check');
    const autoDownload = harness.elements.get('onb-auto-download');
    autoCheck.checked = false;
    autoDownload.checked = true;

    autoCheck.dispatch('change');

    assert.equal(autoDownload.checked, false);
    assert.equal(autoDownload.disabled, true);
    assert.deepEqual(harness.messages, ['set-auto-check:false', 'set-auto-download:false']);
});

test('finishing onboarding sends all selected update settings', () => {
    const harness = loadHostScript();
    harness.elements.get('onb-auto-check').checked = true;
    harness.elements.get('onb-auto-download').checked = true;
    harness.elements.get('onb-beta').checked = false;

    harness.elements.get('updates-done').dispatch('click');

    assert.equal(
        harness.messages.at(-1),
        'onboarding-done:{"autoCheck":true,"autoDownload":true,"beta":false}'
    );
});