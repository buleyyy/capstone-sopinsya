/**
 * Abstraksi koneksi database.
 * Dibuat agar health-check dapat diuji tanpa MySQL sungguhan, dan agar aplikasi
 * tetap bisa berjalan ketika DATABASE_URL belum diisi (Fase 1).
 */
export interface Database {
  /** true jika DATABASE_URL sudah dikonfigurasi. */
  readonly configured: boolean;
  /** Menjalankan `SELECT 1`; melempar error jika gagal. */
  ping(): Promise<void>;
  /** Menutup koneksi (aman dipanggil walau belum pernah terhubung). */
  disconnect(): Promise<void>;
}

type PrismaLike = {
  $queryRaw(query: TemplateStringsArray): Promise<unknown>;
  $disconnect(): Promise<void>;
};

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

  let client: PrismaLike | undefined;

  // Prisma Client dimuat malas (lazy) agar server tidak gagal start bila
  // `prisma generate` belum dijalankan atau database belum menyala.
  const getClient = async (): Promise<PrismaLike> => {
    if (!client) {
      const { PrismaClient } = await import("@prisma/client");
      client = new PrismaClient({ datasourceUrl: databaseUrl }) as unknown as PrismaLike;
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
  };
}
