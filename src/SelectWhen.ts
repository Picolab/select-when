import * as _ from "lodash";
import cleanEvent from "./cleanEvent";
import { StateMachine } from "./StateMachine";
import { Rule } from "./Rule";
import { PromiseSeries } from "./PromiseSeries";
import { Event, Saliance, Async } from "./types";

export type WhenBody<DataT, StateT, WhenReturnT> = (
  event: Event<DataT>,
  state: StateT | null | undefined,
  last: () => void
) => Async<WhenReturnT>;

export interface When<DataT, StateT, WhenReturnT> {
  readonly id: string;
  readonly order: number;
  readonly rule: Rule<DataT, StateT>;
  readonly body: WhenBody<DataT, StateT, WhenReturnT>;
}

export class SelectWhen<DataT, StateT, WhenReturnT = void> {
  private rules: { [id: string]: When<DataT, StateT, WhenReturnT> } = {};
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

  when(
    rule: Rule<DataT, StateT> | StateMachine<DataT, StateT>,
    body: WhenBody<DataT, StateT, WhenReturnT>
  ): When<DataT, StateT, WhenReturnT> {
    if (rule instanceof StateMachine) {
      let stm = rule;
      rule = new Rule<DataT, StateT>();
      rule.saliance = stm.getSaliance();
      rule.matcher = stm.toMatcher();
    }

    let id = "w" + this.nextRuleI;
    rule.saliance.forEach((e: Saliance) => {
      this.addSaliance(e, id);
    });

    let w = Object.freeze({
      id: "w" + this.nextRuleI,
      order: this.nextRuleI++,
      rule,
      body
    });
    this.rules[id] = w;
    return w;
  }

  getSaliance(): Saliance[] {
    let result: Saliance[] = [];
    Object.keys(this.salianceGraph).forEach(domain => {
      Object.keys(this.salianceGraph[domain]).forEach(name => {
        result.push({ domain, name });
      });
    });
    return result;
  }

  private sendQueue = PromiseSeries<{ id: string; data: WhenReturnT }[]>();
  send(event: any) {
    event = cleanEvent(event);

    return this.sendQueue(async () => {
      let salient: string[] = _.uniq(
        _.get(this.salianceGraph, [event.domain, event.name], [])
          .concat(_.get(this.salianceGraph, [event.domain, "*"], []) as any)
          .concat(_.get(this.salianceGraph, ["*", event.name], []) as any)
          .concat(_.get(this.salianceGraph, ["*", "*"], []) as any)
      );

      let salientRules = _.sortBy(salient.map(id => this.rules[id]), "order");

      let result = [];
      for (let rule of salientRules) {
        if (await rule.rule.select(event)) {
          let last = false;
          let res = await rule.body(
            event,
            rule.rule.state,
            () => (last = true)
          );
          result.push({
            id: rule.id,
            data: res
          });
          if (last) {
            break;
          }
        }
      }
      return result;
    });
  }

  getStates(): { [id: string]: StateT | null | undefined } {
    const states: { [id: string]: StateT | null | undefined } = {};
    const ids = Object.keys(this.rules);
    for (const id of ids) {
      states[id] = this.rules[id].rule.state;
    }
    return states;
  }

  setStates(states: { [id: string]: StateT | null | undefined }): void {
    const ids = Object.keys(states);
    for (const id of ids) {
      const rule = this.rules[id];
      if (rule) {
        rule.rule.state = states[id];
      }
    }
  }
}
