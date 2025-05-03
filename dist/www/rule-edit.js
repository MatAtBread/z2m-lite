import { tag, Iterators } from './node_modules/@matatbread/ai-ui/esm/ai-ui.js';
const editorHtml = `<playground-project id="playProject"></playground-project>
<playground-code-editor id="code"></playground-code-editor>`;
const { div, select, option, script, button } = tag();
// Can't use AI-UI, as it f*cks with the constructor. We should probably change this in a subsequent release
// const {'playground-project': PlayProject, 'playground-code-editor': PlayEditor } = tag(null, ['playground-project', 'playground-code-editor']);
const AsyncFunction = (async function () { }).constructor;
let loadScripts = true;
const EditMenu = div.extended({
    override: {
        id: 'editMenu'
    }
});
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
    }`,
    override: {
        className: 'CodeEditor'
    },
    ids: {
        ruleSelect: select,
        code: div, // not really a div, but a playground-code-editor element
        playProject: div // not really a div, but a playground-project element
    },
    constructed() {
        if (loadScripts) {
            loadScripts = false;
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
        }
        Iterators.combine({
            // @ts-ignore: project-ready is a custom event
            playProject: this.when('project-ready:#playProject', '@ready'),
            select: this.when('#ruleSelect', '@ready')
        }).consume(e => {
            if (e.playProject && e.select) {
                Object.assign(this.ids.code, {
                    project: this.ids.playProject,
                    lineNumbers: true,
                    value: "/** Loading " + this.ids.ruleSelect.selectedOptions[0].value + " **/",
                    type: this.ids.ruleSelect.selectedOptions[0].value.split('.').pop() || 'js',
                });
                fetch("/rules/" + this.ids.ruleSelect.selectedOptions[0]?.value).then(res => res.text()).then(res => {
                    // @ts-ignore: code is a custom element
                    this.ids.code.value = res;
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
                    // @ts-ignore: code is a custom element
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
                                toast.message = "Saved rule: " + ruleFile + "\n\n" + await res.text();
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
            div({ innerHTML: editorHtml })
        ];
    }
});
