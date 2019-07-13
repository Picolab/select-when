export function PromiseSeries<RET>() {
  type RunItFn = () => Promise<RET>;
  let queue: (() => void)[] = [];
  return function(doIt: RunItFn): Promise<RET> {
    return new Promise(function(resolve, reject) {
      queue.push(async () => {
        try {
          resolve(await doIt());
        } catch (err) {
          reject(err);
        }
        // all done, remove from queue
        queue.shift();
        // now go to the next in the queue
        if (queue.length > 0) {
          queue[0]();
        }
      });
      if (queue.length === 1) {
        queue[0]();
      }
    });
  };
}
