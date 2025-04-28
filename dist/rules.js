"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadRules = loadRules;
exports.runRules = runRules;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
let rules = [];
const AsyncFunction = (async () => { }).constructor;
function loadRules() {
    const newRules = [];
    fs_1.default.readdirSync(path_1.default.join(__dirname, '..', 'rules')).forEach(file => {
        if (file.endsWith('.js')) {
            try {
                const rule = new AsyncFunction('context', 'update', 'state', 'publish', fs_1.default.readFileSync(path_1.default.join(__dirname, '..', 'rules', file), 'utf8'));
                if (rule && typeof rule === 'function') {
                    newRules.push({ file, rule, context: {} });
                }
                console.log("Loaded rule: ", file);
            }
            catch (ex) {
                console.error("Error loading rule: ", file, ex);
            }
        }
    });
    rules = newRules;
    return rules.map(r => r.file);
}
async function runRules(update, state, publish) {
    for (const rule of rules) {
        try {
            await rule.rule(rule.context, update, state, publish(rule.file));
        }
        catch (ex) {
            console.error("Error in rule: ", ex);
        }
    }
}
