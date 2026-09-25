// Persistencia 100% local (localStorage del navegador) — sin backend.
// Cada negocio/marca puede tener su propia key de productos; por ahora
// solo existe "improvement", pero la función acepta un namespace para
// que agregar otra marca en el futuro no obligue a rediseñar esto.

export const CATEGORY_PALETTE = [
  "#7c5cff",
  "#22d3ee",
  "#10b981",
  "#f59e0b",
  "#f472b6",
  "#fb7185",
  "#38bdf8",
  "#a3e635",
];

export const STATUS_META = {
  activo: { label: "Activo", color: "#10b981" },
  pausado: { label: "Pausado", color: "#f59e0b" },
  agotado: { label: "Agotado", color: "#f87171" },
};

function isBrowser() {
  return typeof window !== "undefined";
}

function productsKey(namespace) {
  return `jpc-admin-products-${namespace}-v1`;
}

export function getProducts(namespace = "improvement") {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(productsKey(namespace));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Nombre del evento que se dispara cada vez que cambian los productos de una marca,
// para que piezas del panel que no son dueñas del estado (Sidebar, Topbar) puedan
// refrescar sus datos en vivo sin depender de una navegación de ruta.
export const PRODUCTS_CHANGED_EVENT = "jpc-products-changed";

function saveProducts(products, namespace = "improvement") {
  if (!isBrowser()) return;
  window.localStorage.setItem(productsKey(namespace), JSON.stringify(products));
  window.dispatchEvent(
    new CustomEvent(PRODUCTS_CHANGED_EVENT, { detail: { namespace } })
  );
}

export function addProduct(product, namespace = "improvement") {
  const id =
    isBrowser() && window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `p_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const next = [
    { id, createdAt: new Date().toISOString(), ...product },
    ...getProducts(namespace),
  ];
  saveProducts(next, namespace);
  return next;
}

export function updateProduct(id, updates, namespace = "improvement") {
  const next = getProducts(namespace).map((p) =>
    p.id === id ? { ...p, ...updates } : p
  );
  saveProducts(next, namespace);
  return next;
}

export function deleteProduct(id, namespace = "improvement") {
  const next = getProducts(namespace).filter((p) => p.id !== id);
  saveProducts(next, namespace);
  return next;
}

// Asigna un color estable de la paleta a cada categoría (mismo texto = mismo color siempre).
export function categoryColor(category) {
  if (!category) return CATEGORY_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = category.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CATEGORY_PALETTE[Math.abs(hash) % CATEGORY_PALETTE.length];
}
