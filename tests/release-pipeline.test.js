const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const repositoryRoot = path.join(__dirname, '..');
const updateAppcast = path.join(repositoryRoot, 'scripts', 'update_appcast.py');
const workflowPath = path.join(repositoryRoot, '.github', 'workflows', 'build-release.yml');
const packageResolutionPath = path.join(
    repositoryRoot,
    'AutoPiP.xcodeproj',
    'project.xcworkspace',
    'xcshareddata',
    'swiftpm',
    'Package.resolved'
);

function appcastItem(version, { beta = false, build = 1 } = {}) {
    return `
        <item>
            <title>Version ${version}</title>
            ${beta ? '<sparkle:channel>beta</sparkle:channel>' : ''}
            <enclosure
                url="https://example.com/${version}.dmg"
                sparkle:version="${build}"
                sparkle:shortVersionString="${version}"
                sparkle:edSignature="old-signature"
                length="100"
                type="application/octet-stream"/>
        </item>`;
}

function createFixture(items) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'autopip-appcast-'));
    const appcast = path.join(directory, 'appcast.xml');
    const changelog = path.join(directory, 'changelog.txt');
    fs.writeFileSync(appcast, `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
    <channel>
        <title>AutoPiP Updates</title>${items.join('')}
    </channel>
</rss>
`);
    fs.writeFileSync(changelog, '### Changes\n- Safe & tested\n');
    return { directory, appcast, changelog };
}

function runUpdate(fixture, { channel, tag, version = '2.1.0', build = 50 }) {
    return spawnSync('python3', [
        updateAppcast,
        '--appcast', fixture.appcast,
        '--changelog', fixture.changelog,
        '--version', version,
        '--tag', tag,
        '--build', String(build),
        '--channel', channel,
        '--signature', 'new-signature',
        '--length', '200',
        '--max-betas', '5',
        '--date', 'Mon, 31 Aug 2026 12:00:00 +0000'
    ], { encoding: 'utf8' });
}

function assertValidXml(appcast) {
    const result = spawnSync(
        'python3',
        ['-c', 'from xml.dom import minidom; import sys; minidom.parse(sys.argv[1])', appcast],
        { encoding: 'utf8' }
    );
    assert.equal(result.status, 0, result.stderr);
}

test('beta update keeps five newest betas and every stable release', (context) => {
    const fixture = createFixture([
        appcastItem('2.1.0-beta6', { beta: true, build: 46 }),
        appcastItem('2.1.0-beta5', { beta: true, build: 45 }),
        appcastItem('2.1.0-beta4', { beta: true, build: 44 }),
        appcastItem('2.1.0-beta3', { beta: true, build: 43 }),
        appcastItem('2.1.0-beta2', { beta: true, build: 42 }),
        appcastItem('2.1.0-beta1', { beta: true, build: 41 }),
        appcastItem('2.0.0', { build: 10 }),
        appcastItem('1.0.1', { build: 5 })
    ]);
    context.after(() => fs.rmSync(fixture.directory, { recursive: true, force: true }));

    const result = runUpdate(fixture, { channel: 'beta', tag: 'v2.1.0-beta7' });
    assert.equal(result.status, 0, result.stderr);
    assertValidXml(fixture.appcast);

    const output = fs.readFileSync(fixture.appcast, 'utf8');
    assert.equal((output.match(/<sparkle:channel>beta<\/sparkle:channel>/g) || []).length, 5);
    assert.match(output, /sparkle:shortVersionString="2\.1\.0-beta7"/);
    assert.doesNotMatch(output, /sparkle:shortVersionString="2\.1\.0-beta2"/);
    assert.match(output, /sparkle:shortVersionString="2\.0\.0"/);
    assert.match(output, /sparkle:shortVersionString="1\.0\.1"/);
    assert.match(output, /<li>Safe &amp; tested<\/li>/);
});

test('stable promotion removes betas for that version but preserves other channels', (context) => {
    const fixture = createFixture([
        appcastItem('2.2.0-beta1', { beta: true, build: 60 }),
        appcastItem('2.1.0-beta2', { beta: true, build: 49 }),
        appcastItem('2.1.0-beta1', { beta: true, build: 48 }),
        appcastItem('2.0.0', { build: 10 })
    ]);
    context.after(() => fs.rmSync(fixture.directory, { recursive: true, force: true }));

    const result = runUpdate(fixture, { channel: 'stable', tag: 'v2.1.0' });
    assert.equal(result.status, 0, result.stderr);
    assertValidXml(fixture.appcast);

    const output = fs.readFileSync(fixture.appcast, 'utf8');
    assert.match(output, /sparkle:shortVersionString="2\.1\.0"/);
    assert.doesNotMatch(output, /sparkle:shortVersionString="2\.1\.0-beta/);
    assert.match(output, /sparkle:shortVersionString="2\.2\.0-beta1"/);
    assert.match(output, /sparkle:shortVersionString="2\.0\.0"/);
});

test('appcast updater rejects a tag that does not match the release channel', (context) => {
    const fixture = createFixture([]);
    context.after(() => fs.rmSync(fixture.directory, { recursive: true, force: true }));

    const result = runUpdate(fixture, { channel: 'stable', tag: 'v2.1.0-beta1' });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /does not match stable version/);
});

test('release workflow preserves immutable and serialized publishing', () => {
    const workflow = fs.readFileSync(workflowPath, 'utf8');

    assert.match(workflow, /- 'AutoPiPTests\/\*\*'/);
    assert.match(workflow, /- 'AutoPiPUITests\/\*\*'/);
    assert.match(workflow, /- 'tests\/\*\*'/);
    assert.match(workflow, /- '\.github\/workflows\/tests\.yml'/);
    assert.match(workflow, /cancel-in-progress: false/);
    assert.match(workflow, /EVENT_NAME.*workflow_dispatch|workflow_dispatch.*EVENT_NAME/s);
    assert.match(workflow, /REF_NAME.*!=.*main/);
    assert.match(workflow, /git diff --quiet.*semver\.txt/);
    assert.match(workflow, /refusing to move it/);
    assert.match(workflow, /git show origin\/main:appcast\.xml/);
    assert.match(workflow, /git worktree add --detach.*origin\/main/);
    assert.match(workflow, /git -C .* push origin HEAD:main/);
    assert.match(workflow, /CREATE_DMG_VERSION: '1\.3\.0'/);
    assert.match(workflow, /create-dmg\/archive\/refs\/tags\/v\$\{CREATE_DMG_VERSION\}/);
    assert.match(workflow, /SPARKLE_VERSION: '2\.9\.3'/);
    assert.match(workflow, /python3 scripts\/update_appcast\.py/);
    assert.match(workflow, /git tag --points-at.*GITHUB_SHA/s);
    assert.match(workflow, /Reusing.*for a retry/);
    assert.match(workflow, /tail -1 \|\| true/);
    assert.doesNotMatch(workflow, /git checkout -B appcast-main/);
    assert.doesNotMatch(workflow, /brew install create-dmg/);
    assert.doesNotMatch(workflow, /git tag -f|git push[^\n]*--force/);
});

test('release workflow uses the Sparkle version resolved by SwiftPM', () => {
    const workflow = fs.readFileSync(workflowPath, 'utf8');
    const packageResolution = JSON.parse(fs.readFileSync(packageResolutionPath, 'utf8'));
    const sparkle = packageResolution.pins.find((dependency) => dependency.identity === 'sparkle');
    const workflowVersion = workflow.match(/SPARKLE_VERSION: '([^']+)'/)?.[1];

    assert.ok(sparkle, 'Sparkle is missing from Package.resolved');
    assert.equal(workflowVersion, sparkle.state.version);
});