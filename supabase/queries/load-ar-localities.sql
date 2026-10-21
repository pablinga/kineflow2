-- Carga / actualización del maestro de localidades (ar_localities) desde el
-- archivo oficial de Georef (datos.gob.ar, fuente INDEC). Correr en cada
-- ambiente después de la migración 202610210002, en dos pasos (pg_net es
-- asíncrono):

-- Paso 1: pedir el archivo. Devuelve el id del pedido.
select net.http_get(
  url := 'https://infra.datos.gob.ar/georef/localidades.json',
  timeout_milliseconds := 60000
) as request_id;

-- Paso 2 (unos segundos después): cargar desde la respuesta. Reemplazar
-- :request_id por el número del paso 1. Devuelve la cantidad de localidades.
select public.load_ar_localities(content::jsonb) as loaded
from net._http_response
where id = :request_id and status_code = 200;

-- Control: ~3.350 filas; CABA y Rosario presentes.
select count(*) as total,
       count(*) filter (where province_id = '02') as caba,
       (select label from public.ar_localities where name = 'Rosario') as rosario
from public.ar_localities;
