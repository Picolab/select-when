let _ = require('lodash')
let test = require('ava')
let SelectWhen = require('../')

function sleep (ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms)
  })
}

test('basics', async function (t) {
  let rs = SelectWhen()

  let matches = []

  let w0 = rs.when({
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

  await rs.send('aa')
  await rs.send('bb:cc')
  await rs.send({ name: 'dd', data: { attr: 1 }, foo: 'bar' })

  t.deepEqual(w0.getState(), { n: 3 })

  w0.setState({ n: 100 })
  await rs.send('ee')

  t.deepEqual(matches, [
    [{ domain: null, name: 'aa', data: null }, { n: 1 }],
    [{ domain: 'bb', name: 'cc', data: null }, { n: 2 }],
    [{ domain: null, name: 'dd', data: { attr: 1 } }, { n: 3 }],
    [{ domain: null, name: 'ee', data: null }, { n: 101 }]
  ])
})

test('saliance graph', async function (t) {
  let rs = SelectWhen()

  let askedToMatch = []
  let matches = []

  rs.when({
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

  rs.send('foo:foo')
  rs.send('foo:bar')
  rs.send('bar:bar')
  rs.send('wat:bar')
  await rs.send('bar:wat')

  // should only be askedToMatch the ones that are salient
  t.deepEqual(askedToMatch, [
    'foo:foo',
    'bar:bar',
    'bar:wat'
  ])
  t.deepEqual(askedToMatch, matches)
})

test('async matcher', async function (t) {
  let rs = SelectWhen()

  let matches = []

  rs.when({
    initialState: { n: 0 },
    matcher: async function (event, state) {
      await sleep(10)
      return {
        match: true,
        state: { n: state.n + 1 }
      }
    }
  }, function (event, state) {
    matches.push([ event.name, state.n ])
  })

  rs.send('foo')
  rs.send('bar')
  await rs.send('baz')

  t.deepEqual(matches, [
    ['foo', 1],
    ['bar', 2],
    ['baz', 3]
  ])
})
