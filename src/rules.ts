import path from "path";
import fs from "fs";

import type { State } from "./lib/ws-mqtt";

type RuleRunner = ((update: string) => void); // & { file: string };
export type Publisher = (topic: string, payload: object) => void;
type Rule = {file: string, onUpdate: RuleRunner} | { file: string, error: string };
let rules: Rule[] = [];

export function getRules() {
  return rules.map(r => r.file);
}

export function saveRule(name: string, ruleCode: string): Record<string, string> {
  if (!name)
    throw new Error("Rule name is required");

  const ruleFile = path.join(__dirname, '..', 'rules', name);
  if (!ruleCode) {
    fs.unlinkSync(ruleFile);
  }

  const res = loadRule(name, ruleCode);
  if ('onUpdate' in res) {
    try {
      res.onUpdate('');
      fs.writeFileSync(ruleFile, ruleCode);
      return { [res.file]: 'loaded' };
    }
    catch (ex) {
      return { [res.file]: String(ex) };
    }
  } else {
    return { [res.file]: res.error };
  }
}

const rulesFooter = `
  return { onUpdate };
`;

type RuleLoader = (file: string, ruleCode: string) => Rule;
let loadRule: RuleLoader;

export function initializeRules(state: State, publish: (name: string) => Publisher, echo: (topic: string, payload: object) => void) {
  loadRule = (file, ruleCode) => {
    if (file.endsWith('.js')) {
      try {
        const rule = new Function('state', 'publish', 'echo', ruleCode + rulesFooter) as (state: State, publish: Publisher, echo: (topic: string, payload: object) => void) => { onUpdate: RuleRunner };
        const onUpdate = rule(state, publish(file), echo).onUpdate;
        // onUpdate.file = file;
        return { file, onUpdate };
      } catch (ex: any) {
        console.error("Error loading rule: ", ruleCode, ex);
        return { file: ruleCode, error: String(ex) };
      }
    } else {
      return { file: ruleCode, error: `${ruleCode} is not a .js file` }
    }
  };
  loadRules();
}

export function loadRules(): Record<string, string> {
  const newRules: Rule[] = [];
  const response = Object.fromEntries(fs.readdirSync(path.join(__dirname, '..', 'rules')).map(file => loadRule(file, fs.readFileSync(path.join(__dirname, '..', 'rules', file), 'utf8'))).map(r => {
    if ('onUpdate' in r) {
      newRules.push(r);
      return [r.file, 'loaded'];
    } else {
      return [r.file, r.error];
    }
  }));

  rules = newRules;
  return response;
}

export async function runRules(update: string) {
  for (const r of rules) {
    try {
      if ('onUpdate' in r)
      await r.onUpdate(update);
    } catch (ex) {
      console.error("Error in rule: ", ex);
    }
  }
}
