import type { eventWithTime } from "@rrweb/types";

export type { eventWithTime };

export interface CollectResult {
  events: eventWithTime[];
  total: number;
}
