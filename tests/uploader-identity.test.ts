import { describe, expect, it } from "vitest";
import {
  preselectUploaderSeat,
  shouldPromptForUploader,
  suggestUploaderCanonicalName,
  type UploaderSeatCandidate,
} from "../src/lib/uploader-identity";

const claims = [{ key: "lfcazn", name: "lfcazn", gamesPlayed: 12 }];

describe("uploader identity confirmation", () => {
  it("stays silent when any claimed IGN matches the screenshot", () => {
    expect(shouldPromptForUploader(["Valor", "LFCAZN", "Amenhotep"], claims)).toBe(false);
  });

  it("prompts when the account has no claimed IGN", () => {
    expect(shouldPromptForUploader(["Valor", "lfcazn"], [])).toBe(true);
  });

  it("prompts when none of several claimed IGNs are on the screenshot", () => {
    const multiple = [...claims, { key: "alt", name: "alt", gamesPlayed: 3 }];
    expect(shouldPromptForUploader(["Valor", "Amenhotep"], multiple)).toBe(true);
  });

  it("preselects the only seat not claimed by another account", () => {
    const candidates: UploaderSeatCandidate[] = [
      { detectedName: "A", placement: 1, key: "a", takenByAnotherAccount: true, gamesPlayed: 4 },
      { detectedName: "B", placement: 2, key: "b", takenByAnotherAccount: true, gamesPlayed: 4 },
      { detectedName: "C", placement: 3, key: "c", takenByAnotherAccount: true, gamesPlayed: 4 },
      { detectedName: "D", placement: 4, key: "d", takenByAnotherAccount: false, gamesPlayed: 0 },
    ];
    expect(preselectUploaderSeat(candidates)).toBe("d");
  });

  it("does not preselect when several seats are available", () => {
    const candidates: UploaderSeatCandidate[] = [
      { detectedName: "A", placement: 1, key: "a", takenByAnotherAccount: false, gamesPlayed: 0 },
      { detectedName: "B", placement: 2, key: "b", takenByAnotherAccount: false, gamesPlayed: 0 },
    ];
    expect(preselectUploaderSeat(candidates)).toBeNull();
  });

  it("suggests an existing claimed IGN for an I/L OCR typo", () => {
    expect(suggestUploaderCanonicalName("ifcazn", claims)?.key).toBe("lfcazn");
  });

  it("does not map an unrelated screenshot name to a claimed IGN", () => {
    expect(suggestUploaderCanonicalName("different", claims)).toBeNull();
  });
});
