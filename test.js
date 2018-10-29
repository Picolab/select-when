let _ = require('lodash')
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
  t.is(_.omit(tst(' a '), 'time'), { domain: null, name: 'a', data: null })
  t.is(tst({}), 'TypeError: event.name must be a string')
  t.is(tst({ domain: 1 }), 'TypeError: event.domain must be a string or null')
  t.is(tst({ domain: ' foo ', name: ' bar ', extra: 'thing', time: 123 }), {
    domain: 'foo',
    name: 'bar',
    data: null,
    time: 123
  })

  let event = SelectWhen.cleanEvent('a')
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

function mkEE (dt) {
  return SelectWhen.ee.e(dt).getTransitions()[0][1]
}

test('e', function (t) {
  let e = SelectWhen.ee.e

  t.deepEqual(e('foo:bar').getTransitions()[0][1], {
    domain: 'foo',
    name: 'bar',
    matcher: true
  })
  t.deepEqual(e('foo').getTransitions()[0][1], {
    domain: '*',
    name: 'foo',
    matcher: true
  })
  t.deepEqual(e('foo:*').getTransitions()[0][1], {
    domain: 'foo',
    name: '*',
    matcher: true
  })

  let fn = function () {}
  t.deepEqual(e('foo', fn).getTransitions()[0][1], {
    domain: '*',
    name: 'foo',
    matcher: fn
  })

  t.deepEqual(e('foo').compile(), {
    'start': [
      [mkEE('foo'), 'end']
    ]
  })

  let hub = SelectWhen()
  let matches = 0
  hub.when(e('aaa'), function (event, state) {
    matches++
  })
  hub.emit('aaa')
  hub.emit('bbb')
  t.is(matches, 1)
})

test('before', function (t) {
  let e = SelectWhen.ee.e
  let before = SelectWhen.ee.before

  // select when foo before bar
  t.deepEqual(before(e('foo'), e('bar')).compile(), {
    'start': [
      [mkEE('foo'), 's0']
    ],
    's0': [
      [mkEE('bar'), 'end']
    ]
  })

  // select when before(foo, bar, baz)
  t.deepEqual(before(before(e('foo'), e('bar')), e('baz')).compile(), {
    'start': [
      [mkEE('foo'), 's0']
    ],
    's0': [
      [mkEE('bar'), 's1']
    ],
    's1': [
      [mkEE('baz'), 'end']
    ]
  })
  t.deepEqual(
    before(before(e('foo'), e('bar')), e('baz')).compile(),
    before(e('foo'), before(e('bar'), e('baz'))).compile(),
    'asserting `before\'s associative property'
  )

  let bm = before(e('foo'), e('bar')).toMatcher()
  t.deepEqual(bm({ name: 'foo' }, {}), {
    match: false,
    state: { states: ['s0'] }
  })
  t.deepEqual(bm({ name: 'bar' }, {}), {
    match: false,
    state: { states: ['start'] }
  })
  t.deepEqual(bm({ name: 'bar' }, { states: ['s0'] }), {
    match: true,
    state: { states: ['end'] }
  })
  t.deepEqual(bm({ name: 'bar' }, { states: ['end'] }), bm({ name: 'bar' }))
  t.deepEqual(bm({ name: 'bar' }, { states: ['wat', 'da'] }), bm({ name: 'bar' }))
  t.deepEqual(bm({ name: 'bar' }, { states: ['wat', 's0', 'da'] }), bm({ name: 'bar' }, { states: ['s0'] }))

  let hub = SelectWhen()
  let matches = 0
  hub.when(before(e('foo'), e('bar')), function (event, state) {
    matches++
  })
  hub.emit('foo')
  t.is(matches, 0)
  hub.emit('baz')
  t.is(matches, 0)
  hub.emit('bar')
  t.is(matches, 1)
  hub.emit('bar')
  t.is(matches, 1)
  hub.emit('foo')
  t.is(matches, 1)
  hub.emit('foo')
  t.is(matches, 1)
  hub.emit('bar')
  t.is(matches, 2)
})

test('within', function (t) {
  let e = SelectWhen.ee.e
  let before = SelectWhen.ee.before
  let within = SelectWhen.ee.within

  let matcher = within(before(e('foo'), e('bar')), 100)

  let r0 = matcher({ name: 'foo', time: 100 })
  t.deepEqual(r0, {
    match: false,
    state: { starttime: 100, states: ['s0'] }
  })
  t.deepEqual(matcher({ name: 'bar', time: 110 }, r0.state), {
    match: true,
    state: { starttime: 100, states: ['end'] }
  })
  t.deepEqual(matcher({ name: 'bar', time: 201 }, r0.state), {
    match: false,
    state: { starttime: 201, states: ['start'] }
  })

  t.deepEqual(matcher({ name: 'foo', time: 133 }, { starttime: 123, states: ['start'] }), {
    match: false,
    state: {
      starttime: 133, // Reset the time b/c it began at the 'start' state
      states: ['s0']
    }
  })
})
