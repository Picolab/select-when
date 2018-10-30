let _ = require('lodash')
let test = require('ava')
let SelectWhen = require('../')

test('basics', function (t) {
  let hub = SelectWhen()

  let matches = []

  let w0 = hub.when({
    initialState: { n: 0 },
    matcher: function (event, state) {
      t.true(Object.isFrozen(event))
      t.true(Object.isFrozen(state))
      return {
        match: true,
        state: { n: state.n + 1 }
      }
    }
  }, function (event, state) {
    t.true(Object.isFrozen(event))
    t.true(Object.isFrozen(state))
    matches.push([ _.omit(event, 'time'), state ])
  })

  t.is(w0.id, 'w0')

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

test('saliance graph', function (t) {
  let hub = SelectWhen()

  let askedToMatch = []
  let matches = []

  hub.when({
    saliance: [
      { domain: 'foo', name: 'foo' },
      { domain: 'bar', name: '*' }
    ],
    matcher: function (event, state) {
      askedToMatch.push(event.domain + ':' + event.name)
      return { match: true, state }
    }
  }, function (event, state) {
    matches.push(event.domain + ':' + event.name)
  })

  hub.emit('foo:foo')
  hub.emit('foo:bar')
  hub.emit('bar:bar')
  hub.emit('wat:bar')
  hub.emit('bar:wat')

  // should only be askedToMatch the ones that are salient
  t.deepEqual(askedToMatch, [
    'foo:foo',
    'bar:bar',
    'bar:wat'
  ])
  t.deepEqual(askedToMatch, matches)
})
