"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getProducts,
  addProduct,
  updateProduct,
  deleteProduct,
  STATUS_META,
} from "@/lib/storage";
import ProductCard from "@/components/ProductCard";
import ProductModal from "@/components/ProductModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyState from "@/components/EmptyState";

const NAMESPACE = "improvement";

export default function ImprovementPage() {
  const [products, setProducts] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("todas");
  const [statusFilter, setStatusFilter] = useState("todos");

  useEffect(() => {
    // Hidrata el estado desde localStorage al montar — no hay forma de leerlo durante el
    // render del servidor, así que este setState síncrono en el mount es intencional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProducts(getProducts(NAMESPACE));
    setLoaded(true);
  }, []);

  const categories = useMemo(() => {
    return Array.from(new Set(products.map((p) => p.category).filter(Boolean)));
  }, [products]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchesQuery = p.name.toLowerCase().includes(query.toLowerCase());
      const matchesCategory = categoryFilter === "todas" || p.category === categoryFilter;
      const matchesStatus = statusFilter === "todos" || p.status === statusFilter;
      return matchesQuery && matchesCategory && matchesStatus;
    });
  }, [products, query, categoryFilter, statusFilter]);

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(product) {
    setEditing(product);
    setModalOpen(true);
  }

  function handleSave(data) {
    const next = editing
      ? updateProduct(editing.id, data, NAMESPACE)
      : addProduct(data, NAMESPACE);
    setProducts(next);
    setModalOpen(false);
  }

  function handleDelete() {
    const next = deleteProduct(pendingDelete.id, NAMESPACE);
    setProducts(next);
    setPendingDelete(null);
  }

  if (!loaded) return null;

  return (
    <div className="page-stack">
      <section className="toolbar">
        <div className="toolbar-filters">
          <input
            className="input"
            placeholder="Buscar producto..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className="input"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="todas">Todas las categorías</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="todos">Todos los estados</option>
            {Object.entries(STATUS_META).map(([key, meta]) => (
              <option key={key} value={key}>
                {meta.label}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          + Nuevo producto
        </button>
      </section>

      {products.length === 0 ? (
        <EmptyState onCreate={openCreate} />
      ) : filtered.length === 0 ? (
        <p className="empty-hint">Ningún producto coincide con tu búsqueda.</p>
      ) : (
        <section className="product-grid">
          {filtered.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onEdit={() => openEdit(product)}
              onDelete={() => setPendingDelete(product)}
            />
          ))}
        </section>
      )}

      {modalOpen && (
        <ProductModal
          product={editing}
          categories={categories}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="¿Eliminar producto?"
          message={`"${pendingDelete.name}" se eliminará permanentemente.`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}
