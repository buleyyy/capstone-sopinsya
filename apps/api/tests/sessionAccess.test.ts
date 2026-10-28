import { describe, expect, it } from "vitest";
import { getAuditContext, readCookie } from "../src/middleware/sessionAccess.js";

describe("readCookie", () => {
  it("membaca cookie bernama dari beberapa cookie", () => {
    expect(readCookie("a=1; sopinsya_session=abc; b=2", "sopinsya_session")).toBe("abc");
  });
  it("undefined bila tidak ada atau header kosong", () => {
    expect(readCookie(undefined, "x")).toBeUndefined();
    expect(readCookie("a=1", "x")).toBeUndefined();
  });
  it("undefined untuk nilai yang tidak dapat didekode", () => {
    expect(readCookie("x=%E0%A4%A", "x")).toBeUndefined();
  });
});

describe("getAuditContext", () => {
  it("500 bila middleware belum mengisi konteks (tidak pernah membaca dari request)", () => {
    expect(() => getAuditContext({ locals: {} } as never)).toThrowError(/Konteks audit/);
  });
});
