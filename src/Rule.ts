import { PromiseSeries } from "./PromiseSeries";
import { Event, Saliance, MatcherFn } from "./types";

export class Rule<DataT, StateT> {
  private _state: StateT | undefined | null;
  set state(state: StateT | undefined | null) {
    this._state = Object.freeze(state);
  }
  get state() {
    return this._state;
  }

  public saliance: Saliance[] = [{}]; // default to *:*

  public matcher: MatcherFn<DataT, StateT> = function(
    event: Event<DataT>,
    state: StateT | undefined | null
  ) {
    return { match: true, state };
  };

  private queue = PromiseSeries<boolean>();

  select(event: Event<DataT>): Promise<boolean> {
    return this.queue(async () => {
      const resp = await this.matcher(event, this.state);
      this.state = resp.state;
      return resp.match === true;
    });
  }
}
