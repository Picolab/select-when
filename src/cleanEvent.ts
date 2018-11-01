import * as _ from "lodash";
import { Event } from "./base";

function notBlankStr(str: any): boolean {
  return typeof str === "string" && str.trim().length > 0;
}

export default function cleanEvent(eventIn: any): Event {
  if (typeof eventIn === "string" && notBlankStr(eventIn)) {
    let parts = eventIn.split(":");
    eventIn = {};
    if (parts.length > 1) {
      eventIn.domain = parts[0];
      eventIn.name = parts.slice(1).join(":");
    } else {
      eventIn.name = parts[0];
    }
  }

  let event: Event = {
    domain: null,
    name: "",
    data: null,
    time: Date.now()
  };

  if (_.has(eventIn, "domain")) {
    if (notBlankStr(eventIn.domain)) {
      event.domain = eventIn.domain.trim();
    } else if (eventIn.domain === null || eventIn.domain === void 0) {
      event.domain = null;
    } else {
      throw new TypeError("event.domain must be a string or null");
    }
  } else {
    event.domain = null;
  }

  if (_.has(eventIn, "name") && notBlankStr(eventIn.name)) {
    event.name = eventIn.name.trim();
  } else {
    throw new TypeError("event.name must be a string");
  }

  if (_.has(eventIn, "data")) {
    event.data = eventIn.data;
  } else {
    event.data = null;
  }

  if (_.has(eventIn, "time")) {
    if (!_.isInteger(eventIn.time)) {
      throw new TypeError("event.time must be milliseconds since the epoch.");
    }
    event.time = eventIn.time;
  }

  return Object.freeze(event);
}
