import { expect, it } from "vitest";
import { fillEmptyFields } from "../src/lib/metadata";
it("keeps manual fields while filling absent fields", () => {
  expect(
    fillEmptyFields(
      { title: "My title", description: "", iconUrl: "https://mine.test/icon" },
      {
        title: "Fetched",
        description: "Description",
        iconUrl: "https://other.test/icon",
      },
    ),
  ).toEqual({
    title: "My title",
    description: "Description",
    iconUrl: "https://mine.test/icon",
  });
});
