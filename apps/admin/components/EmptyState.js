export default function EmptyState({ onCreate }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">✨</div>
      <h3>Aún no hay productos en Improvement</h3>
      <p>Agrega tu primer producto para empezar a armar el catálogo.</p>
      <button type="button" className="btn btn-primary" onClick={onCreate}>
        + Agregar primer producto
      </button>
    </div>
  );
}
