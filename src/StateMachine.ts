import * as _ from "lodash";
import {
  Event,
  MatcherRet,
  MatcherFn,
  Transition,
  TransitionCompact,
  TransitionEvent_event,
  TransitionEvent,
  Saliance
} from "./types";

function genState() {
  return _.uniqueId("s");
}

type CompiledStateMachine = { [state: string]: [any, string][] };

export class StateMachine<DataT, StateT> {
  public readonly start = genState();
  public readonly end = genState();
  private transitions: TransitionCompact[] = [];

  private events: { [key: string]: TransitionEvent_event<DataT, StateT> } = {};
  private efns: MatcherFn<DataT, StateT>[] = [];

  private addEvent(e: TransitionEvent<DataT, StateT>): string {
    switch (e.kind) {
      case "not":
        return `["not",${this.addEvent(e.right)}]`;
      case "or":
        return `["or",${this.addEvent(e.left)},${this.addEvent(e.right)}]`;
      case "and":
        return `["and",${this.addEvent(e.left)},${this.addEvent(e.right)}]`;
      case "event":
        let event: TransitionEvent_event<DataT, StateT> = {
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

  add(
    fromState: string,
    onEvent: TransitionEvent<DataT, StateT>,
    toState: string
  ) {
    this.transitions.push({
      from: fromState,
      on: this.addEvent(onEvent),
      to: toState
    });
  }

  concat(other: StateMachine<DataT, StateT>) {
    _.each(other.getTransitions(), t => {
      this.add(t.from, t.on, t.to);
    });
  }

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

  getEvent(lisp: any): TransitionEvent<DataT, StateT> {
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

  getTransitions(): Transition<DataT, StateT>[] {
    return this.transitions.map(t => {
      return { from: t.from, on: this.getEvent(JSON.parse(t.on)), to: t.to };
    });
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

  clone() {
    let stm = new StateMachine<DataT, StateT>();
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

  getSaliance(): Saliance[] {
    return _.values(this.events).map(function(e) {
      return { domain: e.domain, name: e.name };
    });
  }

  toMatcher(): MatcherFn<DataT, StateT> {
    let stm = this.compile(true);
    return function(event: Event<DataT>, state?: any) {
      return stmMatcher(stm, event, state);
    };
  }
}

async function stmMatcher<DataT, StateT>(
  stm: CompiledStateMachine,
  event: Event<DataT>,
  state: any
): Promise<MatcherRet<StateT>> {
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
    for (let [expr, stmState] of stm[cstate]) {
      let m = await evalExpr(expr, event, state);
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

async function evalExpr<DataT, StateT>(
  expr: TransitionEvent<DataT, StateT>,
  event: Event<DataT>,
  state: any
): Promise<MatcherRet<StateT>> {
  let left;
  switch (expr.kind) {
    case "event":
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
    case "not":
      let m1 = await Promise.resolve(evalExpr(expr.right, event, state));
      return { match: !m1.match, state: m1.state };
    case "or":
      left = await Promise.resolve(evalExpr(expr.left, event, state));
      return left.match ? left : evalExpr(expr.right, event, left.state);
    case "and":
      left = await Promise.resolve(evalExpr(expr.left, event, state));
      return left.match
        ? evalExpr(expr.right, event, left.state)
        : { match: false, state: left.state };
    default:
      throw new Error("Bad event state transition");
  }
}
