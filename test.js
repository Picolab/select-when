let test = require('ava')
let SelectWhen = require('./')

test('clean event', function (t) {
  t.is = t.deepEqual
  function tst (event) {
    try {
      return SelectWhen.cleanEvent(event)
    } catch (e) {
      return e + ''
    }
  }

  t.is(tst(''), 'TypeError: event.name must be a string')
  t.is(tst(' a '), { domain: null, name: 'a', data: null })
  t.is(tst({}), 'TypeError: event.name must be a string')
  t.is(tst({ domain: 1 }), 'TypeError: event.domain must be a string or null')
  t.is(tst({ domain: ' foo ', name: ' bar ', extra: 'thing' }), {
    domain: 'foo',
    name: 'bar',
    data: null
  })

  let event = SelectWhen.cleanEvent('a')
  t.is(event, { domain: null, name: 'a', data: null })
  t.true(Object.isFrozen(event))
  t.throws(function () {
    event.name = 'b'
  })
  t.throws(function () {
    event.other = 2
  })
  t.is(event, { domain: null, name: 'a', data: null })
})

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
    matches.push([ event, state ])
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

test('e', function (t) {
  let e = SelectWhen.ee.e

  t.deepEqual(e('foo:bar').salience, { foo: { bar: true } })
  t.deepEqual(e('foo').salience, { '*': { foo: true } })
  t.deepEqual(e('foo:*').salience, { foo: { '*': true } })

  let fn = function () {}
  t.deepEqual(e('foo', fn).salience, { '*': { foo: fn } })
})

test('before', function (t) {
  let e = SelectWhen.ee.e
  let before = SelectWhen.ee.before

  // select when foo before bar
  let foo = e('foo')
  let bar = e('bar')
  let aaaaa = before([foo, bar])
  aaaaa.optimize()
  t.deepEqual(aaaaa.compile(), {
    'start': [
      [foo, 's0']
    ],
    's0': [
      [bar, 'end']
    ]
  })
})
