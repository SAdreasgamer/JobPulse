import type { JobSummary } from "@job-tracker/shared/api";

export interface JobViewFilters {
  search: string;
  hideHidden: boolean;
  showStarred: boolean;
  showAttention: boolean;
}

// Attention is a narrowing filter over the complete client-side job set, with
// AND semantics alongside search/starred. Hidden jobs never participate in the
// attention view even when the general hide-hidden preference is off.
export function filterJobs(jobs: JobSummary[], filters: JobViewFilters): JobSummary[] {
  const query = filters.search.trim().toLowerCase();
  return jobs.filter((job) => {
    if (filters.hideHidden && job.hidden) return false;
    if (filters.showStarred && !job.starred) return false;
    if (filters.showAttention && (job.hidden || job.attention == null)) return false;
    if (!query) return true;
    return (
      (job.title ?? "").toLowerCase().includes(query) ||
      (job.company ?? "").toLowerCase().includes(query)
    );
  });
}

// The badge is global to the loaded set: search and starred do not change it.
export function countAttention(jobs: JobSummary[]): number {
  return jobs.filter((job) => !job.hidden && job.attention != null).length;
}
