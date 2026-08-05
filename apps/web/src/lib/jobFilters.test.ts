import { describe, expect, it } from "vitest";
import type { JobSummary } from "@job-tracker/shared/api";
import { countAttention, filterJobs, type JobViewFilters } from "./jobFilters";

function job(overrides: Partial<JobSummary>): JobSummary {
  return {
    id: "job",
    title: "Engineer",
    company: "Sample Company",
    hidden: false,
    starred: false,
    attention: null,
    ...overrides,
  } as JobSummary;
}

const all = [
  job({
    id: "attention",
    starred: true,
    attention: { stage: "applied", since: "2026-06-01T00:00:00Z", days: 30 },
  }),
  job({
    id: "hidden-attention",
    hidden: true,
    starred: true,
    attention: { stage: "in_process", since: "2026-06-01T00:00:00Z", days: 30 },
  }),
  job({ id: "starred", title: "Designer", starred: true }),
  job({ id: "plain", company: "Beta" }),
];

const defaults: JobViewFilters = {
  search: "",
  hideHidden: false,
  showStarred: false,
  showAttention: false,
};

describe("attention view filtering", () => {
  it("counts non-hidden candidates independently of other filters", () => {
    expect(countAttention(all)).toBe(1);
  });

  it("excludes hidden candidates from attention-only even when hidden jobs are generally shown", () => {
    expect(filterJobs(all, { ...defaults, showAttention: true }).map((item) => item.id)).toEqual([
      "attention",
    ]);
  });

  it("combines attention with search and starred using AND semantics", () => {
    expect(
      filterJobs(all, {
        ...defaults,
        search: "engineer",
        showStarred: true,
        showAttention: true,
      }).map((item) => item.id),
    ).toEqual(["attention"]);
    expect(filterJobs(all, { ...defaults, search: "designer", showAttention: true })).toEqual([]);
  });
});
