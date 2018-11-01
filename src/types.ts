export interface Event {
  domain?: string | null;
  name: string;
  data?: any;
  time: number;
}

export type Saliance = { domain?: string; name?: string };

export interface MatcherRet {
  match: boolean;
  state: any;
}

export type MatcherFn = (
  event: Event,
  state: any
) => MatcherRet | Promise<MatcherRet>;

export interface EventPattern {
  domain: string;
  name: string;
  matcher?: MatcherFn;
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
