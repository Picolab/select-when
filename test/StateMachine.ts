import * as _ from "lodash";
import test from "ava";
import { StateMachine } from "../src/StateMachine";
import { Event, TransitionEvent_event } from "../src/types";

function mkE(name: string): TransitionEvent_event<any, any> {
  return { kind: "event", domain: name, name: name };
}

test("stm.getSaliance()", function(t) {
  let stm = new StateMachine();

  stm.add(stm.start, { kind: "event", name: "foo" }, stm.end);
  stm.add(stm.start, { kind: "event", domain: "bar", name: "" }, stm.end);
  stm.add(
    stm.start,
    {
      kind: "event",
      domain: "baz",
      name: "qux",
      matcher: function(event: Event<any>, state: any) {
        return { match: true, state };
      }
    },
    stm.end
  );

  t.deepEqual(stm.getSaliance(), [
    { domain: "*", name: "foo" },
    { domain: "bar", name: "*" },
    { domain: "baz", name: "qux" }
  ]);
});

test("stm.optimize() remove duplicate transitions", function(t) {
  let stm = new StateMachine();

  stm.add(stm.start, mkE("aaa"), stm.end);
  stm.add(stm.start, mkE("bbb"), stm.end);
  stm.add(stm.start, mkE("aaa"), stm.end);

  t.deepEqual(stm.compile(), {
    start: [["aaa:aaa", "end"], ["bbb:bbb", "end"], ["aaa:aaa", "end"]]
  });
  stm.optimize();
  t.deepEqual(stm.compile(), {
    start: [["aaa:aaa", "end"], ["bbb:bbb", "end"]]
  });
});

test("stm.optimize() merge states", function(t) {
  let stm = new StateMachine();

  stm.add(stm.start, mkE("aaa"), "state0");
  stm.add(stm.start, mkE("aaa"), "state1");
  stm.add("state0", mkE("ccc"), stm.end);
  stm.add("state1", mkE("ddd"), stm.end);

  t.deepEqual(stm.compile(), {
    start: [["aaa:aaa", "s0"], ["aaa:aaa", "s1"]],
    s0: [["ccc:ccc", "end"]],
    s1: [["ddd:ddd", "end"]]
  });
  stm.optimize();
  t.deepEqual(stm.compile(), {
    start: [["aaa:aaa", "s0"]],
    s0: [["ccc:ccc", "end"], ["ddd:ddd", "end"]]
  });
});

test("stm.optimize() merge states, but don't interfere with other paths.", function(t) {
  let stm = new StateMachine();

  stm.add(stm.start, mkE("aaa"), "state0");
  stm.add(stm.start, mkE("aaa"), "state1");
  stm.add(stm.start, mkE("bbb"), "state1");
  stm.add("state0", mkE("ccc"), stm.end);
  stm.add("state1", mkE("ddd"), stm.end);

  t.deepEqual(stm.compile(), {
    start: [["aaa:aaa", "s0"], ["aaa:aaa", "s1"], ["bbb:bbb", "s1"]],
    s0: [["ccc:ccc", "end"]],
    s1: [["ddd:ddd", "end"]]
  });
  stm.optimize();
  t.deepEqual(stm.compile(), {
    start: [
      ["aaa:aaa", "s0"],
      ["aaa:aaa", "s1"], // leave this duplicate path b/c bbb:bbb is also using it
      ["bbb:bbb", "s1"]
    ],
    s0: [["ccc:ccc", "end"]],
    s1: [["ddd:ddd", "end"]]
  });
});

test("StateMachine unique events and matcher function management", function(t) {
  let stm = new StateMachine();

  let fn0 = (event: Event<any>, state: any) => ({ match: true, state });
  let fn1 = (event: Event<any>, state: any) => ({ match: true, state });
  let fn2 = (event: Event<any>, state: any) => ({ match: true, state });

  stm.add(stm.start, { kind: "event", domain: "*", name: "aaa" }, stm.end);
  stm.add(stm.start, { kind: "event", name: "aaa" }, stm.end);
  stm.add(stm.start, { kind: "event", name: "aaa", matcher: fn0 }, stm.end);
  stm.add(stm.start, { kind: "event", name: "aaa", matcher: fn0 }, stm.end);
  stm.add(stm.start, { kind: "event", name: "aaa", matcher: fn1 }, stm.end);
  stm.add(stm.start, { kind: "event", name: "aaa", matcher: fn2 }, stm.end);
  stm.add(stm.start, { kind: "event", name: "wat", matcher: fn1 }, stm.end);

  t.deepEqual(stm.compile(), {
    start: [
      ["*:aaa", "end"],
      ["*:aaa", "end"],
      ["*:aaa:fn0", "end"],
      ["*:aaa:fn0", "end"],
      ["*:aaa:fn1", "end"],
      ["*:aaa:fn2", "end"],
      ["*:wat:fn1", "end"]
    ]
  });
  stm.optimize();
  t.deepEqual(stm.compile(), {
    start: [
      ["*:aaa", "end"],
      ["*:aaa:fn0", "end"],
      ["*:aaa:fn1", "end"],
      ["*:aaa:fn2", "end"],
      ["*:wat:fn1", "end"]
    ]
  });
  function getMatcher(str: string) {
    let e = stm.getEvent(str);
    return e.kind === "event" ? e.matcher : null;
  }
  t.is(getMatcher("*:aaa:fn0"), fn0);
  t.is(getMatcher("*:aaa:fn1"), fn1);
  t.is(getMatcher("*:aaa:fn2"), fn2);
  t.is(getMatcher("*:wat:fn1"), fn1);
});

test("StateMachine clone()", function(t) {
  let stm = new StateMachine();
  stm.add(stm.start, { kind: "event", name: "foo" }, "aaa");
  stm.add("aaa", { kind: "event", name: "bar" }, "bbb");
  stm.add("aaa", { kind: "event", name: "baz" }, "ccc");
  stm.add("bbb", { kind: "event", name: "qux" }, stm.end);
  stm.add("ccc", { kind: "event", name: "quux" }, stm.end);

  t.deepEqual(stm.getTransitions(), [
    {
      from: stm.start,
      on: { kind: "event", domain: "*", name: "foo" },
      to: "aaa"
    },
    { from: "aaa", on: { kind: "event", domain: "*", name: "bar" }, to: "bbb" },
    { from: "aaa", on: { kind: "event", domain: "*", name: "baz" }, to: "ccc" },
    {
      from: "bbb",
      on: { kind: "event", domain: "*", name: "qux" },
      to: stm.end
    },
    {
      from: "ccc",
      on: { kind: "event", domain: "*", name: "quux" },
      to: stm.end
    }
  ]);

  let stm2 = stm.clone();
  let trans = stm2.getTransitions();
  t.is(trans[0].from, stm2.start);
  t.deepEqual(trans[0].on, { kind: "event", domain: "*", name: "foo" });
  t.deepEqual(trans[1].on, { kind: "event", domain: "*", name: "bar" });
  t.is(trans[0].to, trans[1].from);
  t.not(trans[0].to, "aaa");
  t.is(trans[2].to, trans[4].from);
  t.is(trans[4].to, stm2.end);
  t.not(stm.start, stm2.start);
  t.not(stm.end, stm2.end);
});
