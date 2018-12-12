import * as _ from "lodash";
import test from "ava";
import { SelectWhen, Rule } from "../src";

function sleep(ms: number) {
  return new Promise(function(resolve) {
    setTimeout(resolve, ms);
  });
}

test("basics", async function(t) {
  let rs = new SelectWhen<null, { n: number }>();

  let matches: [any, any][] = [];

  let rule = new Rule<null, { n: number }>();
  rule.state = { n: 0 };
  rule.matcher = function(event, state) {
    t.true(Object.isFrozen(event));
    t.true(Object.isFrozen(state));
    return {
      match: true,
      state: state ? { n: state.n + 1 } : { n: 1 }
    };
  };

  let w0 = rs.when(rule, function(event, state) {
    t.true(Object.isFrozen(event));
    t.true(Object.isFrozen(state));
    matches.push([_.omit(event, "time"), state]);
  });

  t.is(w0.id, "w0");

  await rs.send("aa");
  await rs.send("bb:cc");
  await rs.send({ name: "dd", data: { attr: 1 }, foo: "bar" });

  t.deepEqual(w0.rule.state, { n: 3 });

  w0.rule.state = { n: 100 };
  await rs.send("ee");

  t.deepEqual(matches, [
    [{ domain: null, name: "aa", data: null }, { n: 1 }],
    [{ domain: "bb", name: "cc", data: null }, { n: 2 }],
    [{ domain: null, name: "dd", data: { attr: 1 } }, { n: 3 }],
    [{ domain: null, name: "ee", data: null }, { n: 101 }]
  ]);
});

test("saliance graph", async function(t) {
  let rs = new SelectWhen();

  let askedToMatch: string[] = [];
  let matches: string[] = [];

  let rule = new Rule();
  rule.saliance = [
    { domain: "foo", name: "foo" },
    { domain: "bar", name: "*" }
  ];
  rule.matcher = function(event, state) {
    askedToMatch.push(event.domain + ":" + event.name);
    return { match: true, state };
  };
  rs.when(rule, function(event, state) {
    matches.push(event.domain + ":" + event.name);
  });

  rs.send("foo:foo");
  rs.send("foo:bar");
  rs.send("bar:bar");
  rs.send("wat:bar");
  await rs.send("bar:wat");

  // should only be askedToMatch the ones that are salient
  t.deepEqual(askedToMatch, ["foo:foo", "bar:bar", "bar:wat"]);
  t.deepEqual(askedToMatch, matches);

  t.deepEqual(rs.getSaliance(), [
    { domain: "foo", name: "foo" },
    { domain: "bar", name: "*" }
  ]);

  let rule2 = new Rule();
  rule2.saliance = [
    { domain: "some", name: "new" },
    { domain: "foo", name: "foo" } // duplicate
  ];
  rs.when(rule2, function() {});
  t.deepEqual(rs.getSaliance(), [
    { domain: "foo", name: "foo" },
    { domain: "bar", name: "*" },
    { domain: "some", name: "new" }
  ]);
});

test("async matcher", async function(t) {
  let rs = new SelectWhen<null, { n: number }>();

  let preMatch: string[] = [];
  let matches: string[] = [];

  let rule = new Rule<null, { n: number }>();
  rule.state = { n: 0 };
  rule.matcher = async function(event, state) {
    state = state || { n: 0 };
    preMatch.push(event.name + "-" + state.n);
    await sleep(1);
    return {
      match: true,
      state: { n: state.n + 1 }
    };
  };

  rs.when(rule, function(event, state) {
    state = state || { n: 0 };
    matches.push(event.name + "-" + state.n);
  });

  rs.send("foo");
  rs.send("bar");
  await rs.send("baz");

  t.deepEqual(preMatch, ["foo-0", "bar-1", "baz-2"]);
  t.deepEqual(matches, ["foo-1", "bar-2", "baz-3"]);
});

test("async matcher per rule", async function(t) {
  let rs = new SelectWhen();

  let events: string[] = [];

  let rule0 = new Rule();
  rule0.matcher = async function(event, state) {
    events.push("pre0-" + event.name);
    await sleep(10);
    events.push("pst0-" + event.name);
    return { match: true, state };
  };
  rs.when(rule0, function(event, state) {
    events.push("run0-" + event.name);
  });

  let rule1 = new Rule();
  rule1.matcher = async function(event, state) {
    events.push("pre1-" + event.name);
    await sleep(1);
    events.push("pst1-" + event.name);
    return { match: true, state };
  };
  rs.when(rule1, function(event, state) {
    events.push("run1-" + event.name);
  });

  await rs.send("aaa");
  await rs.send("bbb");
  await rs.send("ccc");

  t.deepEqual(events, [
    // rules run in order until completion
    "pre0-aaa",
    "pst0-aaa",
    "run0-aaa",
    "pre1-aaa",
    "pst1-aaa",
    "run1-aaa",

    "pre0-bbb",
    "pst0-bbb",
    "run0-bbb",
    "pre1-bbb",
    "pst1-bbb",
    "run1-bbb",

    "pre0-ccc",
    "pst0-ccc",
    "run0-ccc",
    "pre1-ccc",
    "pst1-ccc",
    "run1-ccc"
  ]);

  events = [];
  rs.send("aaa");
  rs.send("bbb");
  let p = rs.send("ccc");

  t.deepEqual(events, ["pre0-aaa"], "nothing else here since it's async");
  await p;
  t.deepEqual(events, [
    "pre0-aaa",
    "pst0-aaa",
    "run0-aaa",
    "pre1-aaa",
    "pst1-aaa",
    "run1-aaa",

    "pre0-bbb",
    "pst0-bbb",
    "run0-bbb",
    "pre1-bbb",
    "pst1-bbb",
    "run1-bbb",

    "pre0-ccc",
    "pst0-ccc",
    "run0-ccc",
    "pre1-ccc",
    "pst1-ccc",
    "run1-ccc"
  ]);
});

test("send rule results", async function(t) {
  let rs = new SelectWhen<{}, {}, string>();

  let rule0 = new Rule();
  rule0.matcher = async function(event, state) {
    await sleep(10);
    return { match: true, state };
  };
  rs.when(rule0, async function(event, state) {
    await sleep(10);
    return "first rule";
  });

  let rule1 = new Rule();
  rule1.matcher = async function(event, state) {
    await sleep(1);
    return { match: true, state };
  };
  rs.when(rule1, async function(event, state) {
    await sleep(1);
    return "second rule";
  });

  t.deepEqual(await rs.send("aaa"), [
    { id: "w0", data: "first rule" },
    { id: "w1", data: "second rule" }
  ]);
});
