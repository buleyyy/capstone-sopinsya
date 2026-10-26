export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="card state" role="status">
      <h3>{title}</h3>
      {children ? <p className="note">{children}</p> : null}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="card state state-error" role="alert">
      <h3>Data tidak dapat dimuat</h3>
      <p>{message}</p>
      <p className="note">Muat ulang halaman, atau hubungi penyelenggara bila masalah berlanjut.</p>
    </div>
  );
}
