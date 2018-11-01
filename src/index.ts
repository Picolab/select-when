import * as _ from "lodash";
import cleanEvent from "../src/cleanEvent";
import { StateMachine } from "./StateMachine";
import { Event, Rule, Saliance, PromiseSeries } from "./base";

export { SelectWhen, Rule };

type WhenBodyFn = (event: Event, state: any) => any;

type When = {
  id: string;
  order: number;
  rule: Rule;
  body: WhenBodyFn;
};

class SelectWhen {
  private rules: { [id: string]: When } = {};
  private salianceGraph: {
    [domain: string]: { [name: string]: string[] };
  } = {};

  private nextRuleI = 0;

  private addSaliance(e: Saliance, id: string) {
    let domain = e.domain || "*";
    let name = e.name || "*";
    if (!this.salianceGraph[domain]) {
      this.salianceGraph[domain] = {};
    }
    if (!this.salianceGraph[domain][name]) {
      this.salianceGraph[domain][name] = [];
    }
    this.salianceGraph[domain][name].push(id);
  }

  when(rule: Rule | StateMachine, body: WhenBodyFn): When {
    if (rule instanceof StateMachine) {
      let conf = rule.toWhenConf();
      rule = new Rule();
      rule.saliance = conf.saliance;
      rule.matcher = conf.matcher;
    }

    let id = "w" + this.nextRuleI;
    rule.saliance.forEach((e: Saliance) => {
      this.addSaliance(e, id);
    });

    return (this.rules[id] = {
      id: "w" + this.nextRuleI,
      order: this.nextRuleI++,
      rule,
      body
    });
  }

  private sendQueue = PromiseSeries<{ id: string; data: any }[]>();
  send(event: any) {
    event = cleanEvent(event);

    return this.sendQueue(async () => {
      let salient: string[] = _.uniq(
        _.get(this.salianceGraph, [event.domain, event.name], [])
          .concat(_.get(this.salianceGraph, [event.domain, "*"], []))
          .concat(_.get(this.salianceGraph, ["*", event.name], []))
          .concat(_.get(this.salianceGraph, ["*", "*"], []))
      );

      let salientRules = _.sortBy(salient.map(id => this.rules[id]), "order");

      let result = [];
      for (let rule of salientRules) {
        if (await rule.rule.select(event)) {
          let res = await Promise.resolve(rule.body(event, rule.rule.state));
          result.push({
            id: rule.id,
            data: res
          });
        }
      }
      return result;
    });
  }
}
