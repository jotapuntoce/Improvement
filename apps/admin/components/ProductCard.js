import { categoryColor, STATUS_META } from "@/lib/storage";

export default function ProductCard({ product, onEdit, onDelete }) {
  const color = categoryColor(product.category);
  const status = STATUS_META[product.status] || STATUS_META.activo;

  return (
    <article className="product-card">
      <div
        className="product-thumb"
        style={{
          background: product.imageUrl
            ? `url(${product.imageUrl}) center/cover`
            : `linear-gradient(135deg, ${color}33, transparent)`,
        }}
      >
        {!product.imageUrl && (
          <span className="product-thumb-fallback" style={{ color }}>
            {product.name.slice(0, 2).toUpperCase()}
          </span>
        )}
        <span className="status-badge" style={{ "--status-color": status.color }}>
          {status.label}
        </span>
      </div>

      <div className="product-body">
        <div className="product-header">
          <h3>{product.name}</h3>
          <span className="price-tag">
            ${Number(product.price || 0).toLocaleString("es-MX")}
          </span>
        </div>

        {product.category && (
          <span className="category-chip" style={{ "--chip-color": color }}>
            {product.category}
          </span>
        )}

        {product.description && <p className="product-desc">{product.description}</p>}

        <div className="product-footer">
          <span className="stock-hint">Stock: {product.stock ?? 0}</span>
          <div className="product-actions">
            <button type="button" className="icon-btn" onClick={onEdit} aria-label="Editar producto">
              ✎
            </button>
            <button
              type="button"
              className="icon-btn icon-btn-danger"
              onClick={onDelete}
              aria-label="Eliminar producto"
            >
              🗑
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
