"use client";

import { useState } from "react";

const EMPTY = {
  name: "",
  category: "",
  price: "",
  stock: "",
  status: "activo",
  imageUrl: "",
  description: "",
};

export default function ProductModal({ product, categories, onClose, onSave }) {
  const [form, setForm] = useState(product ? { ...EMPTY, ...product } : EMPTY);
  const [error, setError] = useState("");

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    onSave({
      ...form,
      name: form.name.trim(),
      category: form.category.trim(),
      price: Number(form.price) || 0,
      stock: Number(form.stock) || 0,
    });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{product ? "Editar producto" : "Nuevo producto"}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Nombre *</span>
            <input
              className="input"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Ej. Kit de bienestar"
              autoFocus
            />
          </label>

          <div className="field-row">
            <label className="field">
              <span>Categoría</span>
              <input
                className="input"
                list="category-options"
                value={form.category}
                onChange={(e) => update("category", e.target.value)}
                placeholder="Ej. Suplementos"
              />
              <datalist id="category-options">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <label className="field">
              <span>Estado</span>
              <select
                className="input"
                value={form.status}
                onChange={(e) => update("status", e.target.value)}
              >
                <option value="activo">Activo</option>
                <option value="pausado">Pausado</option>
                <option value="agotado">Agotado</option>
              </select>
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span>Precio</span>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(e) => update("price", e.target.value)}
                placeholder="0.00"
              />
            </label>
            <label className="field">
              <span>Stock</span>
              <input
                className="input"
                type="number"
                min="0"
                value={form.stock}
                onChange={(e) => update("stock", e.target.value)}
                placeholder="0"
              />
            </label>
          </div>

          <label className="field">
            <span>Imagen (URL, opcional)</span>
            <input
              className="input"
              value={form.imageUrl}
              onChange={(e) => update("imageUrl", e.target.value)}
              placeholder="https://..."
            />
          </label>

          <label className="field">
            <span>Descripción</span>
            <textarea
              className="input"
              rows={3}
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="Detalles del producto..."
            />
          </label>

          {error && <p className="form-error">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary">
              {product ? "Guardar cambios" : "Agregar producto"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
