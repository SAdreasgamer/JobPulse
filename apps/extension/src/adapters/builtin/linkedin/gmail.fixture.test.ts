// Gmail cards use LinkedIn's resolver for their LI-prefixed identifiers.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { gmailAdapter } from "./gmail";
import { linkedinAdapter } from "./web";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const loadFixture = (name: string) => readFileSync(path.join(FIXTURES, name), "utf8");

describe("gmail adapter — findCards", () => {
  it("tags the rejection subject as a wall card, dated from the message time", () => {
    document.body.innerHTML = loadFixture("gmail-inbox.html");

    const cards = gmailAdapter.findCards(document);
    const rejection = cards.find((c) => c.dataset.jhId === "LI-100002")!;

    expect(rejection).toBeDefined();
    expect(rejection.dataset.jobTitle).toBe("Example Backend Engineer");
    expect(rejection.dataset.jobCompany).toBe("Example Labs");
    expect(rejection.dataset.jhWall).toBe("1");
    expect(rejection.dataset.jhWallStatus).toBe("rejected");
    expect(rejection.dataset.jhForceMode).toBe("dim");
    expect(rejection.dataset.jhTs).toBe("2026-03-02T09:15:00.000Z");

    expect(linkedinAdapter.naturalKey!(rejection.dataset.jhId!)).toEqual({
      platform: "linkedin",
      platform_id: "100002",
    });
  });

  it("leaves a 'similar jobs' recommendation off the wall", () => {
    document.body.innerHTML = loadFixture("gmail-inbox.html");

    const cards = gmailAdapter.findCards(document);
    const recommendation = cards.find((c) => c.dataset.jhId === "LI-100003")!;

    expect(recommendation).toBeDefined();
    expect(recommendation.dataset.jobTitle).toBe("Example Platform Engineer");
    expect(recommendation.dataset.jobCompany).toBe("Sample Works");
    expect(recommendation.dataset.jhWall).toBeUndefined();
    expect(recommendation.dataset.jhForceMode).toBeUndefined();
  });

  // LinkedIn's own mails link postings by slug URL, so a card is tagged only when the
  // id is read from behind the slug.
  it("tags a card whose link carries the slug url", () => {
    document.body.innerHTML = `<table class="gs"><tr>
      <td width="48"><img alt="Example Employer" /></td>
      <td><div class="a3s">
        <p><a href="https://www.linkedin.com/comm/jobs/view/junior-cloud-devops-engineer-at-example-employer-4444945220/?trk=email_job_alert_digest_01" style="font-size:16px">Junior Cloud DevOps Engineer</a></p>
        <p>Example Employer · Utrecht, NL</p>
      </div></td>
    </tr></table>`;

    const cards = gmailAdapter.findCards(document);
    const card = cards.find((c) => c.dataset.jhId === "LI-4444945220")!;

    expect(card).toBeDefined();
    expect(card.dataset.jobTitle).toBe("Junior Cloud DevOps Engineer");
    expect(linkedinAdapter.naturalKey!(card.dataset.jhId!)).toEqual({
      platform: "linkedin",
      platform_id: "4444945220",
    });
  });

  it("does not wall an applied_job link when the email isn't a rejection", () => {
    // An applied-job link is not a rejection without the rejection template token.
    document.body.innerHTML = `<table class="gs"><tr>
      <td width="48"><img alt="Demo Company" /></td>
      <td><div class="a3s">
        <p><a href="https://www.linkedin.com/comm/jobs/view/333333/?trk=email_jobs_ejpu-jobs-tracker_applied_job" style="font-size:16px">Data Engineer</a></p>
        <p>Demo Company · Rotterdam, NL</p>
        <p><a href="https://www.linkedin.com/help?trk=eml-email_jobs_application_viewed_01-help-0">Help</a></p>
      </div></td>
    </tr></table>`;

    const cards = gmailAdapter.findCards(document);
    const card = cards.find((c) => c.dataset.jhId === "LI-333333")!;

    expect(card).toBeDefined();
    expect(card.dataset.jhWall).toBeUndefined();
    expect(card.dataset.jhWallStatus).toBeUndefined();
  });
});
