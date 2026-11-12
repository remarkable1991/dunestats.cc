import { describe, expect, it } from "vitest";
import { formatImageSlug, formatImageUrl } from "@/lib/format-image";

describe("format image naming", () => {
  it("Uprising + Immortality is UpImmo", () => expect(formatImageSlug({ board: "uprising", immo: true })).toBe("UpImmo.png"));
  it("Uprising + Ix + Immortality is UpIxImmo", () => expect(formatImageSlug({ board: "uprising", ix: true, immo: true })).toBe("UpIxImmo.png"));
  it("matches the existing league link", () =>
    expect(formatImageUrl("UpImmo.png")).toBe("https://pub-f1cf1291e80f47448517d28bc5cb51b3.r2.dev/mode/UpImmo.png"));
});
