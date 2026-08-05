// Every detail-page action is keyed on the id parsed here, so a URL shape that
// doesn't parse silently disables the whole surface. Shapes and pattern: identity.ts.
import { describe, expect, it } from "vitest";

import { linkedinJobId, linkedinRenderKey } from "./identity";

describe("linkedinJobId", () => {
  it("reads the bare id in-app navigation writes", () => {
    expect(linkedinJobId("/jobs/view/4444945220/")).toBe("4444945220");
    expect(linkedinJobId("/jobs/view/4444945220")).toBe("4444945220");
    expect(linkedinJobId("/jobs/view/4444945220/?refId=example")).toBe("4444945220");
  });

  it("reads the id behind the SEO slug on shared and emailed links", () => {
    expect(
      linkedinJobId(
        "/jobs/view/junior-cloud-devops-engineer-early-career-program-it-at-example-employer-4444945220/",
      ),
    ).toBe("4444945220");
  });

  it("takes the trailing id when the slug carries its own digits", () => {
    expect(linkedinJobId("/jobs/view/data-engineer-2-at-example-123456/")).toBe("123456");
    expect(linkedinJobId("/jobs/view/engineer-c-3-at-example-99/?trk=x")).toBe("99");
  });

  it("reads absolute urls and the /comm/ email variant", () => {
    expect(linkedinJobId("https://www.linkedin.com/jobs/view/100001/")).toBe("100001");
    expect(
      linkedinJobId(
        "https://www.linkedin.com/comm/jobs/view/senior-sre-at-example-333333/?trk=eml",
      ),
    ).toBe("333333");
  });

  it("returns null when the url names no job", () => {
    expect(linkedinJobId("/jobs/search/?keywords=devops")).toBeNull();
    expect(linkedinJobId("/jobs/view/some-slug-without-an-id/")).toBeNull();
    expect(linkedinJobId("/feed/")).toBeNull();
  });
});

describe("linkedinRenderKey", () => {
  it("prefixes the id, so both url shapes tag a card identically", () => {
    expect(linkedinRenderKey("/jobs/view/4444945220/")).toBe("LI-4444945220");
    expect(linkedinRenderKey("/jobs/view/junior-engineer-at-example-employer-4444945220/")).toBe(
      "LI-4444945220",
    );
  });

  it("is null when there is no id to prefix", () => {
    expect(linkedinRenderKey("/jobs/search/")).toBeNull();
  });
});
