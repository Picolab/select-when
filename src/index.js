let cleanEvent = require('./cleanEvent')

function SelectWhen () {
  let whens = []

  function when (matcher, fn, initialState) {
    if (typeof matcher.toMatcher === 'function') {
      matcher = matcher.toMatcher()
    }
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
