import * as _ from "lodash";
import test from "ava";
import { SelectWhen, Rule } from "../src";
import { e } from "../src/expressions";

test("last", async function(t) {
  let log: string[] = [];
  let shouldBreak = false;

  let rs = new SelectWhen<any, any>();

  rs.when(e("aaa"), function() {
    log.push("one");
  });
  rs.when(e("aaa"), function(event, state, last) {
    log.push("two");
    if (shouldBreak) {
      last();
    }
  });
  rs.when(e("aaa"), function() {
    log.push("three");
  });
  rs.when(e("aaa"), function() {
    log.push("four");
  });

  await rs.send("aaa");
  t.deepEqual(log, ["one", "two", "three", "four"]);
  log = [];

  shouldBreak = true;
  await rs.send("aaa");
  t.deepEqual(log, ["one", "two"]);
  log = [];
});
