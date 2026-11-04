/**
 * Últimos datos cargados por los hooks de listas (turnos, pacientes), en
 * memoria mientras la pestaña está abierta. Al volver a una pantalla se
 * muestran al instante y el hook los actualiza por detrás.
 *
 * Las claves incluyen el usuario y el espacio, así nunca se muestran datos de
 * otra cuenta; igual se vacía al cerrar sesión. No se guarda nada en disco
 * (son datos de pacientes).
 */

const MAX_ENTRIES = 40;
const store = new Map<string, unknown>();

export function readQueryCache<T>(key: string | null): T | undefined {
  if (!key) {
    return undefined;
  }

  return store.get(key) as T | undefined;
}

export function writeQueryCache<T>(key: string | null, value: T) {
  if (!key) {
    return;
  }

  // Map conserva el orden de inserción: borrar y volver a insertar deja la
  // clave como la más reciente y se descarta la más vieja.
  store.delete(key);
  store.set(key, value);

  if (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;

    if (oldest !== undefined) {
      store.delete(oldest);
    }
  }
}

export function clearQueryCache() {
  store.clear();
}

/** Clave estable a partir de las partes que definen la consulta. */
export function buildQueryCacheKey(
  name: string,
  parts: Array<string | number | boolean | null | undefined>,
) {
  return `${name}:${JSON.stringify(parts)}`;
}
