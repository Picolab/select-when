export function PromiseSeries<RET>() {
  type RunItFn = () => Promise<RET>;
  let queue: RunItFn[] = [];
  return function(doIt: RunItFn): Promise<RET> {
    let callback: (err: Error | null, data?: RET) => void;
    let p: Promise<RET> = new Promise(function(resolve, reject) {
      callback = function(err, data) {
        err ? reject(err) : resolve(data);
        // all done, remove from queue
        queue.shift();
        // now go to the next in the queue
        if (queue.length > 0) {
          queue[0]();
        }
      };
    });
    queue.push(function() {
      return doIt().then(
        function(data) {
          callback(null, data);
          return data;
        },
        function(err) {
          callback(err);
          return Promise.reject(err);
        }
      );
    });
    if (queue.length === 1) {
      queue[0]();
    }
    return p;
  };
}
