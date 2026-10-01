import { expect, test } from "vitest";
import { getUniqNameOnNames, normalize, withBase } from "@/functions";

test("Path normalize check", () => {
  expect(normalize("")).toBe("");
  expect(normalize("/a/b")).toBe("a/b");
  expect(normalize("/sub/a/b", "/sub")).toBe("a/b");
  expect(normalize("/a/b", "/sub")).toBe("error404");
});

test("Path withBase check", () => {
  expect(withBase("/")).toBe("/");
  expect(withBase("a/b")).toBe("/a/b");
  expect(withBase("/sub/a/b", "/sub")).toBe("/sub/a/b");
  expect(withBase("a/b", "/sub/")).toBe("/sub/a/b");
  expect(withBase("/", "/sub")).toBe("/sub/");
  expect(withBase("/sub", "/sub")).toBe("/sub/");
});

test("Rename check", () => {
  const names = new Set<string>(["a.jpg", "b.png"]);
  expect(getUniqNameOnNames(names, "a.jpg")).toBe("a(1).jpg");
  names.add("a(1).jpg");
  expect(getUniqNameOnNames(names, "a.jpg")).toBe("a(1)(1).jpg");
});
