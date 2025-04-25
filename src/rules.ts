import path from "path";
import fs from "fs";

import type { State } from "./lib/ws-mqtt";

type RuleRunner = (update: string, state: State, publish: Publisher) => void;
export type Publisher = (topic: string, payload: object) => void;

const rules: Array<{file: string, rule: RuleRunner}> = [];

const AsyncFunction = (async () => { }).constructor as FunctionConstructor;

fs.readdirSync(path.join(__dirname, '..', 'rules')).forEach(file => {
  if (file.endsWith('.js')) {
    const rule = new AsyncFunction('update', 'state', 'publish', fs.readFileSync(path.join(__dirname, '..', 'rules', file), 'utf8')) as RuleRunner;
    if (rule && typeof rule === 'function') {
      rules.push({file,rule});
    }
  }
});

export async function runRules(update: string, state: State, publish: (name:string)=>Publisher) {
  for (const rule of rules) {
    try {
      await rule.rule(update, state, publish(rule.file));
    } catch (ex) {
      console.error("Error in rule: ", ex);
    }
  }
}
