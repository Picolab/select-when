let _ = require('lodash')
let cleanEvent = require('./cleanEvent')

function noopMatcher (event, state) {
  return {
    match: true,
    state: state
  }
}

function SelectWhen () {
  let whens = []

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

    let obj = { id, matcher, fn, state }

    whens[id] = obj

    return {
      id,
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

    let salient = _.uniq(_.get(salianceGraph, [event.domain, event.name], [])
      .concat(_.get(salianceGraph, [event.domain, '*'], []))
      .concat(_.get(salianceGraph, ['*', event.name], []))
      .concat(_.get(salianceGraph, ['*', '*'], [])))

    salient.forEach(function (id) {
      let when = whens[id]
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
