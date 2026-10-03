import { describe, expect, it } from "vitest";
import { editorInitials, editorNameForUser, keepLoadEditedBy } from "./loadEdited";

describe("edited load mark", () => {
  it("stores the crew name for the signed-in dispatcher", () => {
    expect(editorNameForUser("klawson", "klawson@mrbults.com")).toBe("K Lawson");
    expect(editorNameForUser("treyling")).toBe("T Reyling");
    expect(editorNameForUser("Guest", "guest@example.com")).toBe("Guest");
  });

  it("turns a crew name into initials", () => {
    expect(editorInitials("K Lawson")).toBe("KL");
    expect(editorInitials("T Reyling")).toBe("TR");
    expect(editorInitials("M Burklow")).toBe("MB");
    expect(editorInitials("")).toBe("");
    expect(editorInitials(null)).toBe("");
  });

  it("keeps a local editor when the cloud row has no edited-by field", () => {
    const kept = keepLoadEditedBy(
      { id: "a", editedBy: undefined },
      { id: "a", editedBy: "K Lawson" },
    );
    expect(kept.editedBy).toBe("K Lawson");
    expect(keepLoadEditedBy({ editedBy: "T Reyling" }, { editedBy: "K Lawson" }).editedBy).toBe(
      "T Reyling",
    );
    expect(keepLoadEditedBy({ editedBy: null }, { editedBy: "K Lawson" }).editedBy).toBeNull();
  });
});
