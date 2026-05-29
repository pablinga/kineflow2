export function formatDate(value: string | Date) {
  const date =
    value instanceof Date
      ? value
      : value.includes("T")
        ? new Date(value)
        : new Date(`${value}T00:00:00`);

  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatDateTime(value: string) {
  const date = new Date(value);

  return `${formatDate(date)} ${date.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })}`;
}

export function formatCurrency(value: number) {
  return `$ ${new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 0,
  }).format(value || 0)}`;
}

export const formatMonto = formatCurrency;

export function formatSessionAmount(value: number) {
  return value > 0 ? formatCurrency(value) : "Sin monto";
}
