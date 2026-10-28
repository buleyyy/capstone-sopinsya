import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import type { PublicContentStore, PublicRoomDetail } from "../src/domain/publicContent.js";
import { createDatabase } from "../src/lib/database.js";
import { toHttpsUrl } from "../src/routes/publicContent.js";

const room: PublicRoomDetail = {
  id: 1,
  name: "Program1",
  description: "Pengantar",
  documentCount: 2,
  resources: [],
  documents: [
    { id: 10, code: "SOP-1", title: "Dokumen aman", url: "https://example.test/a.pdf" },
    { id: 11, code: "SOP-2", title: "Dokumen tautan buruk", url: "javascript:alert(1)" },
  ],
};

const store: PublicContentStore = {
  async listRooms() {
    return [{ id: room.id, name: room.name, description: room.description, documentCount: room.documentCount }];
  },
  async getRoom(id) {
    return id === 1 ? room : null; // Programlain dianggap tidak dipublikasikan
  },
};

const env = loadEnv({ NODE_ENV: "test" });
const makeApp = (publicContent?: PublicContentStore) =>
  createApp({ env, db: createDatabase(undefined), ...(publicContent ? { publicContent } : {}) });

describe("GET /api/public/rooms", () => {
  it("mengembalikan daftar Programtanpa login", async () => {
    const res = await request(makeApp(store)).get("/api/public/rooms");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: [{ id: 1, name: "Program1", description: "Pengantar", documentCount: 2 }],
    });
  });

  it("503 DB_NOT_CONFIGURED bila sumber data belum ada", async () => {
    const res = await request(makeApp()).get("/api/public/rooms");
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("DB_NOT_CONFIGURED");
  });
});

describe("GET /api/public/rooms/:id", () => {
  it("mengembalikan detail Programdan hanya meneruskan URL https", async () => {
    const res = await request(makeApp(store)).get("/api/public/rooms/1");
    expect(res.status).toBe(200);
    expect(res.body.data.documents).toEqual([
      { id: 10, code: "SOP-1", title: "Dokumen aman", url: "https://example.test/a.pdf" },
      { id: 11, code: "SOP-2", title: "Dokumen tautan buruk", url: null },
    ]);
  });

  it("404 untuk Programtidak ada/tidak dipublikasikan dan untuk ID tidak valid", async () => {
    const app = makeApp(store);
    expect((await request(app).get("/api/public/rooms/99")).status).toBe(404);
    expect((await request(app).get("/api/public/rooms/abc")).status).toBe(404);
    expect((await request(app).get("/api/public/rooms/0")).status).toBe(404);
  });

  it("tidak membocorkan field internal", async () => {
    const res = await request(makeApp(store)).get("/api/public/rooms/1");
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/departmentId|isPublished|pdfUrl|inviteHash|tokenHash/);
  });
});

describe("toHttpsUrl", () => {
  it("menerima https dan menolak lainnya", () => {
    expect(toHttpsUrl("https://x.test/a")).toBe("https://x.test/a");
    expect(toHttpsUrl("http://x.test/a")).toBeNull();
    expect(toHttpsUrl("https://u:p@x.test/a")).toBeNull();
    expect(toHttpsUrl("not a url")).toBeNull();
    expect(toHttpsUrl(null)).toBeNull();
  });
});
