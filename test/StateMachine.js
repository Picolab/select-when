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
      ['bbb:bbb', 's1']
    ],
    s0: [
      ['ccc:ccc', 'end'],
      ['ddd:ddd', 'end']
    ],
    s1: [
      ['ddd:ddd', 'end']
    ]
  })
})

// TODO make sure it doesn't prune the matcher functions
// TODO use an array indexOf to convert functions into index-ids
