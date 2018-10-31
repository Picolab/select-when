let _ = require('lodash')
let StateMachine = require('./StateMachine')

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
  within
}
