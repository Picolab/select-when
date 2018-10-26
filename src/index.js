let _ = require('lodash')

let hasOwnProp = Object.prototype.hasOwnProperty
function has (obj, key) {
  return hasOwnProp.call(obj, key)
}

function notBlankStr (str) {
  return typeof str === 'string' && str.trim().length > 0
}

function cleanEvent (eventIn) {
  if (typeof eventIn === 'string' && notBlankStr(eventIn)) {
    let parts = eventIn.split(':')
    eventIn = {}
    if (parts.length > 1) {
      eventIn.domain = parts[0]
      eventIn.name = parts.slice(1).join(':')
    } else {
      eventIn.name = parts[0]
    }
  }

  let event = {}

  if (has(eventIn, 'domain')) {
    if (notBlankStr(eventIn.domain)) {
      event.domain = eventIn.domain.trim()
    } else if (eventIn.domain === null || eventIn.domain === void 0) {
      event.domain = null
    } else {
      throw new TypeError('event.domain must be a string or null')
    }
  } else {
    event.domain = null
  }

  if (has(eventIn, 'name') && notBlankStr(eventIn.name)) {
    event.name = eventIn.name.trim()
  } else {
    throw new TypeError('event.name must be a string')
  }

  if (has(eventIn, 'data')) {
    event.data = eventIn.data
  } else {
    event.data = null
  }

  Object.freeze(event)
  return event
}

function StateMachine () {
  let start = _.uniqueId('state_')
  let end = _.uniqueId('state_')
  let transitions = []
  let join = function (state1, state2) {
    _.each(transitions, function (t) {
      if (t[0] === state1) {
        t[0] = state2
      }
      if (t[2] === state1) {
        t[2] = state2
      }
    })
  }
  return {
    start: start,
    end: end,
    add: function (fromState, onEvent, toState) {
      transitions.push([fromState, onEvent, toState])
    },
    getTransitions: function () {
      return transitions
    },
    concat: function (other) {
      _.each(other.getTransitions(), function (t) {
        transitions.push(_.cloneDeep(t))
      })
    },
    join: join,
    optimize: function () {
      // Find all cases where the same event goes to different states and join those states into one
      while (true) {
        let toJoin = []
        let groupped = {}
        _.each(transitions, function (t) {
          let key = t[0] + JSON.stringify(t[1])// stringify b/c ["not","expr_1"]
          let state = t[2]
          if (_.has(groupped, key)) {
            if (state !== groupped[key]) {
              toJoin.push([state, groupped[key]])
            }
          } else {
            groupped[key] = state
          }
        })
        if (toJoin.length === 0) {
          break
        }
        toJoin.forEach(function (j) {
          join(j[0], j[1])
        })
      }
      // Remove duplicate transitions
      let tree = {}
      _.each(transitions, function (t) {
        _.set(tree, [JSON.stringify(t[1]), t[0], t[2]], true)
      })
      transitions = []
      _.each(tree, function (froms, onEvent) {
        _.each(froms, function (tos, fromState) {
          _.each(tos, function (bool, toState) {
            transitions.push([fromState, JSON.parse(onEvent), toState])
          })
        })
      })
    },
    compile: function () {
      // we want to ensure we get the same output on every compile
      // that is why we are re-naming states and sorting the output
      let outStates = {}
      outStates[start] = 'start'
      outStates[end] = 'end'
      let i = 0
      let toOutState = function (state) {
        if (_.has(outStates, state)) {
          return outStates[state]
        }
        outStates[state] = 's' + (i++)
        return outStates[state]
      }
      let outTransitions = _.sortBy(_.map(transitions, function (t) {
        return [toOutState(t[0]), t[1], toOutState(t[2])]
      }), function (t) {
        let score = 0
        if (t[0] === 'start') {
          score -= Infinity
        }
        if (t[0] === 'end') {
          score += Infinity
        }
        if (/^s[0-9]+$/.test(t[0])) {
          score += _.parseInt(t[0].substring(1), 10) || 0
        }
        return score
      })
      let stm = {}
      _.each(outTransitions, function (t) {
        if (!_.has(stm, t[0])) {
          stm[t[0]] = []
        }
        stm[t[0]].push([t[1], t[2]])
      })
      return stm
    }
  }
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

function SelectWhen () {
  let whens = []

  function when (matcher, fn, initialState) {
    // TODO saliance graph
    let obj = {
      matcher,
      fn,
      state: Object.freeze(initialState)
    }
    whens.push(obj)

    return {
      setState: function (state) {
        obj.state = Object.freeze(state)
      },
      getState: function (state) {
        return obj.state
      }
    }
  }

  function emit (event) {
    event = cleanEvent(event)

    whens.forEach(function (when) {
      let resp = when.matcher(event, when.state)
      when.state = Object.freeze(resp.state)
      if (resp.match === true) {
        when.fn(event, when.state)
      }
    })
  }

  return {
    when: when,
    emit: emit
  }
}

module.exports = SelectWhen
module.exports.cleanEvent = cleanEvent
module.exports.ee = {
  e,
  before
}
