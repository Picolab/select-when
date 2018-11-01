import { SelectWhen, e, or, then } from "./src";

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
