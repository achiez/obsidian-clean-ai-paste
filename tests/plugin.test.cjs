'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

function loadPlugin(code = source) {
    const events = {};
    const commands = {};
    const notices = [];
    const previews = [];
    const clipboard = { html: '', plain: '' };
    class Plugin {
        addSettingTab() {}
        addCommand(command) { commands[command.id] = command; }
        registerDomEvent(target, name, callback) { events[name] = callback; }
        registerEvent() {}
        async loadData() { return null; }
        async saveData() {}
    }
    class Modal {
        constructor() {}
        open() { previews.push(this); }
    }
    class Element { closest() { return true; } }
    const context = vm.createContext({
        module: { exports: {} }, console: { error() {} },
        require(name) {
            if (name === 'electron') return { clipboard: { availableFormats: () => [] } };
            assert.equal(name, 'obsidian');
            return { Plugin, Modal, PluginSettingTab: class {}, Setting: class {},
                Notice: class { constructor(message) { notices.push(message); } },
                htmlToMarkdown: (html) => html };
        },
        document: {}, HTMLElement: Element, Date, Intl, setTimeout,
        navigator: { clipboard: { async read() {
            return [{ types: ['text/html', 'text/plain'], async getType(type) {
                return { async text() { return type === 'text/html' ? clipboard.html : clipboard.plain; } };
            } }];
        } } }
    });
    vm.runInContext(code + '\nmodule.exports.testing = { mathmlToTex, convertRenderedMath, preprocessHtml, parseMathml };', context);
    const plugin = new context.module.exports();
    const inserted = [];
    const editor = {
        replaceSelection: (text) => inserted.push(text),
        getCursor: () => ({ line: 0 }), getLine: () => ''
    };
    plugin.app = { workspace: { activeEditor: { editor }, on(name, callback) { events[name] = callback; } } };
    return { context, api: context.module.exports.testing, plugin, events, commands,
        clipboard, editor, inserted, previews, notices, Element };
}

const nested = (tag, depth) => `<${tag}>`.repeat(depth) + '<mi>x</mi>' + `</${tag}>`.repeat(depth);

test('bounded baseline reproduction demonstrates the original repeated work',
    { skip: !process.env.CLEAN_AI_PASTE_BASELINE }, () => {
        const baseline = fs.readFileSync(process.env.CLEAN_AI_PASTE_BASELINE, 'utf8')
            .replace('function conv(n) {', 'function conv(n) { globalThis.calls++;');
        const { api, context } = loadPlugin(baseline);
        context.calls = 0;
        assert.equal(api.mathmlToTex(nested('mrow', 12)), 'x');
        assert.ok(context.calls > 8000, `baseline unexpectedly bounded: ${context.calls}`);
    });

test('nested known and unknown wrappers finish with linear conversion calls', () => {
    const instrumented = source.replace('function conv(n) {', 'function conv(n) { globalThis.calls++;');
    const { api, context } = loadPlugin(instrumented);
    for (const tag of ['mrow', 'unknown-wrapper']) {
        context.calls = 0;
        assert.equal(api.mathmlToTex(nested(tag, 100)), 'x');
        assert.ok(context.calls < 500, `unexpected repeated traversal: ${context.calls}`);
    }
});

test('original reported payload completes inside a bounded VM call', () => {
    const { context, api } = loadPlugin();
    context.api = api;
    context.payload = '<math>' + nested('mrow', 30) + '</math>';
    assert.equal(vm.runInContext('api.preprocessHtml(payload, "x")', context, { timeout: 1000 }), '$x$');
});

test('standard math retains expected TeX', () => {
    const { api } = loadPlugin();
    const cases = [
        ['<mfrac><mi>a</mi><mi>b</mi></mfrac>', '\\frac{a}{b}'],
        ['<msup><mi>x</mi><mn>2</mn></msup>', 'x^2'],
        ['<msubsup><mi>x</mi><mn>1</mn><mn>2</mn></msubsup>', 'x_1^2'],
        ['<msqrt><mi>x</mi></msqrt>', '\\sqrt{x}'],
        ['<mroot><mi>x</mi><mn>3</mn></mroot>', '\\sqrt[3]{x}'],
        ['<mi>sin</mi><mi>x</mi>', '\\sin x'],
        ['<mover accent="true"><mi>x</mi><mo>^</mo></mover>', '\\hat{x}'],
        ['<munder><mo>∑</mo><mi>i</mi></munder>', '\\sum_i'],
        ['<semantics><mi>x</mi><annotation>ignored</annotation></semantics>', 'x'],
        ['<mtext>a&amp;b</mtext>', '\\text{a\\&b}'],
        ['<mrow><mo fence="true">(</mo><mi>x</mi><mo fence="true">)</mo></mrow>', '\\left(x\\right)'],
        ['<mrow><mo fence="true">(</mo><mfrac linethickness="0"><mi>a</mi><mi>b</mi></mfrac><mo fence="true">)</mo></mrow>', '\\binom{a}{b}'],
        ['<mtable><mtr><mtd><mi>a</mi></mtd><mtd><mi>b</mi></mtd></mtr></mtable>', '\\begin{matrix}a & b\\end{matrix}'],
        ['<mrow><mo fence="true">[</mo><mtable><mtr><mtd><mi>x</mi></mtd></mtr></mtable><mo fence="true">]</mo></mrow>', '\\begin{bmatrix}x\\end{bmatrix}'],
        ['<mrow><mo fence="true">{</mo><mtable><mtr><mtd><mi>x</mi></mtd></mtr></mtable></mrow>', '\\begin{cases}x\\end{cases}']
    ];
    for (const [input, expected] of cases) assert.equal(api.mathmlToTex(input), expected, input);
    assert.equal(api.convertRenderedMath('<math display="block"><mi>x</mi></math>'), '<div>$$x$$</div>');
});

test('nested table and binomial paths reuse subtree conversions', () => {
    const instrumented = source.replace('function convertNode(n) {', 'function convertNode(n) { globalThis.visits++;');
    const { api, context } = loadPlugin(instrumented);
    for (const build of [
        (s) => `<mtable><mtr><mtd>${s}</mtd></mtr></mtable>`,
        (s) => `<mrow><mo fence="true">(</mo><mfrac linethickness="0">${s}<mi>b</mi></mfrac><mo fence="true">)</mo></mrow>`,
        (s) => `<mrow><mo fence="true">[</mo><mtable><mtr><mtd>${s}</mtd></mtr></mtable><mo fence="true">]</mo></mrow>`
    ]) {
        let input = '<mi>x</mi>';
        for (let i = 0; i < 15; i++) input = build(input);
        context.visits = 0;
        assert.ok(api.mathmlToTex(input).includes('x'));
        assert.ok(context.visits < 200, `unexpected subtree conversions: ${context.visits}`);
    }
});

test('size, nodes, nesting and aggregate math limits reject excessive work', () => {
    const { api } = loadPlugin();
    assert.equal(api.mathmlToTex(nested('unknown-wrapper', 120)), 'x');
    assert.throws(() => api.mathmlToTex(nested('unknown-wrapper', 140)), /depth limit/);
    assert.throws(() => api.mathmlToTex('<annotation>' + nested('other', 140) + '</annotation>'), /depth limit/);
    assert.throws(() => api.mathmlToTex('<mi>x</mi>'.repeat(8192)), /node limit/);
    assert.throws(() => api.mathmlToTex('<mi>' + 'x'.repeat(256 * 1024) + '</mi>'), /size limit/);
    assert.throws(() => api.convertRenderedMath('x'.repeat(2 * 1024 * 1024 + 1)), /HTML size limit/);
    assert.throws(() => api.convertRenderedMath('<math><mi>x</mi></math>'.repeat(513)), /work limit/);
    const medium = '<math><mtext>' + 'x'.repeat(180000) + '</mtext></math>';
    assert.throws(() => api.convertRenderedMath(medium.repeat(3)), /work limit/);
});

test('malformed missing tag delimiters cannot bypass the parser work limit', () => {
    const { context, api } = loadPlugin();
    context.api = api;
    for (const input of ['<mi'.repeat(60000), '<' + 'm'.repeat(180000), '<mi ' + 'x'.repeat(180000)]) {
        context.payload = '<math>' + input + '</math>';
        // A rejected node count is an allowed bounded outcome; VM timeout is not.
        const result = vm.runInContext(`(() => {
            try { api.preprocessHtml(payload, 'x'); return 'converted'; }
            catch (error) { if (/limit exceeded/.test(error.message)) return 'rejected'; throw error; }
        })()`, context, { timeout: 1000 });
        assert.ok(['converted', 'rejected'].includes(result));
    }
});

test('MathML and KaTeX scanners advance once over malformed fragments', () => {
    const { context, api } = loadPlugin();
    context.api = api;
    for (const input of [
        '<math>'.repeat(60000), '<math '.repeat(16000), '<span '.repeat(16000),
        '<span class="katex-html" '.repeat(16000),
        '<span class="katex-html">' + '<span '.repeat(30000)
    ]) {
        context.payload = input;
        assert.equal(vm.runInContext(`(() => {
            try { api.preprocessHtml(payload, 'x'); return true; }
            catch (error) { if (/limit exceeded|Incomplete MathML/.test(error.message)) return true; throw error; }
        })()`, context, { timeout: 1000 }), true);
    }
    assert.equal(api.convertRenderedMath('before <span class="katex-html"><span>drawn</span></span><math><mi>x</mi></math> after'), 'before $x$ after');
    assert.equal(api.convertRenderedMath('<span>keep</span><math><mi>x</mi></math> and <math><mi>y</mi></math>'), '<span>keep</span>$x$ and $y$');
});

test('normal paste, debug and legacy paste preserve plaintext on rejected MathML', async () => {
    const h = loadPlugin();
    await h.plugin.onload();
    h.clipboard.html = '<math>' + nested('mrow', 140) + '</math>';
    h.clipboard.plain = 'keep my original text';
    const paste = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; },
        clipboardData: { types: ['text/html', 'text/plain'], getData(type) {
            return type === 'text/html' ? h.clipboard.html : h.clipboard.plain;
        } } };
    h.events['editor-paste'](paste, h.editor);
    assert.deepEqual(h.inserted, [h.clipboard.plain]);
    await h.commands['paste-with-debug-preview'].editorCallback(h.editor);
    assert.equal(h.previews[0].formattedText, h.clipboard.plain);
    h.plugin.settings.bypassLegacyStructure = true;
    await h.events.keydown({ ctrlKey: true, metaKey: false, shiftKey: true, key: 'V',
        target: new h.Element(), preventDefault() {}, stopPropagation() {} });
    assert.equal(h.inserted.at(-1), h.clipboard.plain);
});

test('raw paste stays literal and ordinary rich math still formats', async () => {
    const h = loadPlugin();
    await h.plugin.onload();
    h.clipboard.plain = '  <literal>&text\n';
    await h.commands['paste-raw-text'].editorCallback(h.editor);
    assert.equal(h.inserted[0], h.clipboard.plain);
    assert.equal(h.plugin.formatClipboard('<math><mi>x</mi></math>', 'x', true), '$x$');
    let prevented = false;
    await h.events.keydown({ ctrlKey: true, shiftKey: true, key: 'v', target: new h.Element(),
        preventDefault() { prevented = true; } });
    assert.equal(prevented, false, 'default native plain paste must stay native');
});

test('settings do not load an automatic remote image', () => {
    assert.ok(!source.includes('storage.ko-fi.com'));
});
