export interface Event<DataT> {
  domain?: string | null;
  name: string;
  data?: DataT | null;
  time: number;
}

export type Saliance = { domain?: string; name?: string };

export interface StateShape {
  states?: string[];
}

export interface MatcherRet<StateT> {
  match: boolean;
  state: StateT | undefined | null;
}

export type Async<T> = T | Promise<T>;

export type MatcherFn<DataT, StateT> = (
  event: Event<DataT>,
  state: StateT | undefined | null
) => Async<MatcherRet<StateT>>;

export interface EventPattern<DataT, StateT> {
  domain: string;
  name: string;
  matcher?: MatcherFn<DataT, StateT>;
}

export interface TransitionEvent_base {}

export interface TransitionEvent_event<DataT, StateT>
  extends TransitionEvent_base {
  kind: "event";
  domain?: string;
  name: string;
  matcher?: MatcherFn<DataT, StateT>;
}

export interface TransitionEvent_not<DataT, StateT>
  extends TransitionEvent_base {
  kind: "not";
  right: TransitionEvent<DataT, StateT>;
}

export interface TransitionEvent_or<DataT, StateT>
  extends TransitionEvent_base {
  kind: "or";
  left: TransitionEvent<DataT, StateT>;
  right: TransitionEvent<DataT, StateT>;
}

export interface TransitionEvent_and<DataT, StateT>
  extends TransitionEvent_base {
  kind: "and";
  left: TransitionEvent<DataT, StateT>;
  right: TransitionEvent<DataT, StateT>;
}

// wrapped in an interfaces b/c `type` can't be self-referential
export type TransitionEvent<DataT, StateT> =
  | TransitionEvent_event<DataT, StateT>
  | TransitionEvent_not<DataT, StateT>
  | TransitionEvent_or<DataT, StateT>
  | TransitionEvent_and<DataT, StateT>;

export interface Transition<DataT, StateT> {
  from: string;
  on: TransitionEvent<DataT, StateT>;
  to: string;
}

export interface TransitionCompact {
  from: string;
  on: string;
  to: string;
}
