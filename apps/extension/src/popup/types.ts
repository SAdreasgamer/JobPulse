// The popup's view of a job. api.ts fetches directly and returns the server JSON
// untyped, and the popup only reads this slice: enough for a result row, the detail
// header, and its links. getJob() returns the fuller PopupJobDetail with the event log.
export interface PopupListing {
  platform: string;
  platform_id: string;
  url?: string | null;
}

export interface PopupJob {
  id: string;
  title: string | null;
  company: string | null;
  status: string;
  primary_listing?: PopupListing | null;
}

// One row of a job's event log — the popup reads it to find the latest status
// transition a "status comment" should be welded onto (id = chronological order).
export interface PopupEvent {
  id: number;
  event: string;
  meta?: Record<string, unknown> | null;
}

export interface PopupJobDetail extends PopupJob {
  events?: PopupEvent[];
}
