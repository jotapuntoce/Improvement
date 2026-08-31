"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getProducts } from "@/lib/storage";
import AppIcon from "@/components/AppIcon";

function StatCard({ label, value, icon }) {
  return (
    <div className="stat-card">
      <span className="stat-icon">{icon}</span>
      <div>
        <p className="stat-value">{value}</p>
        <p className="stat-label">{label}</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [products, setProducts] = useState([]);

  useEffect(() => {
    // Hidrata el estado desde localStorage al montar — no hay forma de leerlo durante el
    // render del servidor, así que este setState síncrono en el mount es intencional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProducts(getProducts("improvement"));
  }, []);

  const total = products.length;
  const categories = new Set(products.map((p) => p.category).filter(Boolean)).size;
  const activos = products.filter((p) => p.status === "activo").length;
  const inventoryValue = products.reduce(
    (sum, p) => sum + (Number(p.price) || 0) * (Number(p.stock) || 0),
    0
  );

  return (
    <div className="page-stack">
      <section className="hero-card">
        <div>
          <p className="hero-eyebrow">Bienvenido de vuelta</p>
          <h2 className="hero-title">
            Panel Administrativo <span className="grad-text">JotaPuntoCe</span>
          </h2>
          <p className="hero-copy">
            Gestiona tus marcas y productos desde un solo lugar. Empieza por Improvement.
          </p>
        </div>
        <Link href="/improvement" className="btn btn-primary">
          Ir a Improvement →
        </Link>
      </section>

      <section className="stat-grid">
        <StatCard label="Productos" value={total} icon="📦" />
        <StatCard label="Categorías" value={categories} icon="🏷️" />
        <StatCard label="Activos" value={activos} icon="⚡" />
        <StatCard
          label="Valor de inventario"
          value={`$${inventoryValue.toLocaleString("es-MX")}`}
          icon="💠"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Link href="/improvement" className="brand-card">
          <div className="brand-card-glow" />
          <AppIcon size={48} liveCount={activos} />
          <div>
            <h3>Improvement</h3>
            <p>Empresa digital · catálogo y gestión de productos.</p>
          </div>
          <span className="brand-card-arrow">→</span>
        </Link>
        <div className="brand-card brand-card-disabled">
          <div className="brand-card-icon">+</div>
          <div>
            <h3>Próxima marca</h3>
            <p>Aquí aparecerá tu siguiente negocio.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
