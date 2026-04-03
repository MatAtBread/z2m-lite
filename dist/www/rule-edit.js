import { tag, Iterators } from './node_modules/@matatbread/ai-ui/esm/ai-ui.js';
const EDITOR = 'codeflask';
const { div, select, option, script, button, table, tr, td, textarea } = tag();
// Can't use AI-UI, as it f*cks with the constructor. We should probably change this in a subsequent release
// const {'playground-project': PlayProject, 'playground-code-editor': PlayEditor } = tag(null, ['playground-project', 'playground-code-editor']);
const AsyncFunction = (async function () { }).constructor;
let loadedEditor = false;
let editorLoaded;
const EditMenu = div.extended({
    override: {
        id: 'editMenu'
    }
});
const nakedRule = `
function onUpdate(topic) {
}
`;
export const CodeEditor = div.extended({
    styles: `.CodeEditor {
    background-color: #666;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
  }

    #editMenu > * {
    display: inline-block;
    vertical-align: middle;
  }

  .CodeEditor #code {
    spell-checking: false;
    background-color: white;
    color: #009;
    font-family: monospace;
    font-size: 0.833em;
    padding: 10px;
    box-sizing: border-box;
    position: absolute;
    top: 5em;
    left: 0;
    right: 0;
    bottom: 0;
  }
  .CodeEditor #code * {
    font-family: inherit;
    font-size: inherit;
  }`,
    override: {
        className: 'CodeEditor'
    },
    ids: {
        ruleSelect: select,
        code: textarea, // not really a textarea, but it has a `value` property
        playProject: div // not really a div, but a playground-project element
    },
    async constructed() {
        if (!loadedEditor) {
            loadedEditor = true;
            switch (EDITOR) {
                case 'codeflask':
                    // @ts-ignore
                    editorLoaded = async function* () { yield import('./node_modules/codeflask/build/codeflask.module.js').then(m => m.default); }();
                    break;
                case 'playground':
                    // Playground elements -
                    document.body.append(script({ type: "importmap" }, JSON.stringify({
                        "imports": {
                            "tslib": "https://cdn.jsdelivr.net/npm/tslib@2.5.0/tslib.es6.js",
                            "lit": "https://cdn.skypack.dev/lit@^2.0.2",
                            "lit/": "https://cdn.skypack.dev/lit@^2.0.2/",
                            "comlink": "https://cdn.jsdelivr.net/npm/comlink@4.3.1/dist/esm/comlink.mjs",
                            "fuse.js": "https://cdn.jsdelivr.net/npm/fuse.js@7.1.0/dist/fuse.mjs"
                        }
                    })), script({
                        type: 'module',
                        src: 'https://unpkg.com/playground-elements/playground-project.js'
                    }), script({
                        type: 'module',
                        src: 'https://unpkg.com/playground-elements/playground-file-editor.js'
                    }));
                    // @ts-ignore: project-ready is a custom event
                    editorLoaded = this.when('project-ready:#playProject', '@ready');
                    break;
                case 'html':
                    editorLoaded = Iterators.once(true);
                    break;
            }
        }
        Iterators.combine({
            editorLoaded,
            select: this.when('#ruleSelect', '@ready')
        }, { ignorePartial: true }).consume(e => {
            if (e.editorLoaded && e.select) {
                switch (EDITOR) {
                    case 'codeflask':
                        const flask = new e.editorLoaded(this.ids.code, { language: 'js', lineNumbers: true });
                        Object.defineProperty(this.ids.code, 'value', {
                            get: () => flask.getCode(),
                            set: (v) => flask.updateCode(v),
                            configurable: true
                        });
                        break;
                    case 'playground':
                        Object.assign(this.ids.code, {
                            project: this.ids.playProject,
                            lineNumbers: true,
                            value: "/** Loading " + this.ids.ruleSelect.selectedOptions[0].value + " **/",
                            type: this.ids.ruleSelect.selectedOptions[0].value.split('.').pop() || 'js',
                        });
                        break;
                }
                fetch("/rules/" + this.ids.ruleSelect.selectedOptions[0]?.value).then(res => (res.status < 400) ? res.text() : nakedRule).then(res => {
                    this.ids.code.value = (res);
                }).catch((e) => {
                    this.ids.code.value = (`/* There was a problem loading this rule:\n ${e.toString()}\n\n\n${nakedRule}`);
                });
            }
        });
        return [
            EditMenu(fetch("/rules/")
                .then(res => res.json())
                .then(res => {
                if (res.rules) {
                    return select({
                        id: 'ruleSelect'
                    }, res.rules.map((r) => option(r)));
                }
                else {
                    return select({
                        id: 'ruleSelect'
                    }, option("No rules loaded"));
                }
            }), button({
                onclick: () => {
                    const name = prompt("Rule name");
                    if (name) {
                        this.ids.ruleSelect.append(option(name));
                        this.ids.ruleSelect.selectedIndex = this.ids.ruleSelect.options.length - 1;
                        this.ids.ruleSelect.dispatchEvent(new Event('change'));
                    }
                }
            }, "New..."), button({
                onclick: () => {
                    const ruleFile = this.ids.ruleSelect.selectedOptions[0]?.value;
                    const code = this.ids.code.value;
                    // Local validation that it's syntactically correct
                    try {
                        new AsyncFunction(code);
                    }
                    catch (e) {
                        toast.message = "There was an error in the code:\n" + e.message;
                        return;
                    }
                    if (ruleFile) {
                        fetch("/rules/" + ruleFile, {
                            method: "PUT",
                            headers: {
                                "Content-Type": "text/plain"
                            },
                            body: code
                        }).then(async (res) => {
                            if (res.ok) {
                                toast.message = [div("Saved rule ", ruleFile), table(Object.entries((await res.json()).rules).map(([name, msg]) => tr(td(name), td(String(msg)))))];
                            }
                            else {
                                toast.message = "Failed to save rule: " + ruleFile;
                            }
                        });
                    }
                }
            }, "Save"), button({
                style: { float: 'right' },
                onclick: () => this.remove()
            }, "Close")),
            div({
                innerHTML: EDITOR === 'playground'
                    ? `<playground-project sandbox-base-url="http://house.mailed.me.uk:8088/" id="playProject"></playground-project> <playground-code-editor id="code"></playground-code-editor>`
                    : EDITOR === 'codeflask'
                        ? `<div id="code"></div>`
                        : `<textarea id="code"></textarea>`
            })
        ];
    }
});
