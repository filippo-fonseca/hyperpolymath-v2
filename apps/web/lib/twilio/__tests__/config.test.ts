import { describe, expect, it } from "vitest";

import {
  getAllowedSmsSenders,
  getTwilioCredentials,
  isAllowedSmsSender,
  isOwnSmsNumber,
  normalizePhoneNumber,
  type TwilioEnv,
} from "../config";

describe("normalizePhoneNumber", () => {
  it("keeps an E.164 number as-is", () => {
    expect(normalizePhoneNumber("+12035550148", {})).toBe("+12035550148");
  });

  it("strips the punctuation humans type", () => {
    expect(normalizePhoneNumber("+1 (203) 555-0148", {})).toBe("+12035550148");
    expect(normalizePhoneNumber(" +1.203.555.0148 ", {})).toBe("+12035550148");
  });

  it("applies the default country code to a bare national number", () => {
    expect(normalizePhoneNumber("2035550148", {})).toBe("+12035550148");
    expect(normalizePhoneNumber("07700900123", { JARVIS_SMS_DEFAULT_COUNTRY_CODE: "+44" })).toBe(
      "+4407700900123",
    );
  });

  it("treats a leading 00 as the international prefix", () => {
    expect(normalizePhoneNumber("00442071838750", {})).toBe("+442071838750");
  });

  it("does not double-prefix a number that already carries the country code", () => {
    expect(normalizePhoneNumber("12035550148", {})).toBe("+12035550148");
  });

  it("returns null for nothing usable", () => {
    expect(normalizePhoneNumber("", {})).toBeNull();
    expect(normalizePhoneNumber(null, {})).toBeNull();
    expect(normalizePhoneNumber("not a number", {})).toBeNull();
  });
});

describe("getAllowedSmsSenders", () => {
  it("parses a comma-separated list and normalizes every entry", () => {
    const env: TwilioEnv = {
      JARVIS_SMS_ALLOWED_SENDERS: "+1 (203) 555-0148, 2035550199",
    };
    expect([...getAllowedSmsSenders(env)]).toEqual(["+12035550148", "+12035550199"]);
  });

  it("falls back to the owner's number alone", () => {
    expect([...getAllowedSmsSenders({ JARVIS_SMS_OWNER_NUMBER: "2035550148" })]).toEqual([
      "+12035550148",
    ]);
  });

  it("is empty when nothing is configured, so the channel accepts nobody", () => {
    expect(getAllowedSmsSenders({}).size).toBe(0);
  });
});

describe("isAllowedSmsSender", () => {
  const env: TwilioEnv = { JARVIS_SMS_ALLOWED_SENDERS: "+12035550148" };

  it("matches regardless of the formatting the sender arrives in", () => {
    expect(isAllowedSmsSender("+12035550148", env)).toBe(true);
    expect(isAllowedSmsSender("(203) 555-0148", env)).toBe(true);
  });

  it("rejects anyone else", () => {
    expect(isAllowedSmsSender("+12035550199", env)).toBe(false);
    expect(isAllowedSmsSender(null, env)).toBe(false);
  });

  it("rejects everyone when the allowlist is unset", () => {
    expect(isAllowedSmsSender("+12035550148", {})).toBe(false);
  });
});

describe("isOwnSmsNumber", () => {
  it("recognizes our own sending number, which is the loop-breaker", () => {
    const env: TwilioEnv = { TWILIO_FROM_NUMBER: "+12035550199" };
    expect(isOwnSmsNumber("+12035550199", env)).toBe(true);
    expect(isOwnSmsNumber("2035550199", env)).toBe(true);
    expect(isOwnSmsNumber("+12035550148", env)).toBe(false);
  });

  it("is false when no sending number is configured", () => {
    expect(isOwnSmsNumber("+12035550199", {})).toBe(false);
  });
});

describe("getTwilioCredentials", () => {
  it("prefers a Messaging Service over a bare from-number", () => {
    const creds = getTwilioCredentials({
      TWILIO_ACCOUNT_SID: "AC123",
      TWILIO_AUTH_TOKEN: "tok",
      TWILIO_MESSAGING_SERVICE_SID: "MG123",
      TWILIO_FROM_NUMBER: "+12035550199",
    });
    expect(creds?.from).toEqual({ messagingServiceSid: "MG123" });
  });

  it("uses the from-number when there is no Messaging Service", () => {
    const creds = getTwilioCredentials({
      TWILIO_ACCOUNT_SID: "AC123",
      TWILIO_AUTH_TOKEN: "tok",
      TWILIO_FROM_NUMBER: "(203) 555-0199",
    });
    expect(creds?.from).toEqual({ phoneNumber: "+12035550199" });
  });

  it("returns null rather than a half-configured client", () => {
    expect(getTwilioCredentials({})).toBeNull();
    expect(getTwilioCredentials({ TWILIO_ACCOUNT_SID: "AC123" })).toBeNull();
    expect(
      getTwilioCredentials({ TWILIO_ACCOUNT_SID: "AC123", TWILIO_AUTH_TOKEN: "tok" }),
    ).toBeNull();
  });
});
