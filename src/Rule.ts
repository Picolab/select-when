import { PromiseSeries } from "./PromiseSeries";
import { Event, Saliance, MatcherFn } from "./types";

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
