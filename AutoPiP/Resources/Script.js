/* ===== Onboarding Navigation ===== */

function showPage(id) {
    document.querySelectorAll('.page').forEach(function(p) { p.classList.add('hidden'); });
    document.getElementById(id).classList.remove('hidden');
}

function startOnboarding() {
    showPage('page-welcome');
}

/* ===== Version (called from Swift) ===== */

function setVersion(v) {
    var text = 'v' + v;
    var el = document.getElementById('version-label');
    if (el) el.textContent = text;
    var el2 = document.getElementById('main-version-label');
    if (el2) el2.textContent = text;
}

/* ===== Main view (called from Swift) ===== */

function show(enabled, useSettingsInsteadOfPreferences) {
    showPage('page-main');

    if (useSettingsInsteadOfPreferences) {
        document.getElementsByClassName('state-on')[0].innerText = "AutoPiP\u2019s extension is currently on. You can turn it off in the Extensions section of Safari Settings.";
        document.getElementsByClassName('state-off')[0].innerText = "AutoPiP\u2019s extension is currently off. You can turn it on in the Extensions section of Safari Settings.";
        document.getElementsByClassName('state-unknown')[0].innerText = "You can turn on AutoPiP\u2019s extension in the Extensions section of Safari Settings.";
        document.getElementsByClassName('open-preferences')[0].innerText = "Open Safari Settings\u2026";
    }

    if (typeof enabled === "boolean") {
        document.body.classList.toggle('state-on', enabled);
        document.body.classList.toggle('state-off', !enabled);
    } else {
        document.body.classList.remove('state-on');
        document.body.classList.remove('state-off');
    }
}

function setUpdateSettings(settings) {
    document.getElementById('auto-check-toggle').checked = settings.autoCheck;
    document.getElementById('auto-download-toggle').checked = settings.autoDownload;
    document.getElementById('auto-download-toggle').disabled = !settings.autoCheck;
    document.getElementById('beta-toggle').checked = settings.beta;
}

/* ===== Event Listeners ===== */

document.addEventListener('DOMContentLoaded', function() {

    /* --- Onboarding Page 1 --- */
    document.getElementById('welcome-next').addEventListener('click', function() {
        showPage('page-features');
    });

    /* --- Onboarding Page 2 (Features) --- */
    document.getElementById('features-back').addEventListener('click', function() {
        showPage('page-welcome');
    });
    document.getElementById('features-next').addEventListener('click', function() {
        showPage('page-updates');
    });

    /* --- Onboarding Page 3 (Updates) --- */
    document.getElementById('updates-back').addEventListener('click', function() {
        showPage('page-features');
    });

    document.getElementById('onb-auto-check').addEventListener('change', function() {
        var dl = document.getElementById('onb-auto-download');
        dl.disabled = !this.checked;
        if (!this.checked) dl.checked = false;
    });

    document.getElementById('onb-check-updates').addEventListener('click', function() {
        webkit.messageHandlers.controller.postMessage("check-for-updates");
    });

    document.getElementById('updates-done').addEventListener('click', function() {
        var settings = {
            autoCheck: document.getElementById('onb-auto-check').checked,
            autoDownload: document.getElementById('onb-auto-download').checked,
            beta: document.getElementById('onb-beta').checked
        };
        webkit.messageHandlers.controller.postMessage("onboarding-done:" + JSON.stringify(settings));
    });

    /* --- Support links (open in default browser) --- */
    document.querySelectorAll('.support-links a').forEach(function(link) {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            webkit.messageHandlers.controller.postMessage("open-url:" + this.href);
        });
    });

    /* --- Main view controls --- */
    document.querySelector("button.open-preferences").addEventListener("click", function() {
        webkit.messageHandlers.controller.postMessage("open-preferences");
    });

    document.getElementById('check-updates-btn').addEventListener('click', function() {
        webkit.messageHandlers.controller.postMessage("check-for-updates");
    });

    document.getElementById('auto-check-toggle').addEventListener('change', function() {
        webkit.messageHandlers.controller.postMessage("set-auto-check:" + this.checked);
        var dl = document.getElementById('auto-download-toggle');
        dl.disabled = !this.checked;
        if (!this.checked) dl.checked = false;
    });

    document.getElementById('auto-download-toggle').addEventListener('change', function() {
        webkit.messageHandlers.controller.postMessage("set-auto-download:" + this.checked);
    });

    document.getElementById('beta-toggle').addEventListener('change', function() {
        webkit.messageHandlers.controller.postMessage("set-beta:" + this.checked);
    });
});
