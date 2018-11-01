export interface Event {
  domain?: string | null;
  name: string;
  data?: any;
  time: number;
}

export type Saliance = { domain?: string; name?: string };

export type MatcherFn = (
  event: Event,
  state: any
) => { match: boolean; state: any } | Promise<{ match: boolean; state: any }>;

export interface EventPattern {
  domain: string;
  name: string;
  matcher?: MatcherFn;
}

export class Rule {
  private _state: any;
  set state(state: any) {
    this._state = Object.freeze(state);
  }
  get state() {
    return this._state;
  }

  public saliance: Saliance[] = [{}]; // default to *:*
  public matcher: MatcherFn = function(event: Event, state: any) {
    return { match: true, state };
  };

  private queue = PromiseSeries();

  constructor() {}

  select(event: Event) {
    return this.queue(() => {
      return Promise.resolve(this.matcher(event, this.state)).then(resp => {
        this._state = Object.freeze(resp.state);
        return resp.match === true;
      });
    });
  }
}

export function PromiseSeries<RET>() {
  type RunItFn = () => Promise<RET>;
  let queue: RunItFn[] = [];
  return function(doIt: RunItFn): Promise<RET> {
    let callback: any;
    let p: Promise<RET> = new Promise(function(resolve, reject) {
      callback = function(err: Error, data: RET) {
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

export interface TransitionEvent_base {}

export interface TransitionEvent_event extends TransitionEvent_base {
  kind: "event";
  domain?: string;
  name: string;
  matcher?: MatcherFn;
}

export interface TransitionEvent_not extends TransitionEvent_base {
  kind: "not";
  right: TransitionEvent;
}

export interface TransitionEvent_or extends TransitionEvent_base {
  kind: "or";
  left: TransitionEvent;
  right: TransitionEvent;
}

export interface TransitionEvent_and extends TransitionEvent_base {
  kind: "and";
  left: TransitionEvent;
  right: TransitionEvent;
}

// wrapped in an interfaces b/c `type` can't be self-referential
export type TransitionEvent =
  | TransitionEvent_event
  | TransitionEvent_not
  | TransitionEvent_or
  | TransitionEvent_and;

export interface Transition {
  from: string;
  on: TransitionEvent;
  to: string;
}

export interface TransitionCompact {
  from: string;
  on: string;
  to: string;
}
