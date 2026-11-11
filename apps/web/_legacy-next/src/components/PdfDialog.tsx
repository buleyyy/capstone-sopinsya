"use client";

import { useId } from "react";
import { Dialog } from "./Dialog";
import { CloseIcon, DownloadIcon, ImageIcon } from "./Icons";

export function PdfDialog({ title, url, onClose }: { title: string; url: string | null; onClose: () => void }) {
  const titleId = useId();

  return (
    <Dialog labelledBy={titleId} onClose={onClose} className="dlg-pdf">
      <div className="pdf-bar">
        <h2 id={titleId}>{title}</h2>
        <div className="pdf-actions">
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Buka atau unduh di tab baru">
              <DownloadIcon />
            </a>
          )}
          <button type="button" className="icon-btn icon-btn-light" onClick={onClose} aria-label="Tutup">
            <CloseIcon />
          </button>
        </div>
      </div>
      <div className="pdf-body">
        {url ? (
          <iframe src={url} title={title} />
        ) : (
          <div className="pdf-empty" role="status">
            <ImageIcon />
            <p>Dokumen belum tersedia.</p>
          </div>
        )}
      </div>
    </Dialog>
  );
}
