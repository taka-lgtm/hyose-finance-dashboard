// 試算表PDFプレビューモーダル
export default function PdfPreviewModal({ open, onClose, url, title, onDelete }) {
  if (!open) return null;

  return (
    <div className={`modal-overlay ${open ? "open" : ""}`} onClick={onClose}>
      <div className="modal pdf-preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3>{title || "試算表PDF"}</h3>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {url && (
              <a href={url} target="_blank" rel="noopener noreferrer" className="btn" style={{ textDecoration: "none", fontSize: 12 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                別タブ
              </a>
            )}
            {onDelete && (
              <button className="btn" style={{ fontSize: 12, color: "var(--rd)", borderColor: "rgba(229,91,91,.3)" }} onClick={onDelete}>
                削除
              </button>
            )}
            <button className="modal-close" onClick={onClose}>&times;</button>
          </div>
        </div>
        <div className="pdf-preview-body">
          {url ? (
            <iframe src={url} className="pdf-preview-frame" title="PDF Preview" />
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--tx3)" }}>
              PDFが見つかりません
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
