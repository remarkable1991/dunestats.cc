import { describe, it, expect } from "vitest";
import { emailWindow, leagueStartAction, mayEmailLfgAlert, type LfgAlert } from "../src/lib/lfg-alerts";
const now = Date.parse("2026-10-25T12:00:00Z");
const alert: LfgAlert = { id: "event", lobby_id: 1, title: "Full", body: "4/4", kind: "full", state: "pending", browser_received_at: null, email_due_at: "2026-10-25T11:59:00Z", expires_at: "2026-10-25T12:10:00Z" };
describe("LFG delivery and start rules", () => {
  it("never emails an event received in the browser", () => {
    expect(mayEmailLfgAlert(alert, now)).toBe(true);
    expect(mayEmailLfgAlert({ ...alert, browser_received_at: "2026-10-25T11:58:00Z" }, now)).toBe(false);
  });
  it("blocks email while browser delivery is uncertain", () => {
    expect(mayEmailLfgAlert({ ...alert, state: "browser_pending" }, now)).toBe(false);
  });
  it("waits three minutes before email fallback", () => {
    expect(mayEmailLfgAlert({ ...alert, email_due_at: "2026-10-25T12:03:00Z" }, now)).toBe(false);
    expect(mayEmailLfgAlert({ ...alert, email_due_at: "2026-10-25T12:03:00Z" }, now + 180000)).toBe(true);
  });
  it("does not email expired events", () => expect(mayEmailLfgAlert(alert, now + 600000)).toBe(false));
  it("allows finite email windows only", () => {
    expect(emailWindow(4, now)).toBe("2026-10-25T16:00:00.000Z");
    expect(() => emailWindow(24, now)).toThrow();
  });
  it("removes League starts below three seats", () => {
    expect(leagueStartAction(true, 2)).toBe("none");
    expect(leagueStartAction(true, 1)).toBe("none");
  });
  it("requires a League vote at three seats", () => expect(leagueStartAction(true, 3)).toBe("vote"));
  it("allows full League and early casual starts", () => {
    expect(leagueStartAction(true, 4)).toBe("start");
    expect(leagueStartAction(false, 2)).toBe("start");
    expect(leagueStartAction(false, 3)).toBe("start");
  });
});