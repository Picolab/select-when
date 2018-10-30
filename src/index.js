let _ = require('lodash')
let cleanEvent = require('./cleanEvent')

function noopMatcher (event, state) {
  return {
    match: true,
    state: state
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

  let nextWhenI = 0

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

    let id = 'w' + (nextWhenI++)

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
      fn,
      state
    }
    let queue = []
    function dequeue () {
      queue.shift()
      if (queue.length > 0) {
        queue[0]()
      }
    }
    rule.select = function (event) {
      let callback
      let p = new Promise(function (resolve, reject) {
        callback = function (err, data) {
          err ? reject(err) : resolve(data)
          dequeue()
        }
      })
      function runIt () {
        return Promise.resolve(matcher(event, rule.state))
          .then(function (resp) {
            rule.state = Object.freeze(resp.state)
            let isMatch = resp.match === true
            callback(null, isMatch)
            return resp.match === true
          }, function (err) {
            callback(err)
          })
      }
      queue.push(runIt)
      if (queue.length === 1) {
        queue[0]()
      }
      return p
    }

    rules[rule.id] = rule

    return {
      id,
      setState: function (state) {
        rule.state = Object.freeze(state)
      },
      getState: function (state) {
        return rule.state
      }
    }
  }

  function send (event) {
    event = cleanEvent(event)

    let salient = _.uniq(_.get(salianceGraph, [event.domain, event.name], [])
      .concat(_.get(salianceGraph, [event.domain, '*'], []))
      .concat(_.get(salianceGraph, ['*', event.name], []))
      .concat(_.get(salianceGraph, ['*', '*'], [])))

    return Promise.all(salient.map(function (id) {
      let rule = rules[id]
      return rule.select(event)
        .then(function (isMatch) {
          if (isMatch) {
            rule.fn(event, rule.state)
          }
        })
    }))
  }

  return {
    when: when,
    send: send
  }
}

module.exports = SelectWhen
