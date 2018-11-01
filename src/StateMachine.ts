import * as _ from "lodash";

function genState() {
  return _.uniqueId("s");
}

type CompiledStateMachine = { [state: string]: [any, string][] };

interface EventPattern {
  domain: string;
  name: string;
  matcher?: (
    event: any,
    state: any
  ) => { match: true; state: any } | Promise<{ match: true; state: any }>;
}

export class StateMachine {
  public start = genState();
  public end = genState();
  public transitions: [string, string, string][] = [];

  join(state1: string, state2: string) {
    _.each(this.transitions, t => {
      if (t[0] === state1) {
        t[0] = state2;
      }
      if (t[2] === state1) {
        t[2] = state2;
      }
    });
  }

  private events: { [key: string]: EventPattern } = {};
  private efns: any[] = [];

  addEvent(e: any): any {
    if (_.isArray(e)) {
      switch (e[0]) {
        case "not":
          if (e.length !== 2) {
            throw new Error("Bad event state transition");
          }
          return ["not", this.addEvent(e[1])];
        case "or":
        case "and":
          if (e.length !== 3) {
            throw new Error("Bad event state transition");
          }
          return [e[0], this.addEvent(e[1]), this.addEvent(e[2])];
        default:
          throw new Error("Bad event state transition");
      }
    }
    let event: EventPattern = {
      domain: e.domain || "*",
      name: e.name || "*"
    };
    let key = [event.domain, event.name || "*"].join(":");
    if (_.isFunction(e.matcher)) {
      let i = this.efns.indexOf(e.matcher);
      if (i < 0) {
        i = this.efns.length;
        this.efns.push(e.matcher);
      }
      key += ":fn" + i;
      event.matcher = e.matcher;
    }
    this.events[key] = event;
    return key;
  }

  add(fromState: string, onEvent: any, toState: string) {
    this.transitions.push([
      fromState,
      JSON.stringify(this.addEvent(onEvent)),
      toState
    ]);
  }

  getEvent(lisp: string | any[]): EventPattern | any {
    if (_.isArray(lisp)) {
      switch (lisp[0]) {
        case "not":
          return ["not", this.getEvent(lisp[1])];
        case "or":
        case "and":
          return [lisp[0], this.getEvent(lisp[1]), this.getEvent(lisp[2])];
        default:
          throw new Error("Bad event state transition");
      }
    }
    return this.events[lisp];
  }

  private getStateInputSignature(state: string) {
    let inputs: string[] = [];
    _.each(this.transitions, t => {
      if (t[2] === state) {
        let key = t[0] + t[1];
        if (inputs.indexOf(key) < 0) {
          inputs.push(key);
        }
      }
    });
    return inputs.sort().join("|");
  }

  getTransitions() {
    return this.transitions.map(t => {
      return [t[0], this.getEvent(JSON.parse(t[1])), t[2]];
    });
  }

  concat(other: StateMachine) {
    _.each(other.getTransitions(), t => {
      this.add.apply(this, t);
    });
  }

  optimize() {
    // Find all cases where the same event goes to different states and join those states into one
    while (true) {
      let toJoin: [string, string][] = [];
      let groupped: any = {};
      _.each(this.transitions, t => {
        let key = t[0] + t[1];
        let state = t[2];
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
    let tree: { [from: string]: { [e: string]: { [to: string]: true } } } = {};
    _.each(this.transitions, t => {
      _.set(tree, [t[1], t[0], t[2]], true);
    });
    this.transitions = [];
    _.each(tree, (froms, onEvent) => {
      _.each(froms, (tos, fromState) => {
        _.each(tos, (bool, toState) => {
          this.transitions.push([fromState, onEvent, toState]);
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
    let outTransitions = _.sortBy(
      _.map(this.transitions, t => {
        return [toOutState(t[0]), t[1], toOutState(t[2])];
      }),
      t => {
        let score = 0;
        if (t[0] === "start") {
          score -= Infinity;
        }
        if (t[0] === "end") {
          score += Infinity;
        }
        if (/^s[0-9]+$/.test(t[0])) {
          score += _.parseInt(t[0].substring(1), 10) || 0;
        }
        return score;
      }
    );
    let stm: CompiledStateMachine = {};
    _.each(outTransitions, t => {
      if (!_.has(stm, t[0])) {
        stm[t[0]] = [];
      }
      let expr = JSON.parse(t[1]);
      if (expandExpr) {
        expr = this.getEvent(expr);
      }
      stm[t[0]].push([expr, t[2]]);
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
      stm.add(newState(t[0]), this.getEvent(JSON.parse(t[1])), newState(t[2]));
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
