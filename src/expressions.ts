import * as _ from "lodash";
import { StateMachine } from "./StateMachine";

type Matcher = (
  event: any,
  state: any
) => { match: boolean; state: any } | Promise<{ match: boolean; state: any }>;

function wrapInOr(states: any): any {
  if (_.size(states) === 1) {
    return _.head(states);
  }
  return ["or", _.head(states), wrapInOr(_.tail(states))];
}

/**
 * Get all permutations of a given array
 */
function permute(arr: any[]): any[] {
  return arr.reduce(function permute(res, item, key, arr): any {
    return res.concat(
      arr.length > 1
        ? arr
            .slice(0, key)
            .concat(arr.slice(key + 1))
            .reduce(permute, [])
            .map(function(perm: any) {
              return [item].concat(perm);
            })
        : item
    );
  }, []);
}

function e(dt: string, matcher?: Matcher) {
  let domain;
  let name;
  let parts = dt.split(":");
  if (parts.length > 1) {
    domain = parts[0];
    name = parts.slice(1).join(":");
  } else {
    domain = "*";
    name = parts[0];
  }

  let eee = {
    domain: domain,
    name: name,
    matcher: typeof matcher === "function" ? matcher : true
  };
  let s = new StateMachine();
  s.add(s.start, eee, s.end);
  return s;
}

function or(a: StateMachine, b: StateMachine) {
  let s = new StateMachine();

  s.concat(a);
  s.concat(b);
  s.join(a.start, s.start);
  s.join(b.start, s.start);
  s.join(a.end, s.end);
  s.join(b.end, s.end);

  s.optimize();
  return s;
}

function and(a0: StateMachine, b0: StateMachine) {
  let s = new StateMachine();

  let a1 = a0.clone();
  let b1 = b0.clone();
  s.concat(a0);
  s.concat(b0);
  s.concat(a1);
  s.concat(b1);

  s.join(a0.start, s.start);
  s.join(b0.start, s.start);

  s.join(a0.end, b1.start);
  s.join(b0.end, a1.start);

  s.join(a1.end, s.end);
  s.join(b1.end, s.end);

  s.optimize();
  return s;
}

function before(a: StateMachine, b: StateMachine) {
  let s = new StateMachine();

  s.concat(a);
  s.join(a.start, s.start);

  s.concat(b);
  s.join(b.end, s.end);
  s.join(a.end, b.start);

  s.optimize();
  return s;
}

function then(a: StateMachine, b: StateMachine) {
  let s = new StateMachine();

  s.concat(a);
  s.concat(b);

  s.join(a.start, s.start);
  s.join(a.end, b.start);
  s.join(b.end, s.end);

  let transitions = s.getTransitions();
  let notB = wrapInOr(
    _.uniq(
      _.compact(
        _.map(transitions, function(t) {
          if (t[0] === b.start) {
            return ["not", t[1]];
          }
        })
      )
    )
  );

  s.add(b.start, notB, s.start);

  s.optimize();
  return s;
}

function after(a: StateMachine, b: StateMachine) {
  let s = new StateMachine();

  s.concat(a);
  s.concat(b);

  s.join(b.start, s.start);
  s.join(a.end, s.end);
  s.join(b.end, a.start);

  s.optimize();
  return s;
}

function between(a: StateMachine, b: StateMachine, c: StateMachine) {
  let s = new StateMachine();

  s.concat(a);
  s.concat(b);
  s.concat(c);

  s.join(b.start, s.start);
  s.join(b.end, a.start);
  s.join(a.end, c.start);
  s.join(c.end, s.end);

  s.optimize();
  return s;
}

function notBetween(a: StateMachine, b: StateMachine, c: StateMachine) {
  let s = new StateMachine();

  s.concat(a);
  s.concat(b);
  s.concat(c);

  // start:b -> c -> end
  s.join(b.start, s.start);
  s.join(b.end, c.start);
  s.join(c.end, s.end);

  // a -> start
  s.join(a.start, c.start);
  s.join(a.end, s.start);

  s.optimize();
  return s;
}

function any(num: number, ...eventexs: StateMachine[]) {
  if (!_.isInteger(num)) {
    throw new TypeError("`any` expects first arg to be an integer");
  }
  if (num < 0 || num >= eventexs.length) {
    throw new TypeError(
      "`any(num, ...eventexs)` expects num to be greater than 0 and less than the number of eventexs"
    );
  }

  let s = new StateMachine();

  let indicesGroups = _.uniqWith(
    _.map(permute(_.range(0, _.size(eventexs))), function(indices) {
      return _.take(indices, num);
    }),
    _.isEqual
  );

  _.each(indicesGroups, function(indices) {
    let prev: StateMachine;
    _.each(indices, function(i: any, j) {
      let a = eventexs[i].clone();
      s.concat(a);
      if (j === 0) {
        s.join(a.start, s.start);
      }
      if (j === _.size(indices) - 1) {
        s.join(a.end, s.end);
      }
      if (prev) {
        s.join(prev.end, a.start);
      }
      prev = a;
    });
  });

  s.optimize();
  return s;
}

function count(num: number, eventex: StateMachine) {
  let s = new StateMachine();

  let prev: StateMachine;
  _.each(_.range(0, num), function(i, j) {
    let a = eventex.clone();
    s.concat(a);
    if (j === 0) {
      s.join(a.start, s.start);
    }
    if (j === num - 1) {
      s.join(a.end, s.end);
    }
    if (prev) {
      s.join(prev.end, a.start);
    }
    prev = a;
  });

  s.optimize();
  return s;
}

function repeat(num: number, eventex: StateMachine) {
  let s = new StateMachine();

  let prev: StateMachine;
  _.each(_.range(0, num), function(i, j) {
    let a = eventex.clone();
    s.concat(a);
    if (j === 0) {
      s.join(a.start, s.start);
    }
    if (j === num - 1) {
      s.join(a.end, s.end);
    }
    if (prev) {
      s.join(prev.end, a.start);
    }
    prev = a;
  });

  // once at the end, repeat
  s.concat(eventex);
  s.join(eventex.end, s.end);
  s.join(eventex.start, s.end);

  s.optimize();
  return s;
}

function within(
  a: StateMachine,
  timeLimit: number | ((event: any, state: any) => number)
) {
  let { saliance, matcher } = a.toWhenConf();
  let tlimitFn: any;
  if (_.isFinite(timeLimit)) {
    tlimitFn = function() {
      return timeLimit;
    };
  } else if (_.isFunction(timeLimit)) {
    tlimitFn = timeLimit;
  } else {
    throw new TypeError(
      "within timeLimit must be a number (ms) or a function that returns the limit."
    );
  }

  let withinMatcher = function(event: any, state?: any) {
    let starttime = _.isInteger(state && state.starttime)
      ? state.starttime
      : event.time;

    let timeSinceLast = event.time - starttime;
    let tlimit = tlimitFn(event, state);

    let stmStates = _.filter(
      _.flattenDeep([state && state.states]),
      _.isString
    );
    if (timeSinceLast > tlimit) {
      // time has expired, reset the state machine
      stmStates = ["start"];
    }
    if (_.includes(stmStates, "start")) {
      // set or reset the clock
      starttime = event.time;
    }
    state = Object.freeze(
      Object.assign({}, state, {
        states: stmStates,
        starttime: starttime
      })
    );
    return matcher(event, state);
  };

  return { saliance, matcher: withinMatcher };
}

export const ee = {
  e,
  or,
  and,
  before,
  then,
  after,
  between,
  notBetween,
  any,
  count,
  repeat,
  within
};
