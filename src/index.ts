import * as _ from "lodash";
import { Event, cleanEvent } from "../src/cleanEvent";
import { StateMachine } from "./StateMachine";

function PromiseSeries<RET>() {
  type RunItFn = () => Promise<RET>;
  let queue: RunItFn[] = [];
  return function(doIt: RunItFn): Promise<RET> {
    let callback: any;
    let p: Promise<RET> = new Promise(function(resolve, reject) {
      callback = function(err: Error, data: RET) {
        err ? reject(err) : resolve(data);
        // all done, remove from queue
        queue.shift();
        // now go to the next in the queue
        if (queue.length > 0) {
          queue[0]();
        }
      };
    });
    queue.push(function() {
      return doIt().then(
        function(data) {
          callback(null, data);
          return data;
        },
        function(err) {
          callback(err);
          return Promise.reject(err);
        }
      );
    });
    if (queue.length === 1) {
      queue[0]();
    }
    return p;
  };
}

type Saliance = { domain?: string; name?: string };
type MatcherFn = (
  event: Event,
  state: any
) => { match: boolean; state: any } | Promise<{ match: boolean; state: any }>;
type WhenBodyFn = (event: Event, state: any) => any;

export class Rule {
  private _state: any;
  set state(state: any) {
    this._state = Object.freeze(state);
  }
  get state() {
    return this._state;
  }

  public saliance: Saliance[] = [{}]; // default to *:*
  public matcher: MatcherFn = function(event: Event, state: any) {
    return { match: true, state };
  };

  private queue = PromiseSeries();

  constructor() {}

  select(event: Event) {
    return this.queue(() => {
      return Promise.resolve(this.matcher(event, this.state)).then(resp => {
        this._state = Object.freeze(resp.state);
        return resp.match === true;
      });
    });
  }
}

type When = {
  id: string;
  order: number;
  rule: Rule;
  body: WhenBodyFn;
};

export class SelectWhen {
  private rules: { [id: string]: When } = {};
  private salianceGraph: {
    [domain: string]: { [name: string]: string[] };
  } = {};

  private nextRuleI = 0;

  addSaliance(e: Saliance, id: string) {
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

      let salientRules = _.sortBy(
        salient.map(id => {
          return this.rules[id];
        }),
        "order"
      );

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
