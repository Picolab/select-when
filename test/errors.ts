import test from "ava";
import { SelectWhen } from "../src";
import { e } from "../src/expressions";

test("when body error", async function(t) {
  let rs = new SelectWhen<any, any>();

  rs.when(e("some:thing"), function(event, state) {
    throw new Error("crashed");
  });

  const err = await t.throwsAsync(rs.send("some:thing"));

  t.is(err + "", "Error: crashed");
});
