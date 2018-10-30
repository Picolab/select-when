let _ = require('lodash')
let cleanEvent = require('./cleanEvent')

function noopMatcher (event, state) {
  return {
    match: true,
    state: state
  }
}

function PromiseSeries () {
  let queue = []
  return function (doIt) {
    let callback
    let p = new Promise(function (resolve, reject) {
      callback = function (err, data) {
        err ? reject(err) : resolve(data)
        // all done, remove from queue
        queue.shift()
        // now go to the next in the queue
        if (queue.length > 0) {
          queue[0]()
        }
      }
    })
    queue.push(function () {
      return doIt()
        .then(function (data) {
          callback(null, data)
          return data
        }, function (err) {
          callback(err)
        })
    })
    if (queue.length === 1) {
      queue[0]()
    }
    return p
  }
}

function SelectWhen () {
  let rules = {}

  let salianceGraph = {}

  function addSaliance (e, id) {
    let domain = e.domain || '*'
    let name = e.name || '*'
    if (!salianceGraph[domain]) {
      salianceGraph[domain] = {}
    }
    if (!salianceGraph[domain][name]) {
      salianceGraph[domain][name] = []
    }
    salianceGraph[domain][name].push(id)
  }

  let nextRuleI = 0

  function when (conf, fn) {
    if (typeof conf.toWhenConf === 'function') { // i.e. StateMachine method
      conf = conf.toWhenConf()
    }
    let matcher = noopMatcher
    if (typeof conf.matcher === 'function') {
      matcher = conf.matcher
    } else if (typeof conf === 'function') {
      matcher = conf
    }

    let ruleOrder = nextRuleI++
    let id = 'w' + ruleOrder

    if (Array.isArray(conf.saliance)) {
      conf.saliance.forEach(function (e) {
        addSaliance(e, id)
      })
    } else {
      addSaliance({}, id)// default to *:*
    }

    let state = Object.freeze(conf.initialState || {})

    let rule = {
      id,
      ruleOrder,
      fn: typeof fn === 'function' ? fn : function () {},
      state
    }
    let queue = PromiseSeries()
    rule.select = function (event) {
      return queue(function () {
        return Promise.resolve(matcher(event, rule.state))
          .then(function (resp) {
            rule.state = Object.freeze(resp.state)
            return resp.match === true
          })
      })
    }

    rules[rule.id] = rule

    return {
      id,
      ruleOrder,
      setState: function (state) {
        rule.state = Object.freeze(state)
      },
      getState: function (state) {
        return rule.state
      }
    }
  }

  function salientRules (event) {
    let salient = _.uniq(_.get(salianceGraph, [event.domain, event.name], [])
      .concat(_.get(salianceGraph, [event.domain, '*'], []))
      .concat(_.get(salianceGraph, ['*', event.name], []))
      .concat(_.get(salianceGraph, ['*', '*'], [])))

    return _.sortBy(salient.map(function (id) {
      return rules[id]
    }), 'ruleOrder')
  }

  let sendQueue = PromiseSeries()
  function send (event) {
    event = cleanEvent(event)

    return sendQueue(async function () {
      let result = []
      for (let rule of salientRules(event)) {
        if (await rule.select(event)) {
          result.push(await Promise.resolve(rule.fn(event, rule.state)))
        }
      }
      return result
    })
  }

  return {
    when: when,
    send: send
  }
}

module.exports = SelectWhen
