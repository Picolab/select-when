import test from "ava";
import { PromiseSeries } from "../src/PromiseSeries";

test("PromiseSeries", async function(t) {
  let queue = PromiseSeries<string>();

  let orderStart: string[] = [];
  let orderComplete: string[] = [];
  function sleeper(ms: number, message: string) {
    return new Promise<string>(function(resolve) {
      orderStart.push(message);
      setTimeout(() => {
        orderComplete.push(message);
        resolve(message);
      }, ms);
    });
  }

  let p1 = queue(() => sleeper(10, "one"));
  let p2 = queue(() => sleeper(30, "two"));
  let p3 = queue(() => sleeper(10, "three"));
  let p4 = queue(() => sleeper(20, "four"));

  t.deepEqual(await Promise.all([p1, p2, p3, p4]), [
    "one",
    "two",
    "three",
    "four"
  ]);

  t.deepEqual(orderStart, ["one", "two", "three", "four"]);

  t.deepEqual(orderComplete, ["one", "two", "three", "four"]);
});

test("PromiseSeries errors", async function(t) {
  let queue = PromiseSeries<string>();

  let p1 = queue(() => {
    return new Promise<string>((resolve, reject) => {
      setTimeout(() => {
        reject(new Error("failed"));
      }, 10);
    });
  });
  let p2 = queue(() => {
    throw new Error("failed sync");
  });
  let p3 = queue(async () => {
    return "hi";
  });

  let err = await t.throwsAsync(p1);
  t.is(err + "", "Error: failed");

  err = await t.throwsAsync(p2);
  t.is(err + "", "Error: failed sync");

  t.is(await p3, "hi");
});
