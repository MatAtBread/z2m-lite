import path from "path";
import fs from "fs";

import type { State } from "./lib/ws-mqtt";

type RuleRunner = ((update: string) => void) & { file: string };
export type Publisher = (topic: string, payload: object) => void;

type Rules = Array<RuleRunner>;
let rules: Rules = [];

export function getRules() {
  return rules.map(r => r.file);
}

export function saveRule(name: string, ruleCode: string) {
  if (!name)
    throw new Error("Rule name is required");

  const ruleFile = path.join(__dirname, '..', 'rules', name);
  if (!ruleCode)
    fs.unlinkSync(ruleFile);
  else
    fs.writeFileSync(ruleFile, ruleCode);
  return loadRules();
}

const rulesFooter = `
  return { onUpdate };
`;

export function initializeRules(state: State, publish: (name: string) => Publisher) {
  loadRules = () => {
    const newRules: Rules = [];
    const response: Record<string, string> = {};

    fs.readdirSync(path.join(__dirname, '..', 'rules')).forEach(file => {
      if (file.endsWith('.js')) {
        try {
          const rule = new Function('state', 'publish', fs.readFileSync(path.join(__dirname, '..', 'rules', file), 'utf8') + rulesFooter) as (state: State, publish: Publisher) => { onUpdate: RuleRunner };
          if (rule && typeof rule === 'function') {
            const onUpdate = rule(state, publish(file)).onUpdate;
            onUpdate.file = file;
            newRules.push(onUpdate);
          }
          response[file] = 'loaded';
          console.log("Loaded rule: ", file);
        } catch (ex: any) {
          response[file] = ex.message;
          console.error("Error loading rule: ", file, ex);
        }
      }
    });

    rules = newRules;
    return response;
  }
  loadRules();
}

export let loadRules: () => Record<string, string>;

export async function runRules(update: string) {
  for (const rule of rules) {
    try {
      await rule(update);
    } catch (ex) {
      console.error("Error in rule: ", ex);
    }
  }
}
