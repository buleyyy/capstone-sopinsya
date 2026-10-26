import type { PrismaClient } from "@prisma/client";

/**
 * Abstraksi koneksi database.
 * Dibuat agar health-check dapat diuji tanpa MySQL sungguhan, dan agar aplikasi
 * tetap bisa berjalan ketika DATABASE_URL belum diisi.
 */
export interface Database {
  /** true jika DATABASE_URL sudah dikonfigurasi. */
  readonly configured: boolean;
  /** Menjalankan `SELECT 1`; melempar error jika gagal. */
  ping(): Promise<void>;
  /** Menutup koneksi (aman dipanggil walau belum pernah terhubung). */
  disconnect(): Promise<void>;
  /** Klien Prisma tunggal (dimuat malas). Tidak ada bila DATABASE_URL kosong. */
  prisma?(): Promise<PrismaClient>;
}

export function createDatabase(databaseUrl: string | undefined): Database {
  if (!databaseUrl) {
    return {
      configured: false,
      ping: async () => {
        throw new Error("DATABASE_URL belum dikonfigurasi");
      },
      disconnect: async () => {},
    };
  }

  let client: PrismaClient | undefined;

  // Prisma Client dimuat malas (lazy) agar server tidak gagal start bila
  // `prisma generate` belum dijalankan atau database belum menyala.
  const getClient = async (): Promise<PrismaClient> => {
    if (!client) {
      const { PrismaClient: Client } = await import("@prisma/client");
      client = new Client({ datasourceUrl: databaseUrl });
    }
    return client;
  };

  return {
    configured: true,
    async ping() {
      const c = await getClient();
      await c.$queryRaw`SELECT 1`;
    },
    async disconnect() {
      if (client) await client.$disconnect();
    },
    prisma: getClient,
  };
}
