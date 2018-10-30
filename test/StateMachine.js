let test = require('ava')
let StateMachine = require('../src/StateMachine')

function mkE (name) {
  return { domain: name, name: name, matcher: true }
}

test('stm.optimize() remove duplicate transitions', function (t) {
  let stm = StateMachine()

  stm.add(stm.start, mkE('aaa'), stm.end)
  stm.add(stm.start, mkE('bbb'), stm.end)
  stm.add(stm.start, mkE('aaa'), stm.end)

  t.deepEqual(stm.compile(), {
    start: [
      ['aaa:aaa', 'end'],
      ['bbb:bbb', 'end'],
      ['aaa:aaa', 'end']
    ]
  })
  stm.optimize()
  t.deepEqual(stm.compile(), {
    start: [
      ['aaa:aaa', 'end'],
      ['bbb:bbb', 'end']
    ]
  })
})

test('stm.optimize() merge states', function (t) {
  let stm = StateMachine()

  stm.add(stm.start, mkE('aaa'), 'state0')
  stm.add(stm.start, mkE('aaa'), 'state1')
  stm.add('state0', mkE('ccc'), stm.end)
  stm.add('state1', mkE('ddd'), stm.end)

  t.deepEqual(stm.compile(), {
    start: [
      ['aaa:aaa', 's0'],
      ['aaa:aaa', 's1']
    ],
    s0: [
      ['ccc:ccc', 'end']
    ],
    s1: [
      ['ddd:ddd', 'end']
    ]
  })
  stm.optimize()
  t.deepEqual(stm.compile(), {
    start: [
      ['aaa:aaa', 's0']
    ],
    s0: [
      ['ccc:ccc', 'end'],
      ['ddd:ddd', 'end']
    ]
  })
})

test('stm.optimize() merge states, but don\'t interfere with other paths.', function (t) {
  let stm = StateMachine()

  stm.add(stm.start, mkE('aaa'), 'state0')
  stm.add(stm.start, mkE('aaa'), 'state1')
  stm.add(stm.start, mkE('bbb'), 'state1')
  stm.add('state0', mkE('ccc'), stm.end)
  stm.add('state1', mkE('ddd'), stm.end)

  t.deepEqual(stm.compile(), {
    start: [
      ['aaa:aaa', 's0'],
      ['aaa:aaa', 's1'],
      ['bbb:bbb', 's1']
    ],
    s0: [
      ['ccc:ccc', 'end']
    ],
    s1: [
      ['ddd:ddd', 'end']
    ]
  })
  stm.optimize()
  t.deepEqual(stm.compile(), {
    start: [
      ['aaa:aaa', 's0'],
      ['aaa:aaa', 's1'], // leave this duplicate path b/c bbb:bbb is also using it
      ['bbb:bbb', 's1']
    ],
    s0: [
      ['ccc:ccc', 'end']
    ],
    s1: [
      ['ddd:ddd', 'end']
    ]
  })
})

test('StateMachine unique events and matcher function management', function (t) {
  let stm = StateMachine()

  let fn0 = function () {}
  let fn1 = function () {}
  let fn2 = function () {}

  stm.add(stm.start, { domain: '*', name: 'aaa', matcher: true }, stm.end)
  stm.add(stm.start, { name: 'aaa', matcher: true }, stm.end)
  stm.add(stm.start, { name: 'aaa', matcher: fn0 }, stm.end)
  stm.add(stm.start, { name: 'aaa', matcher: fn0 }, stm.end)
  stm.add(stm.start, { name: 'aaa', matcher: fn1 }, stm.end)
  stm.add(stm.start, { name: 'aaa', matcher: fn2 }, stm.end)
  stm.add(stm.start, { name: 'wat', matcher: fn1 }, stm.end)

  t.deepEqual(stm.compile(), {
    start: [
      ['*:aaa', 'end'],
      ['*:aaa', 'end'],
      ['*:aaa:fn0', 'end'],
      ['*:aaa:fn0', 'end'],
      ['*:aaa:fn1', 'end'],
      ['*:aaa:fn2', 'end'],
      ['*:wat:fn1', 'end']
    ]
  })
  stm.optimize()
  t.deepEqual(stm.compile(), {
    start: [
      ['*:aaa', 'end'],
      ['*:aaa:fn0', 'end'],
      ['*:aaa:fn1', 'end'],
      ['*:aaa:fn2', 'end'],
      ['*:wat:fn1', 'end']
    ]
  })
  t.is(stm.getEvent('*:aaa:fn0').matcher, fn0)
  t.is(stm.getEvent('*:aaa:fn1').matcher, fn1)
  t.is(stm.getEvent('*:aaa:fn2').matcher, fn2)
  t.is(stm.getEvent('*:wat:fn1').matcher, fn1)
})
