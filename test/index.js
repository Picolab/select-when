let _ = require('lodash')
let test = require('ava')
let SelectWhen = require('../')

test('basics', function (t) {
  let hub = SelectWhen()

  let matches = []

  let w0 = hub.when(function (event, state) {
    t.true(Object.isFrozen(event))
    t.true(Object.isFrozen(state))
    return {
      match: true,
      state: { n: state.n + 1 }
    }
  }, function (event, state) {
    t.true(Object.isFrozen(event))
    t.true(Object.isFrozen(state))
    matches.push([ _.omit(event, 'time'), state ])
  }, { n: 0 })

  hub.emit('aa')
  hub.emit('bb:cc')
  hub.emit({ name: 'dd', data: { attr: 1 }, foo: 'bar' })

  t.deepEqual(w0.getState(), { n: 3 })

  w0.setState({ n: 100 })
  hub.emit('ee')

  t.deepEqual(matches, [
    [{ domain: null, name: 'aa', data: null }, { n: 1 }],
    [{ domain: 'bb', name: 'cc', data: null }, { n: 2 }],
    [{ domain: null, name: 'dd', data: { attr: 1 } }, { n: 3 }],
    [{ domain: null, name: 'ee', data: null }, { n: 101 }]
  ])
})
