import * as _ from "lodash";
import test from "ava";
import cleanEvent from "../src/cleanEvent";
import { Event } from "../src/types";

test("clean event", function(t) {
  function tst(event: any): Event | string {
    try {
      return cleanEvent(event);
    } catch (e) {
      return e + "";
    }
  }

  t.is(tst(""), "TypeError: event.name must be a string");
  t.deepEqual(_.omit(cleanEvent(" a "), "time"), {
    domain: null,
    name: "a",
    data: null
  });
  t.is(tst({}), "TypeError: event.name must be a string");
  t.is(tst({ domain: 1 }), "TypeError: event.domain must be a string or null");
  t.deepEqual(
    tst({ domain: " foo ", name: " bar ", extra: "thing", time: 123 }),
    {
      domain: "foo",
      name: "bar",
      data: null,
      time: 123
    }
  );

  let event = cleanEvent("a");
  t.deepEqual(_.omit(event, "time"), { domain: null, name: "a", data: null });
  t.true(Object.isFrozen(event));
  t.throws(function() {
    event.name = "b";
  });
  t.deepEqual(_.omit(event, "time"), { domain: null, name: "a", data: null });
});
