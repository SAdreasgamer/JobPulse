import { describe, expect, it } from "vitest";
import { companyFromSubject, fallbackSeedFromSubject, subjectOf } from "./subject";

// Gmail's tab-title shape: "<subject> - <account>@<host> - Gmail".
const gmailTitle = (subject: string) => `${subject} - me@example.com - Gmail`;

describe("subjectOf", () => {
  it("strips the account + Gmail tail, leaving the subject", () => {
    expect(subjectOf(gmailTitle("Your application to Sample Company"))).toBe(
      "Your application to Sample Company",
    );
  });

  it("keeps a subject that itself contains ' - '", () => {
    expect(subjectOf(gmailTitle("Interview - next steps"))).toBe("Interview - next steps");
  });
});

describe("companyFromSubject", () => {
  it("pulls the company after 'at'", () => {
    expect(companyFromSubject(gmailTitle("Software Engineer at Sample Company"))).toBe(
      "Sample Company",
    );
  });

  it("pulls a bracketed lead company", () => {
    expect(companyFromSubject(gmailTitle("[Globex] Interview scheduled"))).toBe("Globex");
  });

  it("pulls the company after 'to'", () => {
    expect(companyFromSubject(gmailTitle("Your application to Sample Company"))).toBe(
      "Sample Company",
    );
  });

  it("pulls the company after 'interest in'", () => {
    expect(companyFromSubject(gmailTitle("Thank you for your interest in Cloudpeak"))).toBe(
      "Cloudpeak",
    );
  });

  it("prefers 'at' over 'interest in' for a role phrase", () => {
    expect(
      companyFromSubject(gmailTitle("Thank you for your interest in the Elixir role at Vertex")),
    ).toBe("Vertex");
  });

  it("skips the 'joining' filler and stops at the dash after 'interest in'", () => {
    expect(
      companyFromSubject(
        gmailTitle(
          "Thank you for your interest in joining Northwind Partners - Full Stack Developer",
        ),
      ),
    ).toBe("Northwind Partners");
  });

  it("stops at the comma so a trailing name is dropped", () => {
    expect(companyFromSubject(gmailTitle("Thanks for your interest in Nimbus, Jordan!"))).toBe(
      "Nimbus",
    );
  });

  it("rejects 'interest in the <role> position' (no company)", () => {
    expect(
      companyFromSubject(
        gmailTitle(
          "Thank you for your interest in the Junior Software Engineer (Back-End) position",
        ),
      ),
    ).toBe("");
  });

  it("pulls a trailing parenthetical company", () => {
    expect(companyFromSubject(gmailTitle("Interview confirmation (Globex)"))).toBe("Globex");
  });

  it("pulls a company from a generic prefix + parenthetical", () => {
    // Real shape: a generic prefix followed by a multi-word company in parentheses.
    expect(companyFromSubject(gmailTitle("Your application (Meridian Insurance Group)"))).toBe(
      "Meridian Insurance Group",
    );
  });

  it("ignores a trailing parenthetical without a capital", () => {
    expect(companyFromSubject(gmailTitle("Position update (remote)"))).toBe("");
  });

  it("pulls a leading company before a pipe", () => {
    expect(companyFromSubject(gmailTitle("Alpine Cycles | Deine Bewerbung"))).toBe("Alpine Cycles");
  });

  it("pulls a leading company after a 'Prefix:' and before a dash", () => {
    // Real shape: the trailing '- Recruiter Interview' must NOT win here.
    expect(companyFromSubject(gmailTitle("Meeting invite: Dawnguard - Recruiter Interview"))).toBe(
      "Dawnguard",
    );
  });

  it("keeps the trailing company when the leading segment is a role", () => {
    expect(companyFromSubject(gmailTitle("Full Stack Engineer - Stonebridge"))).toBe("Stonebridge");
  });

  it("takes the trailing side of a pipe when the leading segment is generic", () => {
    // Pipe is ambiguous; a generic left segment falls through to the right side.
    expect(companyFromSubject(gmailTitle("Your application update | Zenith"))).toBe("Zenith");
  });

  it("skips a rule whose capture is a generic word, falling through", () => {
    // Trailing '- Application Confirmation' would seed "Application"; the reject
    // list makes it fall through, and nothing better matches, so no wrong seed.
    expect(companyFromSubject(gmailTitle("Backend Engineer - Application Confirmation"))).toBe("");
  });

  it("does not reject a real company that only shares a stem with a generic word", () => {
    // "Applied" is not in the reject list (only exact "application"/… heads are).
    expect(companyFromSubject(gmailTitle("Software Engineer at Applied Robotics"))).toBe(
      "Applied Robotics",
    );
  });

  it("returns empty when no shape matches", () => {
    expect(companyFromSubject(gmailTitle("weekly update"))).toBe("");
  });
});

describe("fallbackSeedFromSubject", () => {
  it("rejects a named list view", () => {
    expect(fallbackSeedFromSubject(gmailTitle("Inbox"))).toBe("");
  });

  it("rejects a list view carrying an unread count", () => {
    expect(fallbackSeedFromSubject(gmailTitle("Starred (12)"))).toBe("");
  });

  it("strips Re:/Fwd: prefixes", () => {
    expect(fallbackSeedFromSubject(gmailTitle("Re: Fwd: Offer details"))).toBe("Offer details");
  });

  it("truncates a long subject at a word boundary", () => {
    const long = "Thank you for applying we have received your application and will review it soon";
    const out = fallbackSeedFromSubject(gmailTitle(long));
    expect(out.length).toBeLessThanOrEqual(60);
    expect(long.startsWith(out)).toBe(true);
    expect(out.endsWith(" ")).toBe(false); // trimmed at the boundary, no dangling space
  });

  it("passes an ordinary subject through unchanged", () => {
    expect(fallbackSeedFromSubject(gmailTitle("Your application was received"))).toBe(
      "Your application was received",
    );
  });
});
