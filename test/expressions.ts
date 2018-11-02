import test from "ava";
import {
  e,
  or,
  and,
  before,
  then,
  after,
  between,
  notBetween,
  any,
  count,
  repeat,
  within
} from "../src/expressions";
import { SelectWhen } from "../src";

test("e", async function(t) {
  t.deepEqual(e("foo:bar").getTransitions()[0].on, {
    kind: "event",
    domain: "foo",
    name: "bar"
  });
  t.deepEqual(e("foo").getTransitions()[0].on, {
    kind: "event",
    domain: "*",
    name: "foo"
  });
  t.deepEqual(e("foo:*").getTransitions()[0].on, {
    kind: "event",
    domain: "foo",
    name: "*"
  });

  let fn = function(event: any, state: any) {
    return { match: true, state: null };
  };
  t.deepEqual(e("foo", fn).getTransitions()[0].on, {
    kind: "event",
    domain: "*",
    name: "foo",
    matcher: fn
  });

  t.deepEqual(e("foo").compile(), {
    start: [["*:foo", "end"]]
  });

  let rs = new SelectWhen();
  let matches = 0;
  rs.when(e("aaa"), function(event, state) {
    matches++;
  });
  rs.send("aaa");
  await rs.send("bbb");
  t.is(matches, 1);
});

test("before", async function(t) {
  // select when foo before bar
  t.deepEqual(before(e("foo"), e("bar")).compile(), {
    start: [["*:foo", "s0"]],
    s0: [["*:bar", "end"]]
  });

  // select when before(foo, bar, baz)
  t.deepEqual(before(before(e("foo"), e("bar")), e("baz")).compile(), {
    start: [["*:foo", "s0"]],
    s0: [["*:bar", "s1"]],
    s1: [["*:baz", "end"]]
  });
  t.deepEqual(
    before(before(e("foo"), e("bar")), e("baz")).compile(),
    before(e("foo"), before(e("bar"), e("baz"))).compile(),
    "asserting `before's associative property"
  );

  let bm = before(e("foo"), e("bar")).toMatcher();
  t.deepEqual(await bm({ name: "foo", time: 0 }, {}), {
    match: false,
    state: { states: ["s0"] }
  });
  t.deepEqual(await bm({ name: "bar", time: 0 }, {}), {
    match: false,
    state: { states: ["start"] }
  });
  t.deepEqual(await bm({ name: "bar", time: 0 }, { states: ["s0"] }), {
    match: true,
    state: { states: ["end"] }
  });
  t.deepEqual(
    await bm({ name: "bar", time: 0 }, { states: ["end"] }),
    await bm({ name: "bar", time: 0 }, {})
  );
  t.deepEqual(
    await bm({ name: "bar", time: 0 }, { states: ["wat", "da"] }),
    await bm({ name: "bar", time: 0 }, {})
  );
  t.deepEqual(
    await bm({ name: "bar", time: 0 }, { states: ["wat", "s0", "da"] }),
    await bm({ name: "bar", time: 0 }, { states: ["s0"] })
  );

  let rs = new SelectWhen();
  let matches = 0;
  rs.when(before(e("foo"), e("bar")), function(event, state) {
    matches++;
  });
  await rs.send("foo");
  t.is(matches, 0);
  await rs.send("baz");
  t.is(matches, 0);
  await rs.send("bar");
  t.is(matches, 1);
  await rs.send("bar");
  t.is(matches, 1);
  await rs.send("foo");
  t.is(matches, 1);
  await rs.send("foo");
  t.is(matches, 1);
  await rs.send("bar");
  t.is(matches, 2);
});

test("or", function(t) {
  let stm = or(e("foo"), e("bar"));

  t.deepEqual(stm.compile(), {
    start: [["*:foo", "end"], ["*:bar", "end"]]
  });
});

test("and", function(t) {
  let stm = and(e("aaa"), e("bbb"));

  t.deepEqual(stm.compile(), {
    start: [["*:aaa", "s0"], ["*:bbb", "s1"]],
    s0: [["*:bbb", "end"]],
    s1: [["*:aaa", "end"]]
  });
});

test("then", async function(t) {
  let stm = then(e("aaa:*"), e("aaa:bbb"));

  t.deepEqual(stm.compile(), {
    start: [["aaa:*", "s0"]],
    s0: [["aaa:bbb", "end"], [["not", "aaa:bbb"], "start"]]
  });

  let matches = 0;
  let rs = new SelectWhen();
  rs.when(stm, function() {
    matches++;
  });
  await rs.send("aaa:hi");
  t.is(matches, 0);
  await rs.send("aaa:bbb");
  t.is(matches, 1);
  await rs.send("aaa:hi");
  t.is(matches, 1);
  await rs.send("aaa:ccc");
  await rs.send("aaa:bbb");
  t.is(matches, 1);
});

test("after", function(t) {
  let stm = after(e("aaa"), e("bbb"));

  t.deepEqual(stm.compile(), {
    start: [["*:bbb", "s0"]],
    s0: [["*:aaa", "end"]]
  });
});

test("between", function(t) {
  let stm = between(e("aaa"), e("bbb"), e("ccc"));

  t.deepEqual(stm.compile(), {
    start: [["*:bbb", "s0"]],
    s0: [["*:aaa", "s1"]],
    s1: [["*:ccc", "end"]]
  });
});

test("notBetween", function(t) {
  let stm = notBetween(e("aaa"), e("bbb"), e("ccc"));

  t.deepEqual(stm.compile(), {
    start: [["*:bbb", "s0"]],
    s0: [["*:aaa", "start"], ["*:ccc", "end"]]
  });
});

test("any", function(t) {
  let stm = any(2, e("aaa"), e("bbb"), e("ccc"), e("ddd"));

  t.deepEqual(stm.compile(), {
    start: [["*:aaa", "s0"], ["*:bbb", "s1"], ["*:ccc", "s2"], ["*:ddd", "s3"]],
    s0: [["*:bbb", "end"], ["*:ccc", "end"], ["*:ddd", "end"]],
    s1: [["*:aaa", "end"], ["*:ccc", "end"], ["*:ddd", "end"]],
    s2: [["*:aaa", "end"], ["*:bbb", "end"], ["*:ddd", "end"]],
    s3: [["*:aaa", "end"], ["*:bbb", "end"], ["*:ccc", "end"]]
  });
});

test("count", function(t) {
  let stm = count(3, e("aaa"));

  t.deepEqual(stm.compile(), {
    start: [["*:aaa", "s0"]],
    s0: [["*:aaa", "s1"]],
    s1: [["*:aaa", "end"]]
  });
});

test("repeat", function(t) {
  let stm = repeat(3, e("aaa"));

  t.deepEqual(stm.compile(), {
    start: [["*:aaa", "s0"]],
    s0: [["*:aaa", "s1"]],
    s1: [["*:aaa", "end"]],
    end: [["*:aaa", "end"]]
  });
  // TODO test that the end state loop works as expected
});

test("within", async function(t) {
  let matcher = within(100, before(e("foo"), e("bar"))).matcher;

  let r0 = await Promise.resolve(matcher({ name: "foo", time: 100 }, null));
  t.deepEqual(r0, {
    match: false,
    state: { starttime: 100, states: ["s0"] }
  });
  t.deepEqual(await matcher({ name: "bar", time: 110 }, r0.state), {
    match: true,
    state: { starttime: 100, states: ["end"] }
  });
  t.deepEqual(await matcher({ name: "bar", time: 201 }, r0.state), {
    match: false,
    state: { starttime: 201, states: ["start"] }
  });

  t.deepEqual(
    await matcher(
      { name: "foo", time: 133 },
      { starttime: 123, states: ["start"] }
    ),
    {
      match: false,
      state: {
        starttime: 133, // Reset the time b/c it began at the 'start' state
        states: ["s0"]
      }
    }
  );

  let didPromiseMode = false;
  matcher = within(function(event) {
    if (event.name === "foo") {
      return 100;
    }
    return new Promise(function(resolve) {
      setTimeout(function() {
        didPromiseMode = true;
        resolve(1000);
      }, 10);
    });
  }, before(e("foo"), e("bar"))).matcher;

  t.deepEqual(await matcher({ name: "foo", time: 110 }, {}), {
    match: false,
    state: { starttime: 110, states: ["s0"] }
  });
  t.false(didPromiseMode);

  t.deepEqual(
    await matcher(
      { name: "bar", time: 510 },
      { starttime: 110, states: ["s0"] }
    ),
    {
      match: true,
      state: { starttime: 110, states: ["end"] }
    }
  );
  t.true(didPromiseMode);
});
