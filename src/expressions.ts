import * as _ from "lodash";
import { StateMachine } from "./StateMachine";
import { Rule } from "./Rule";
import { Event, MatcherFn, TransitionEvent, StateShape, Async } from "./types";

function wrapInOr<DataT, StateT>(
  states: TransitionEvent<DataT, StateT>[]
): TransitionEvent<DataT, StateT> {
  if (states.length === 1) {
    return states[0];
  }
  return {
    kind: "or",
    left: states[0],
    right: wrapInOr(_.tail(states))
  };
}

/**
 * Get all permutations of a given array
 */
function permute<T>(arr: T[]): T[][] {
  return arr.reduce(function permute(res: T[][], item, key, arr): T[][] {
    return res.concat(
      arr.length > 1
        ? arr
            .slice(0, key)
            .concat(arr.slice(key + 1))
            .reduce(permute, [])
            .map(perm => [item].concat(perm))
        : [item]
    );
  }, []);
}

export function e<DataT, StateT>(
  dt: string,
  matcher?: MatcherFn<DataT, StateT>
) {
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

  let eee: TransitionEvent<DataT, StateT> = {
    kind: "event",
    domain: domain,
    name: name,
    matcher: matcher
  };
  let s = new StateMachine<DataT, StateT>();
  s.add(s.start, eee, s.end);
  return s;
}

export function or<DataT, StateT>(...args: StateMachine<DataT, StateT>[]) {
  let s = new StateMachine<DataT, StateT>();

  _.each(args, function(a) {
    s.concat(a);
    s.join(a.start, s.start);
    s.join(a.end, s.end);
  });

  s.optimize();
  return s;
}

export function and<DataT, StateT>(...args: StateMachine<DataT, StateT>[]) {
  let s = new StateMachine<DataT, StateT>();

  _.each(permute(_.range(0, _.size(args))), function(indices) {
    let prev: StateMachine<DataT, StateT> | null = null;
    _.each(indices, function(i, j) {
      const a = args[i].clone();
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

export function before<DataT, StateT>(...args: StateMachine<DataT, StateT>[]) {
  let s = new StateMachine<DataT, StateT>();

  let prev: StateMachine<DataT, StateT> | null = null;
  _.each(args, function(arg, j) {
    var a = arg.clone();
    s.concat(a);
    if (j === 0) {
      s.join(a.start, s.start);
    }
    if (j === _.size(args) - 1) {
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

export function then<DataT, StateT>(...args: StateMachine<DataT, StateT>[]) {
  let s = new StateMachine<DataT, StateT>();

  var mergePoints: string[] = [];
  var prev: StateMachine<DataT, StateT> | undefined;
  _.each(args, function(a, j) {
    s.concat(a);
    if (j === 0) {
      s.join(a.start, s.start);
    }
    if (j === _.size(args) - 1) {
      s.join(a.end, s.end);
    }
    if (prev) {
      s.join(prev.end, a.start);
      mergePoints.push(a.start);
    }
    prev = a;
  });

  var transitions = s.getTransitions();
  _.each(mergePoints, function(daState) {
    // if not daState return to start
    let bTEvents = _(transitions)
      .map(
        (t): TransitionEvent<DataT, StateT> | undefined => {
          if (t.from === daState) {
            return { kind: "not", right: t.on };
          }
        }
      )
      .compact()
      .uniqWith(_.isEqual)
      .value();
    let notB = wrapInOr(bTEvents);

    s.add(daState, notB, s.start);
  });

  s.optimize();
  return s;
}

export function after<DataT, StateT>(...args: StateMachine<DataT, StateT>[]) {
  let s = new StateMachine<DataT, StateT>();

  let prev: StateMachine<DataT, StateT> | undefined;
  _.each(_.range(_.size(args) - 1, -1), function(i, j) {
    let a = args[i].clone();
    s.concat(a);
    if (j === 0) {
      s.join(a.start, s.start);
    }
    if (j === _.size(args) - 1) {
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

export function between<DataT, StateT>(
  a: StateMachine<DataT, StateT>,
  b: StateMachine<DataT, StateT>,
  c: StateMachine<DataT, StateT>
) {
  let s = new StateMachine<DataT, StateT>();

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

export function notBetween<DataT, StateT>(
  a: StateMachine<DataT, StateT>,
  b: StateMachine<DataT, StateT>,
  c: StateMachine<DataT, StateT>
) {
  let s = new StateMachine<DataT, StateT>();

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

export function any<DataT, StateT>(
  num: number,
  ...eventexs: StateMachine<DataT, StateT>[]
) {
  if (!_.isInteger(num)) {
    throw new TypeError("`any` expects first arg to be an integer");
  }
  if (num < 0 || num >= eventexs.length) {
    throw new TypeError(
      "`any(num, ...eventexs)` expects num to be greater than 0 and less than the number of eventexs"
    );
  }

  let s = new StateMachine<DataT, StateT>();

  let indicesGroups = _.uniqWith(
    _.map(permute(_.range(0, _.size(eventexs))), function(indices) {
      return _.take(indices, num);
    }),
    _.isEqual
  );

  _.each(indicesGroups, function(indices) {
    let prev: StateMachine<DataT, StateT>;
    _.each(indices, function(i, j) {
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

export function count<DataT, StateT>(
  num: number,
  eventex: StateMachine<DataT, StateT>
) {
  let s = new StateMachine<DataT, StateT>();

  let prev: StateMachine<DataT, StateT>;
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

export function repeat<DataT, StateT>(
  num: number,
  eventex: StateMachine<DataT, StateT>
) {
  let s = new StateMachine<DataT, StateT>();

  let prev: StateMachine<DataT, StateT>;
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

interface WithinStateShape extends StateShape {
  starttime?: number;
}

type TimeLimitFn<DataT, StateT extends WithinStateShape> = (
  event: Event<DataT>,
  state: StateT | null | undefined
) => Async<number>;

export function within<DataT, StateT extends WithinStateShape>(
  timeLimit: number | TimeLimitFn<DataT, StateT>,
  a: StateMachine<DataT, StateT>,
  onTimeout?: (event: Event<DataT>, state: StateT | null | undefined) => StateT
): Rule<DataT, StateT> {
  let tlimitFn: TimeLimitFn<DataT, StateT>;
  if (typeof timeLimit === "number" && _.isFinite(timeLimit)) {
    tlimitFn = () => timeLimit;
  } else if (_.isFunction(timeLimit)) {
    tlimitFn = timeLimit;
  } else {
    throw new TypeError(
      "within timeLimit must be a number (ms) or a function that returns the limit."
    );
  }

  let rule = new Rule<DataT, StateT>();
  rule.saliance = a.getSaliance();
  let matcher = a.toMatcher();
  rule.matcher = async function(event, state) {
    let starttime = state && state.starttime ? state.starttime : event.time;

    let timeSinceLast = event.time - starttime;
    let tlimit = await tlimitFn(event, state);

    let stmStates = _.filter(
      _.flattenDeep<string | null | undefined>([state && state.states]),
      _.isString
    );
    if (timeSinceLast > tlimit) {
      // time has expired, reset the state machine
      stmStates = ["start"];
      if (onTimeout) {
        state = onTimeout(event, state);
      }
    }
    if (_.includes(stmStates, "start")) {
      // set or reset the clock
      starttime = event.time;
    }
    state = Object.assign({}, state, {
      states: stmStates,
      starttime: starttime
    });
    Object.freeze(state);
    return matcher(event, state);
  };

  return rule;
}
