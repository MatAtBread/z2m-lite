"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runRules = runRules;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const rules = [];
const AsyncFunction = (async () => { }).constructor;
fs_1.default.readdirSync(path_1.default.join(__dirname, '..', 'rules')).forEach(file => {
    if (file.endsWith('.js')) {
        const rule = new AsyncFunction('update', 'state', 'publish', fs_1.default.readFileSync(path_1.default.join(__dirname, '..', 'rules', file), 'utf8'));
        if (rule && typeof rule === 'function') {
            rules.push({ file, rule });
        }
    }
});
async function runRules(update, state, publish) {
    for (const rule of rules) {
        try {
            await rule.rule(update, state, publish(rule.file));
        }
        catch (ex) {
            console.error("Error in rule: ", ex);
        }
    }
}
