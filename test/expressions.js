let test = require('ava')
let ee = require('../src/expressions')
let SelectWhen = require('../')

test('e', async function (t) {
  let { e } = ee

  t.deepEqual(e('foo:bar').getTransitions()[0][1], {
    domain: 'foo',
    name: 'bar'
  })
  t.deepEqual(e('foo').getTransitions()[0][1], {
    domain: '*',
    name: 'foo'
  })
  t.deepEqual(e('foo:*').getTransitions()[0][1], {
    domain: 'foo',
    name: '*'
  })

  let fn = function () {}
  t.deepEqual(e('foo', fn).getTransitions()[0][1], {
    domain: '*',
    name: 'foo',
    matcher: fn
  })

  t.deepEqual(e('foo').compile(), {
    'start': [
      ['*:foo', 'end']
    ]
  })

  let rs = SelectWhen()
  let matches = 0
  rs.when(e('aaa'), function (event, state) {
    matches++
  })
  rs.send('aaa')
  await rs.send('bbb')
  t.is(matches, 1)
})

test('before', async function (t) {
  let { e, before } = ee

  // select when foo before bar
  t.deepEqual(before(e('foo'), e('bar')).compile(), {
    'start': [
      ['*:foo', 's0']
    ],
    's0': [
      ['*:bar', 'end']
    ]
  })

  // select when before(foo, bar, baz)
  t.deepEqual(before(before(e('foo'), e('bar')), e('baz')).compile(), {
    'start': [
      ['*:foo', 's0']
    ],
    's0': [
      ['*:bar', 's1']
    ],
    's1': [
      ['*:baz', 'end']
    ]
  })
  t.deepEqual(
    before(before(e('foo'), e('bar')), e('baz')).compile(),
    before(e('foo'), before(e('bar'), e('baz'))).compile(),
    'asserting `before\'s associative property'
  )

  let bm = before(e('foo'), e('bar')).toWhenConf().matcher
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

  let rs = SelectWhen()
  let matches = 0
  rs.when(before(e('foo'), e('bar')), function (event, state) {
    matches++
  })
  await rs.send('foo')
  t.is(matches, 0)
  await rs.send('baz')
  t.is(matches, 0)
  await rs.send('bar')
  t.is(matches, 1)
  await rs.send('bar')
  t.is(matches, 1)
  await rs.send('foo')
  t.is(matches, 1)
  await rs.send('foo')
  t.is(matches, 1)
  await rs.send('bar')
  t.is(matches, 2)
})

test('within', function (t) {
  let { e, before, within } = ee

  let matcher = within(before(e('foo'), e('bar')), 100).matcher

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

test('or', function (t) {
  let { e, or } = ee

  let stm = or(e('foo'), e('bar'))

  t.deepEqual(stm.compile(), {
    'start': [
      ['*:foo', 'end'],
      ['*:bar', 'end']
    ]
  })
})

test('and', function (t) {
  let { e, and } = ee

  let stm = and(e('aaa'), e('bbb'))

  t.deepEqual(stm.compile(), {
    'start': [
      ['*:aaa', 's0'],
      ['*:bbb', 's1']
    ],
    's0': [
      ['*:bbb', 'end']
    ],
    's1': [
      ['*:aaa', 'end']
    ]
  })
})
