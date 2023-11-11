# select-when

[![Build Status](https://github.com/Picolab/select-when/actions/workflows/test.yml/badge.svg?branch=master)](https://github.com/Picolab/select-when/actions/workflows/test.yml)

This javascript library makes it _easy_ to create rules that **pattern match** on event streams.

- [Rationale](#rationale)
- [Event Anatomy](#event-anatomy)
- [Example](#example)
- [API](#api)
  - [rs = new SelectWhen()](#rs--new-selectwhen)
    - [rs.when(Rule | StateMachine, body)](#rswhenrule--statemachine-body)
    - [rs.send(event)](#rssendevent)
    - [rs.getSaliance()](#rsgetsaliance)
  - [rule = new Rule()](#rule--new-rule)
  - [Event Expressions](#event-expressions)
    - [e(str, matcher?)](#estr-matcher)
    - [or(a, b)](#ora-b)
    - [and(a, b)](#anda-b)
    - [before(a, b)](#beforea-b)
    - [then(a, b)](#thena-b)
    - [after(a, b)](#aftera-b)
    - [between(a, b, c)](#betweena-b-c)
    - [notBetween(a, b, c)](#notbetweena-b-c)
    - [any(n, ...a)](#anyn-a)
    - [count(n, a)](#countn-a)
    - [repeat(n, a)](#repeatn-a)
    - [within(timeLimit, a)](#withintimelimit-a)
- [License](#license)

## Rationale

It's based on the ruleset pattern and event expressions of the Kinetic Rule Language ([KRL](https://en.wikipedia.org/wiki/Kinetic_Rule_Language)). Read more rational [here](https://picolabs.atlassian.net/wiki/spaces/docs/pages/1189912/Event+Expressions), and look into [pico-engine](https://github.com/picolab/pico-engine) if you want to run KRL code.

#### Declarative Event Expressions

Describe event patterns you want to select on.

For example:

- When aaa **or** bbb signals `or(e("aaa"), e("bbb"))`
- When aaa comes **after** bbb `after(e("aaa"), e("bbb"))`
- When **any 2** of these 3 events happen **within 1 second** `within(1000, any(2, e("a1"), e("a2"), e("a3")))`

#### Organize code and execution into Rulesets

Create a set of rules to run serially in the order they are declared. This makes it easy for programmers to understand their program and reason about ordering while still building in the asynchronous javascript environment.

## Event Anatomy

Events in this system are simple json objects that have 4 parts. The `domain`, `name`, `data` and `time`.

```typescript
interface Event<DataT> {
  // The domain/namespace of the event, this is optional
  domain?: string;

  // The name of event, required
  name: string;

  // Payload data of any kind to go with the event
  data?: DataT;

  // a unix timestamp, number of milliseconds since Jan 1, 1970 UTC
  time: int; // defaults to Date.now()
}
```

One can use strings as a shorthand for representing events.

```js
"aaa"     { domain:  null, name: "aaa" }
"bbb:ccc" { domain: "bbb", name: "ccc" }
```

## Example

```js
import { SelectWhen, e, or, then } from "select-when";

let rs = new SelectWhen();

// KRL: select when hello:world
rs.when(e("hello:world"), function(event, state) {
  console.log("rule 1 ->", event);
});

// KRL: select when hello:world or (*:a then *:b)
rs.when(or(e("hello:world"), then(e("a"), e("b"))), function(event, state) {
  console.log("rule 2 ->", event);
});

rs.send("hello:world");
// rule 1 -> { domain: 'hello', name: 'world', data: null, time: 1541... }
// rule 2 -> { domain: 'hello', name: 'world', data: null, time: 1541... }

rs.send("a");
rs.send("b");
// rule 2 -> { domain: null, name: 'b', data: null, time: 1541... }
```

## API

### rs = new SelectWhen()

Create a new ruleset.

#### rs.when(Rule | StateMachine, body)

Call the body function when a given rule or state machine matches an event.

The `body` is a `function(event, state){}` that runs when the rule matches. It can also be async (return a promise).

#### rs.send(event)

Send an event to be processed by the ruleset. This returns a promise that resolves when all the rules have finished processing. Rules process serially in the order they are declared. Events sent are json objects or the string shorthad. (See the [Event Anatomy](#event-anatomy) section above.)

#### rs.getSaliance()

Returns an array of `{ domain: string, name: string }` that are salient for the ruleset. `"*"` means any.

### rule = new Rule()

Create a rule.

```js
let rule = new Rule();

// set the initial state, under the hood this will go through Object.freeze
rule.state = {};

// set which domain/name patterns that this rule will care about
// by default all events are salient
rule.saliance = [
  { domain: "*", name: "aaa" }, // all events with name = "aaa"
  { domain: "bbb", name: "*" } // all events with domain = "bbb"
];

rule.matcher = function(event, state) {
  // This function is called on all salient events.
  // Return whether or not the event matches, and the new state.
  // The state is similar to a memo in a reducer function.
  // NOTE: this function can also be async (i.e. return a promise)
  return {
    match: true,
    state: Object.assign({}, state, { some: "change" })
  };
};

// Ask the rule to determine if an event matches, this will also update rule.state
rule.select(event).then(function(didMatch) {
  if (didMatch) {
    // do something
  }
});
```

### Event Expressions

These functions create StateMachine's or Rules that can be passed into `rs.when(..`

#### e(str, matcher?)

This creates a basic state machine to match events. This is the basic building block for all event expressions.

- `str` - A salient event pattern (see examples below)
- `matcher` - An optional matcher function (see `rule.matcher` for more info)

```js
"bbb:ccc" { domain: "bbb", name: "ccc" }
"bbb:*"   { domain: "bbb", name: "*"   }
"aaa"     { domain: "*"  , name: "aaa" }
"*:*"     { domain: "*"  , name: "*"   }
```

For example:

```js
rs.when(e("aaa:*"), function(event, state) {
  // run this on all events with domain "aaa"
});
```

#### or(a, b)

A state machine that matches when `a or b` matches.

#### and(a, b)

A state machine that matches when `a and b` matches.

#### before(a, b)

A state machine that matches when `a before b` matches.

#### then(a, b)

A state machine that matches when `a then b` matches, with no interleaving _salient_ events.

#### after(a, b)

A state machine that matches when `a after b` matches.

#### between(a, b, c)

A state machine that matches when `a` comes `between` `b` and `c`.

#### notBetween(a, b, c)

A state machine that matches when `a` comes `not between` `b` and `c`.

#### any(n, ...a)

A state machine that matches any `n` of the events.

For example: `any(2, e("a"), e("b"), e("c"))`

```
a
b // match
a
z
c // match
b
a // match
```

#### count(n, a)

A state machine that matches after `n` of `a`'s have matched.

For example: `count(3, e("a"))`

```
a
a
a // match
a
a
a // match
a
z
z
z
a
a // match
```

#### repeat(n, a)

The same as `count` except once it matches, it will always match on `a`

For example: `repeat(3, e("a"))`

```
a
z
a
z
z
a // match
a // match
z
a // match
a // match
```

#### within(timeLimit, a)

A rule that will reset the statemachine `a` when the `time` has expired.

`timeLimit` is be the number of milliseconds `ms` or a function that returns the time limit `(event, state) => ms`

For example: `within(1000, count(3, e("a")),`

```
a
a
// wait 60 minutes
a // the machine reset so we are back to the 1st event
a
a // match
```

NOTE: It uses the `time` on the event object, not the current execution time.

## License

MIT
