let _ = require('lodash')

function StateMachine () {
  let start = _.uniqueId('state_')
  let end = _.uniqueId('state_')
  let transitions = []

  function join (state1, state2) {
    _.each(transitions, function (t) {
      if (t[0] === state1) {
        t[0] = state2
      }
      if (t[2] === state1) {
        t[2] = state2
      }
    })
  }

  let events = {}
  let efns = []
  function addEvent (e) {
    if (_.isArray(e)) {
      switch (e[0]) {
        case 'not':
          if (e.length !== 2) {
            throw new Error('Bad event state transition')
          }
          return ['not', addEvent(e[1])]
        case 'or':
        case 'and':
          if (e.length !== 3) {
            throw new Error('Bad event state transition')
          }
          return [e[0], addEvent(e[1]), addEvent(e[2])]
        default:
          throw new Error('Bad event state transition')
      }
    }
    let key = [e.domain || '*', e.name || '*'].join(':')
    if (_.isFunction(e.matcher)) {
      let i = efns.indexOf(e.matcher)
      if (i < 0) {
        i = efns.length
        efns.push(e.matcher)
      }
      key += ':fn' + i
    }
    events[key] = e
    return key
  }

  function evalExpr (expr, event, state) {
    if (_.isArray(expr)) {
      let m1 = evalExpr(expr[1], event, state)
      switch (expr[0]) {
        case 'not':
          return { match: !m1.match, state: m1.state }
        case 'or':
          return m1.match
            ? m1
            : evalExpr(expr[2], event, m1.state)
        case 'and':
          return m1.match
            ? evalExpr(expr[2], event, m1.state)
            : { match: false, state: m1.state }
        default:
          throw new Error('Bad event state transition')
      }
    }
    expr = events[expr]
    if (expr.domain !== '*' && expr.domain !== event.domain) {
      return { match: false, state }
    }
    if (expr.name !== '*' && expr.name !== event.name) {
      return { match: false, state }
    }
    if (expr.matcher === true) {
      return { match: true, state }
    }
    return expr.matcher(event, state)
  }

  function add (fromState, onEvent, toState) {
    transitions.push([fromState, JSON.stringify(addEvent(onEvent)), toState])
  }

  function getEvent (lisp) {
    if (_.isArray(lisp)) {
      switch (lisp[0]) {
        case 'not':
          return ['not', getEvent(lisp[1])]
        case 'or':
        case 'and':
          return [lisp[0], getEvent(lisp[1]), getEvent(lisp[2])]
        default:
          throw new Error('Bad event state transition')
      }
    }
    return events[lisp]
  }

  function getStateInputSignature (state) {
    let inputs = []
    _.each(transitions, function (t) {
      if (t[2] === state) {
        let key = t[0] + t[1]
        if (inputs.indexOf(key) < 0) {
          inputs.push(key)
        }
      }
    })
    return inputs.sort().join('|')
  }

  return {
    start: start,
    end: end,
    add: add,
    getTransitions: function () {
      return transitions.map(function (t) {
        return [t[0], getEvent(JSON.parse(t[1])), t[2]]
      })
    },

    concat: function (other) {
      _.each(other.getTransitions(), function (t) {
        add.apply(null, t)
      })
    },

    join: join,

    optimize: function () {
      // Find all cases where the same event goes to different states and join those states into one
      while (true) {
        let toJoin = []
        let groupped = {}
        _.each(transitions, function (t) {
          let key = t[0] + t[1]
          let state = t[2]
          if (_.has(groupped, key)) {
            if (state !== groupped[key]) {
              toJoin.push([state, groupped[key]])
            }
          } else {
            groupped[key] = state
          }
        })
        let didJoinStuff = false
        toJoin.forEach(function ([sA, sB]) {
          // before joining, make sure they are not used by someone else
          if (getStateInputSignature(sA) === getStateInputSignature(sB)) {
            join(sA, sB)
            didJoinStuff = true
          }
        })
        if (!didJoinStuff) {
          break
        }
        // run again to see if there are more duplicate states
      }

      // Remove duplicate transitions
      let tree = {}
      _.each(transitions, function (t) {
        _.set(tree, [t[1], t[0], t[2]], true)
      })
      transitions = []
      _.each(tree, function (froms, onEvent) {
        _.each(froms, function (tos, fromState) {
          _.each(tos, function (bool, toState) {
            transitions.push([fromState, onEvent, toState])
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
        stm[t[0]].push([JSON.parse(t[1]), t[2]])
      })
      return stm
    },

    toMatcher: function () {
      let stm = this.compile()
      return function (event, state) {
        let stmStates = _.filter(_.flattenDeep([state && state.states]), function (st) {
          return _.has(stm, st)
        })
        if (stmStates.length === 0) {
          stmStates = ['start']
        }
        state = Object.assign({}, state, { states: stmStates })

        let matches = []
        for (let cstate of stmStates) {
          let transitions = stm[cstate]
          for (let transition of transitions) {
            let expr = transition[0]
            let stmState = transition[1]
            let m = evalExpr(expr, event, state)
            state = m.state
            if (m.match === true) {
              // found a match
              if (matches.indexOf(stmState) < 0) {
                matches.push(stmState)
              }
            }
          }
        }
        if (_.includes(matches, 'end')) {
          return {
            match: true,
            state: Object.assign({}, state, { states: ['end'] })
          }
        }
        if (matches.length > 0) {
          return {
            match: false,
            state: Object.assign({}, state, { states: matches })
          }
        }
        return {
          match: false,
          state: state
        }
      }
    }
  }
}

module.exports = StateMachine
