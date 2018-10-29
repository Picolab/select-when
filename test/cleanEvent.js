let _ = require('lodash')
let test = require('ava')
let cleanEvent = require('../src/cleanEvent')

test('clean event', function (t) {
  t.is = t.deepEqual
  function tst (event) {
    try {
      return cleanEvent(event)
    } catch (e) {
      return e + ''
    }
  }

  t.is(tst(''), 'TypeError: event.name must be a string')
  t.is(_.omit(tst(' a '), 'time'), { domain: null, name: 'a', data: null })
  t.is(tst({}), 'TypeError: event.name must be a string')
  t.is(tst({ domain: 1 }), 'TypeError: event.domain must be a string or null')
  t.is(tst({ domain: ' foo ', name: ' bar ', extra: 'thing', time: 123 }), {
    domain: 'foo',
    name: 'bar',
    data: null,
    time: 123
  })

  let event = cleanEvent('a')
  t.is(_.omit(event, 'time'), { domain: null, name: 'a', data: null })
  t.true(Object.isFrozen(event))
  t.throws(function () {
    event.name = 'b'
  })
  t.throws(function () {
    event.other = 2
  })
  t.is(_.omit(event, 'time'), { domain: null, name: 'a', data: null })
})
