import * as _ from "lodash";
import {
  Transition,
  TransitionCompact,
  TransitionEvent_event,
  TransitionEvent
} from "./base";

function genState() {
  return _.uniqueId("s");
}

type CompiledStateMachine = { [state: string]: [any, string][] };

export class StateMachine {
  public start = genState();
  public end = genState();
  public transitions: TransitionCompact[] = [];

  join(state1: string, state2: string) {
    _.each(this.transitions, t => {
      if (t.from === state1) {
        t.from = state2;
      }
      if (t.to === state1) {
        t.to = state2;
      }
    });
  }

  private events: { [key: string]: TransitionEvent_event } = {};
  private efns: any[] = [];

  private addEvent(e: TransitionEvent): string {
    switch (e.kind) {
      case "not":
        return `["not",${this.addEvent(e.right)}]`;
      case "or":
        return `["or",${this.addEvent(e.left)},${this.addEvent(e.right)}]`;
      case "and":
        return `["and",${this.addEvent(e.left)},${this.addEvent(e.right)}]`;
      case "event":
        let event: TransitionEvent_event = {
          kind: "event",
          domain: e.domain || "*",
          name: e.name || "*"
        };
        let key = [event.domain, event.name].join(":");
        if (_.isFunction(e.matcher)) {
          event.matcher = e.matcher;
          let i = this.efns.indexOf(e.matcher);
          if (i < 0) {
            i = this.efns.length;
            this.efns.push(e.matcher);
          }
          key += ":fn" + i;
        }
        this.events[key] = event;
        return JSON.stringify(key);
      default:
        throw new Error("Bad TransitionEvent.kind " + JSON.stringify(e));
    }
  }

  add(fromState: string, onEvent: TransitionEvent, toState: string) {
    this.transitions.push({
      from: fromState,
      on: this.addEvent(onEvent),
      to: toState
    });
  }

  getEvent(lisp: any): TransitionEvent {
    if (_.isArray(lisp)) {
      switch (lisp[0]) {
        case "not":
          return {
            kind: "not",
            right: this.getEvent(lisp[1])
          };
        case "or":
          return {
            kind: "or",
            left: this.getEvent(lisp[1]),
            right: this.getEvent(lisp[2])
          };
        case "and":
          return {
            kind: "and",
            left: this.getEvent(lisp[1]),
            right: this.getEvent(lisp[2])
          };
        default:
          throw new Error("Bad event state transition");
      }
    }
    return this.events[lisp];
  }

  private getStateInputSignature(state: string) {
    let inputs: string[] = [];
    _.each(this.transitions, t => {
      if (t.to === state) {
        let key = t.from + t.on;
        if (inputs.indexOf(key) < 0) {
          inputs.push(key);
        }
      }
    });
    return inputs.sort().join("|");
  }

  getTransitions(): Transition[] {
    return this.transitions.map(t => {
      return { from: t.from, on: this.getEvent(JSON.parse(t.on)), to: t.to };
    });
  }

  concat(other: StateMachine) {
    _.each(other.getTransitions(), t => {
      this.add(t.from, t.on, t.to);
    });
  }

  optimize() {
    // Find all cases where the same event goes to different states and join those states into one
    while (true) {
      let toJoin: [string, string][] = [];
      let groupped: { [key: string]: string } = {};
      _.each(this.transitions, t => {
        let key = t.from + t.on;
        let state = t.to;
        if (_.has(groupped, key)) {
          if (state !== groupped[key]) {
            toJoin.push([state, groupped[key]]);
          }
        } else {
          groupped[key] = state;
        }
      });
      let didJoinStuff = false;
      toJoin.forEach(([sA, sB]) => {
        // before joining, make sure they are not used by someone else
        if (
          this.getStateInputSignature(sA) === this.getStateInputSignature(sB)
        ) {
          this.join(sA, sB);
          didJoinStuff = true;
        }
      });
      if (!didJoinStuff) {
        break;
      }
      // run again to see if there are more duplicate states
    }

    // Remove duplicate transitions
    let tree: { [on: string]: { [from: string]: { [to: string]: true } } } = {};
    _.each(this.transitions, t => {
      _.set(tree, [t.on, t.from, t.to], true);
    });
    this.transitions = [];
    _.each(tree, (a, on) => {
      _.each(a, (b, from) => {
        _.each(b, (c, to) => {
          this.transitions.push({ on, from, to });
        });
      });
    });
  }

  compile(expandExpr: boolean = false): CompiledStateMachine {
    // we want to ensure we get the same output on every compile
    // that is why we are re-naming states and sorting the output
    let outStates: { [old: string]: string } = {};
    outStates[this.start] = "start";
    outStates[this.end] = "end";
    let i = 0;
    let toOutState = (state: string) => {
      if (_.has(outStates, state)) {
        return outStates[state];
      }
      outStates[state] = "s" + i++;
      return outStates[state];
    };
    let outTransitions = _(this.transitions)
      .map(t => {
        return { from: toOutState(t.from), on: t.on, to: toOutState(t.to) };
      })
      .sortBy(t => {
        let score = 0;
        if (t.from === "start") {
          score -= Infinity;
        }
        if (t.from === "end") {
          score += Infinity;
        }
        if (/^s[0-9]+$/.test(t.from)) {
          score += _.parseInt(t.from.substring(1), 10) || 0;
        }
        return score;
      })
      .value();
    let stm: CompiledStateMachine = {};
    _.each(outTransitions, t => {
      if (!_.has(stm, t.from)) {
        stm[t.from] = [];
      }
      let expr = JSON.parse(t.on);
      if (expandExpr) {
        expr = this.getEvent(expr);
      }
      stm[t.from].push([expr, t.to]);
    });
    return stm;
  }

  toWhenConf() {
    let stm = this.compile(true);
    return {
      saliance: _.values(this.events).map(function(e) {
        return { domain: e.domain, name: e.name };
      }),
      matcher: function(event: any, state?: any) {
        return stmMatcher(stm, event, state);
      }
    };
  }

  clone() {
    let stm = new StateMachine();
    let stateMap: { [old: string]: string } = {};
    stateMap[this.start] = stm.start;
    stateMap[this.end] = stm.end;
    function newState(s: string) {
      if (!_.has(stateMap, s)) {
        stateMap[s] = genState();
      }
      return stateMap[s];
    }
    this.transitions.forEach(t => {
      stm.add(
        newState(t.from),
        this.getEvent(JSON.parse(t.on)),
        newState(t.to)
      );
    });
    return stm;
  }
}

function evalExpr(
  expr: any,
  event: any,
  state: any
): { match: boolean; state: any } {
  if (_.isArray(expr)) {
    let m1 = evalExpr(expr[1], event, state);
    switch (expr[0]) {
      case "not":
        return { match: !m1.match, state: m1.state };
      case "or":
        return m1.match ? m1 : evalExpr(expr[2], event, m1.state);
      case "and":
        return m1.match
          ? evalExpr(expr[2], event, m1.state)
          : { match: false, state: m1.state };
      default:
        throw new Error("Bad event state transition");
    }
  }
  if (expr.domain !== "*" && expr.domain !== event.domain) {
    return { match: false, state };
  }
  if (expr.name !== "*" && expr.name !== event.name) {
    return { match: false, state };
  }
  if (expr.matcher) {
    return expr.matcher(event, state);
  }
  return { match: true, state };
}

function stmMatcher(stm: CompiledStateMachine, event: any, state: any) {
  let stmStates = _.filter(_.flattenDeep([state && state.states]), function(
    st
  ) {
    return _.has(stm, st);
  });
  if (stmStates.length === 0) {
    stmStates = ["start"];
  }
  state = Object.assign({}, state, { states: stmStates });

  let matches = [];
  for (let cstate of stmStates) {
    let transitions = stm[cstate];
    for (let transition of transitions) {
      let expr = transition[0];
      let stmState = transition[1];
      let m = evalExpr(expr, event, state);
      state = m.state;
      if (m.match === true) {
        // found a match
        if (matches.indexOf(stmState) < 0) {
          matches.push(stmState);
        }
      }
    }
  }
  if (_.includes(matches, "end")) {
    return {
      match: true,
      state: Object.assign({}, state, { states: ["end"] })
    };
  }
  if (matches.length > 0) {
    return {
      match: false,
      state: Object.assign({}, state, { states: matches })
    };
  }
  return {
    match: false,
    state: state
  };
}
