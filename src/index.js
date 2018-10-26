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
