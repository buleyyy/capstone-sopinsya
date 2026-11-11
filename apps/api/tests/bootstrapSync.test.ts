import { describe, expect, it } from "vitest";
import {
  authenticateAccount,
  bootstrapAdmin,
  createAuditorAccount,
  hashPassword,
  syncBootstrapAdmin,
} from "../src/services/accountService.js";
import { MemoryAccountStore } from "./helpers/memoryAccountStore.js";

const NEW = { email: "Asli@Contoh.com", password: "kata-sandi-baru-123", name: undefined };

async function storeWithPlaceholderAdmin() {
  const store = new MemoryAccountStore();
  await store.create({
    email: "emailanda@contoh.com",
    name: "Administrator",
    passwordHash: await hashPassword("tidak-diketahui-123"),
    role: "ADMIN",
  });
  return store;
}

describe("syncBootstrapAdmin", () => {
  it("mengganti email dan kata sandi satu-satunya Admin tanpa membuat akun baru", async () => {
    const store = await storeWithPlaceholderAdmin();
    const r = await syncBootstrapAdmin(store, NEW);
    expect(r.status).toBe("UPDATED");
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]?.email).toBe("asli@contoh.com");
    expect(await authenticateAccount(store, "asli@contoh.com", NEW.password)).not.toBeNull();
    expect(await authenticateAccount(store, "emailanda@contoh.com", "tidak-diketahui-123")).toBeNull();
  });

  it("idempotent: dijalankan ulang menghasilkan UNCHANGED dan hash tidak berubah", async () => {
    const store = await storeWithPlaceholderAdmin();
    await syncBootstrapAdmin(store, NEW);
    const hashBefore = store.rows[0]?.passwordHash;
    const again = await syncBootstrapAdmin(store, NEW);
    expect(again.status).toBe("UNCHANGED");
    expect(store.rows[0]?.passwordHash).toBe(hashBefore);
    expect(store.rows).toHaveLength(1);
  });

  it("mengaktifkan kembali Admin yang nonaktif", async () => {
    const store = await storeWithPlaceholderAdmin();
    await store.setActive(1, false);
    const r = await syncBootstrapAdmin(store, NEW);
    expect(r.status).toBe("UPDATED");
    expect(store.rows[0]?.isActive).toBe(true);
  });

  it("tidak mengubah nama bila BOOTSTRAP_ADMIN_NAME tidak diisi", async () => {
    const store = await storeWithPlaceholderAdmin();
    await syncBootstrapAdmin(store, NEW);
    expect(store.rows[0]?.name).toBe("Administrator");
  });

  it("membuat Admin bila belum ada Admin", async () => {
    const store = new MemoryAccountStore();
    const r = await syncBootstrapAdmin(store, NEW);
    expect(r.status).toBe("CREATED");
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]?.role).toBe("ADMIN");
  });

  it("menolak bila email dipakai akun Auditor dan tidak mengubah apa pun", async () => {
    const store = await storeWithPlaceholderAdmin();
    await createAuditorAccount(store, { email: "asli@contoh.com", name: "Auditor Satu", password: "sandi-auditor-123" });
    const r = await syncBootstrapAdmin(store, NEW);
    expect(r.status).toBe("EMAIL_TAKEN");
    expect(store.rows.find((x) => x.role === "ADMIN")?.email).toBe("emailanda@contoh.com");
  });

  it("ambigu bila ada beberapa Admin dan tidak ada yang memakai email tersebut", async () => {
    const store = await storeWithPlaceholderAdmin();
    await store.create({ email: "lain@contoh.com", name: "Lain", passwordHash: await hashPassword("sandi-lain-12345"), role: "ADMIN" });
    const r = await syncBootstrapAdmin(store, NEW);
    expect(r.status).toBe("AMBIGUOUS");
    expect(store.rows.map((x) => x.email).sort()).toEqual(["emailanda@contoh.com", "lain@contoh.com"]);
  });

  it("menolak kata sandi kurang dari 12 karakter", async () => {
    const store = await storeWithPlaceholderAdmin();
    await expect(syncBootstrapAdmin(store, { email: "asli@contoh.com", password: "pendek" })).rejects.toThrow();
  });

  it("bootstrapAdmin biasa tetap tidak menimpa Admin yang ada", async () => {
    const store = await storeWithPlaceholderAdmin();
    const r = await bootstrapAdmin(store, { email: "asli@contoh.com", password: NEW.password });
    expect(r).toEqual({ created: false, reason: "ADMIN_EXISTS" });
    expect(store.rows[0]?.email).toBe("emailanda@contoh.com");
  });
});
