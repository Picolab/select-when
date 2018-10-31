let _ = require('lodash')
let StateMachine = require('./StateMachine')

function wrapInOr (states) {
  if (_.size(states) === 1) {
    return _.head(states)
  }
  return ['or', _.head(states), wrapInOr(_.tail(states))]
}

function e (dt, matcher) {
  let domain
  let name
  let parts = dt.split(':')
  if (parts.length > 1) {
    domain = parts[0]
    name = parts.slice(1).join(':')
  } else {
    domain = '*'
    name = parts[0]
  }

  let eee = {
    domain: domain,
    name: name,
    matcher: typeof matcher === 'function'
      ? matcher
      : true
  }
  let s = StateMachine()
  s.add(s.start, eee, s.end)
  return s
}

function or (a, b) {
  let s = StateMachine()

  s.concat(a)
  s.concat(b)
  s.join(a.start, s.start)
  s.join(b.start, s.start)
  s.join(a.end, s.end)
  s.join(b.end, s.end)

  s.optimize()
  return s
}

function and (a0, b0) {
  let s = StateMachine()

  let a1 = a0.clone()
  let b1 = b0.clone()
  s.concat(a0)
  s.concat(b0)
  s.concat(a1)
  s.concat(b1)

  s.join(a0.start, s.start)
  s.join(b0.start, s.start)

  s.join(a0.end, b1.start)
  s.join(b0.end, a1.start)

  s.join(a1.end, s.end)
  s.join(b1.end, s.end)

  s.optimize()
  return s
}

function before (a, b) {
  let s = StateMachine()

  s.concat(a)
  s.join(a.start, s.start)

  s.concat(b)
  s.join(b.end, s.end)
  s.join(a.end, b.start)

  s.optimize()
  return s
}

function then (a, b) {
  let s = StateMachine()

  s.concat(a)
  s.concat(b)

  s.join(a.start, s.start)
  s.join(a.end, b.start)
  s.join(b.end, s.end)

  let transitions = s.getTransitions()
  let notB = wrapInOr(_.uniq(_.compact(_.map(transitions, function (t) {
    if (t[0] === b.start) {
      return ['not', t[1]]
    }
  }))))

  s.add(b.start, notB, s.start)

  s.optimize()
  return s
}

function after (a, b) {
  let s = StateMachine()

  s.concat(a)
  s.concat(b)

  s.join(b.start, s.start)
  s.join(a.end, s.end)
  s.join(b.end, a.start)

  s.optimize()
  return s
}

function between (a, b, c) {
  let s = StateMachine()

  s.concat(a)
  s.concat(b)
  s.concat(c)

  s.join(b.start, s.start)
  s.join(b.end, a.start)
  s.join(a.end, c.start)
  s.join(c.end, s.end)

  s.optimize()
  return s
}

function notBetween (a, b, c) {
  let s = StateMachine()

  s.concat(a)
  s.concat(b)
  s.concat(c)

  // start:b -> c -> end
  s.join(b.start, s.start)
  s.join(b.end, c.start)
  s.join(c.end, s.end)

  // a -> start
  s.join(a.start, c.start)
  s.join(a.end, s.start)

  s.optimize()
  return s
}

function within (a, timeLimit) {
  let { saliance, matcher } = a.toWhenConf()
  let tlimitFn
  if (_.isFinite(timeLimit)) {
    tlimitFn = function () { return timeLimit }
  } else if (_.isFunction(timeLimit)) {
    tlimitFn = timeLimit
  } else {
    throw new TypeError('within timeLimit must be a number (ms) or a function that returns the limit.')
  }

  let withinMatcher = function (event, state) {
    let starttime = _.isInteger(state && state.starttime)
      ? state.starttime
      : event.time

    let timeSinceLast = event.time - starttime
    let tlimit = tlimitFn(event, state)

    let stmStates = _.filter(_.flattenDeep([state && state.states]), _.isString)
    if (timeSinceLast > tlimit) {
      // time has expired, reset the state machine
      stmStates = ['start']
    }
    if (_.includes(stmStates, 'start')) {
      // set or reset the clock
      starttime = event.time
    }
    state = Object.freeze(Object.assign({}, state, {
      states: stmStates,
      starttime: starttime
    }))
    return matcher(event, state)
  }

  return { saliance, matcher: withinMatcher }
}

module.exports = {
  e,
  or,
  and,
  before,
  then,
  after,
  between,
  notBetween,
  within
}
