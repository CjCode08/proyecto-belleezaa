# Cambios manuales de Supabase

- La base ya existe; no ejecutes scripts que creen el esquema inicial.
- Antes de aplicar una migración, confirma su contenido y aplícala una sola vez en el SQL Editor del proyecto Belleza.
- No copies contraseñas, UID ni claves de Supabase a los archivos del repositorio o al chat.
- El acceso del personal usa nombres de usuario vinculados a identificadores internos `@belleza.invalid`; no son buzones.
- El bucket `inventario-privado` es privado y contiene únicamente imágenes `almacen`.
- Migraciones aplicadas y confirmadas por el usuario: `20261105210000_inventory_access.sql`, `20261105220000_inventory_read_access.sql`, `20261105230000_inventory_create_product.sql`, y `20261106000000_inventory_audit_list.sql`.
- Aplicada y verificada: `migrations/20261106100000_inventory_edit_disable_delete_images.sql`. Incluye auditoría histórica, edición, inhabilitación, borrado exclusivo de admin y políticas de imágenes privadas.
- Pruebas manuales confirmadas: admin ve auditoría global; operador ve solo sus movimientos; operador edita, carga imágenes e inhabilita; admin reactiva y elimina. Se eliminó un producto temporal y la auditoría conservó el registro.
- No uses cuentas compartidas ni datos de prueba en inventario de venta.

## Alta de vendedores en pruebas

1. Usa el proyecto Supabase de prueba que contiene el esquema comercial y productos activos con stock y precios. El usuario ya aplicó las migraciones `20261120100000_sellers_catalog_read.sql`, `20261120110000_sellers_inventory_images.sql` y `20261123100000_sellers_orders.sql`; **no las vuelvas a ejecutar**. Aplica una sola vez [la corrección de reservas](migrations/20261123110000_sellers_order_returning_fix.sql) y [la actualización de datos del cliente](migrations/20261123120000_sellers_customer_fields.sql) en ese mismo proyecto de prueba. No ejecutes ninguna migración en producción.
2. Elige un usuario único en minúsculas (de 3 a 32 caracteres, como `vendedor01`). En SQL Editor, obtiene su identificador interno cambiando el ejemplo por el usuario elegido:

	```sql
	select encode(convert_to('vendedor01', 'UTF8'), 'hex') || '@belleza.invalid' as correo_interno;
	```

3. En **Authentication > Users**, elige **Add user > Create new user**, no la opción de enviar invitación. Ingresa el correo interno como email, asigna una contraseña individual y marca **Auto Confirm User**. El dominio interno no recibe correos. Copia el UID de la cuenta recién creada.
4. En SQL Editor, sustituye el UUID de ejemplo, el nombre y el usuario antes de ejecutar. Si ya hay un perfil con ese UID, revisa su rol antes de modificarlo; no reutilices una cuenta de inventario.

	```sql
	insert into public.profiles (id, full_name, role, is_active, username)
	values ('00000000-0000-0000-0000-000000000000'::uuid, 'Vendedor de prueba', 'vendedor', true, 'vendedor01');
	```

5. Configura la vista previa local para que apunte al Supabase de prueba (`NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`), habilita `SELLERS_PREVIEW_ENABLED=true` y reinicia el servidor. En `/vendedores/login`, escribe `vendedor01`, no el correo interno. Prueba búsqueda por SKU, fotos privadas, recuperación del carrito al recargar, creación idempotente y que una reserva reduzca las unidades disponibles durante 30 minutos. La reserva no descuenta stock físico.
6. Comprueba que esa cuenta no entra al panel de inventario y que un administrador de inventario no entra a Vendedores. En pruebas, desactiva el perfil en `public.profiles` y comprueba que la cuenta pierde el acceso; vuelve a activarlo solo cuando corresponda. Crea más cuentas únicamente después de verificar la primera.

### Crear vendedor02 a vendedor11

**Estado confirmado:** el usuario verificó en Supabase que `vendedor01`–`vendedor11` tienen `is_active = true`. No vuelvas a ejecutar el alta por lote para estas cuentas.

Usa solo el proyecto Supabase de prueba. En SQL Editor, genera los correos internos para las cuentas que vas a crear:

```sql
with usernames(username) as (
	values ('vendedor02'), ('vendedor03'), ('vendedor04'), ('vendedor05'), ('vendedor06'),
				 ('vendedor07'), ('vendedor08'), ('vendedor09'), ('vendedor10'), ('vendedor11')
)
select username, encode(convert_to(username, 'UTF8'), 'hex') || '@belleza.invalid' as correo_interno
from usernames
order by username;
```

En **Authentication > Users**, crea cada cuenta con **Add user > Create new user**, marca **Auto Confirm User** y asigna una contraseña individual. No uses invitación: los correos internos no reciben mensajes. Cuando las diez cuentas estén creadas, ejecuta [`setup/perfiles-vendedores.sql`](setup/perfiles-vendedores.sql) en SQL Editor. El script busca los UID por correo interno y aborta sin inserciones si falta alguna cuenta o ya hay un perfil asociado. Los perfiles quedan activos con rol `vendedor`; los nombres visibles iniciales son `Vendedor 02` a `Vendedor 11` y puedes cambiarlos por los nombres reales. No compartas ni guardes contraseñas en el repositorio.

Para mostrar la foto principal de inventario en Vendedores, ejecuta la migración de fotos indicada en el paso 1. No hace público el bucket ni otorga permisos de carga o borrado. Recarga el panel con la cuenta de vendedor y verifica una prenda activa con stock y foto de almacén; el catálogo público no debe mostrar esa foto. Los enlaces firmados caducan en cinco minutos.

La pestaña **Creadas** lista todas las órdenes del vendedor; **En proceso** muestra órdenes impagas con reserva vigente, y **Completadas** queda vacía hasta que un POS registre el pago. Las reservas vencidas se muestran como vencidas en Creadas y ya no bloquean disponibilidad. La migración no cobra, marca pagos, modifica el stock físico ni habilita el módulo en producción.

## POS de tienda: solo pruebas

Para registrar si el cliente fue atendido online o en tienda, revisa y ejecuta una sola vez [la migración de canal de atención](migrations/20261125120000_sellers_attention_channel.sql) en el proyecto de prueba donde ya están aplicadas las migraciones de órdenes y datos del cliente. No repitas esas migraciones. Las nuevas órdenes requieren una elección; las anteriores permanecen sin clasificar. El canal se conserva al editar/cobrar en caja y queda en el recibo guardado. Esto no importa órdenes del checkout público ni cambia el cálculo de precios o stock.

El usuario confirmó la ejecución de `20261125100000_pos_orders_payments.sql` sin errores. No repetirla. El fallo de consulta de caja se debe al alias `found`, que colisiona con la variable interna `FOUND` de PL/pgSQL. Aplicar una sola vez [la corrección de consultas](migrations/20261125110000_pos_query_alias_fix.sql) en el mismo proyecto de prueba y recargar caja. Solo reemplaza las consultas de órdenes y catálogo; no altera pedidos, pagos ni stock.

Para permitir que Caja elimine órdenes impagas con reserva vencida, revisa y ejecuta una sola vez [la migración de eliminación lógica](migrations/20261125130000_pos_order_deletion.sql) en ese mismo proyecto de prueba. No borra órdenes ni líneas: registra estado, usuario, rol y hora; ya no cuenta como pendiente ni reserva stock y se mantiene visible en Creadas del vendedor. Las reservas vigentes y órdenes pagadas no se pueden eliminar. No ejecutar en producción sin pruebas de permisos y concurrencia.

Para que Caja muestre el máximo que puede contener la orden —stock físico menos reservas activas de otras órdenes— y evite sumar unidades por encima de esa cantidad, revisa y ejecuta una sola vez [la migración de disponibilidad por orden](migrations/20261125200000_pos_order_available_stock.sql). El servidor vuelve a comprobar stock al recalcular y guardar. Al guardar cambios o completar el pago, una pestaña abierta de Vendedores actualiza Creadas/Completadas por evento y, como respaldo, cada cinco segundos. No vuelvas a ejecutar esta migración después de aplicarla.

1. Usa el proyecto de prueba donde Vendedores ya crea órdenes con cliente y promociones. No repitas las migraciones anteriores. Revisa y ejecuta una sola vez [la migración POS](migrations/20261125100000_pos_orders_payments.sql). Crea tablas de recibos, auditoría, revisión de órdenes y funciones de caja. El cierre sí descuenta stock físico: usa únicamente productos y pagos sintéticos.
2. Para crear `caja01`–`caja03` en pruebas, crea cada cuenta en **Authentication > Users > Add user > Create new user**, marca **Auto Confirm User** y asigna una contraseña individual. Usa estos correos internos: `63616a613031@belleza.invalid`, `63616a613032@belleza.invalid` y `63616a613033@belleza.invalid`. No uses invitación: esos correos no reciben mensajes. Cuando estén creadas las tres cuentas, ejecuta [`setup/perfiles-caja.sql`](setup/perfiles-caja.sql) en SQL Editor; busca los UID automáticamente y asigna perfil activo con `role = 'cajero'`. El script aborta si falta alguna cuenta o ya tiene perfil. No repitas el alta si ya aparece en `public.profiles`. No compartas contraseñas ni guardes UID en Git.
	**Estado confirmado por el usuario:** `caja01`, `caja02` y `caja03` fueron creados en Auth y el SQL de perfiles se ejecutó correctamente en Supabase de prueba. No repetir el alta.
3. Apunta el servidor local a ese proyecto y configura `POS_PREVIEW_ENABLED=true` solo en pruebas para permitir el login por `/pos/login`. Para probar el flujo completo desde Vendedores conserva también `SELLERS_PREVIEW_ENABLED=true`. Reinicia el servidor. Mantén ambos flags sin habilitar en producción. La migración revoca la edición antigua de inventario para impedir que se salte el control de stock; tras aplicarla, también debes probar Inventario con POS_PREVIEW_ENABLED=true, que usa la función nueva.
4. Crea una orden en Vendedores. En caja las órdenes se muestran en cuadrícula; pulsa **Cobrar** para abrir la subventana con número, cliente, cédula, asesor, cantidades y promociones. Las órdenes con reserva vencida aparecen inhabilitadas; **Habilitar orden** valida stock, recalcula precios y renueva la reserva por 30 minutos. Si faltan existencias no se habilita ni se cobra. Para añadir prendas usa **Buscar SKU** dentro de la subventana; no se carga el catálogo completo y los cambios de la orden se conservan durante la búsqueda. Cambia cantidades o modalidad y pulsa **Recalcular y guardar** antes de verificar el importe y cobrar.
5. Registra un método y el importe completo verificado. No hay pagos mixtos, cambio ni cobros parciales. Pago móvil, transferencia, tarjeta, Binance y Zinli requieren referencia; efectivo permite referencia opcional. La fecha admite días pasados, no futuros; el registro conserva además su fecha real. Marca la verificación del importe y cierra. La app no consulta bancos ni mueve fondos: el cajero es responsable de verificar el pago externo.
6. Comprueba que el stock físico se descontó, que la orden aparece Completada para el vendedor y que el recibo guardado se abre desde Recibos y puede imprimirse opcionalmente. El recibo conserva cliente, asesor, caja, líneas, precios, promoción aplicada, método, importe, referencia, fecha y comentarios; no es una factura fiscal. No permitimos editar una venta cerrada ni modificar un recibo.
7. Ante timeout del cierre, no aceptes otro pago: **Verificar cierre** reutiliza la clave de esta pestaña. Consulta Recibos si necesitas recargar. Si el pago externo ya ocurrió pero la reserva venció o cambió el importe, concilia manualmente antes de intentar cerrar de nuevo; la app no revierte pagos externos.
8. Antes de producción: probar dos cajas sobre la misma orden y la última unidad/bulto, expiración, corte de red, cambio de tasa/precio, reintento tras éxito y formularios de Inventario abiertos antes de la venta. Verificar RLS, funciones legadas y permisos de cajero/admin, vendedor y anónimo en Supabase real. Las pruebas locales usan PostgreSQL sintético, no validan los permisos ni el tráfico de tu instancia. El checkout público y sus reservas necesitan integración adicional antes de operar juntos.

## Panel administrativo de ventas: solo pruebas

El login administrativo propio está en `/administracion/login`; solo admite perfiles `admin` activos y su cierre de sesión regresa a esa ruta. El panel `/administracion` resume recibos POS completados por día, semana, mes o año. El filtro utiliza `pos_receipts.paid_on`; conserva por separado los pagos en divisas y bolívares, muestra el equivalente USD guardado en cada recibo, cuenta variantes como prendas sueltas y bultos por separado, y ordena vendedores y productos por equivalente USD. Es una consulta de solo lectura y no modifica recibos ni inventario.

Después de un cobro POS confirmado, el panel abierto actualiza sus datos mediante evento entre pestañas, refresco al recuperar el foco y consulta automática cada cinco segundos mientras permanece visible. No requiere cerrar sesión ni modificar Supabase.

El usuario confirmó que ejecutó [la migración del panel administrativo](migrations/20261125140000_admin_sales_dashboard.sql) en Supabase de prueba; no repetirla. La función SQL comprueba el rol admin en Supabase; no habilitar en producción sin validar permisos con la instancia real.

El panel acepta fechas según el periodo: **Diario** muestra una fecha; **Mensual**, un mes y rango dentro de ese mes; **Anual**, año, mes opcional o todos los meses y rango dentro de ese año. Al abrir el panel el filtro diario tiene hoy como fecha. La vista anual agrupa por mes y ya no existe el periodo semanal. Para activar el filtro y la agrupación correcta, ejecuta una sola vez [la migración correctiva de periodos](migrations/20261125190000_admin_sales_range_periods.sql). Si `20261125180000_admin_sales_date_range.sql` está pendiente, aplícala antes; si ya fue ejecutada, no la repitas. No vuelvas a ejecutar `20261125140000`.

La vista **Comisiones** en `/administracion/comisiones` permite elegir un rango Desde/Hasta y muestra ventas completadas pendientes por vendedor. El botón **Procesar comisión** registra el cálculo al 10% del total equivalente USD; el importe cobrado en bolívares usa el equivalente USD guardado en el recibo y los pagos en divisas se expresan en USD. Cada recibo solo puede vincularse una vez a una comisión, incluso si luego se selecciona un rango superpuesto. Tras procesar, sus ventas desaparecen de pendientes y quedan en `/administracion/comisiones/procesadas` con vendedor, fechas, cantidad de ventas, total USD, monto de comisión, administrador y fecha de proceso. Es un registro informativo: no ejecuta pagos ni modifica recibos.

No alteres migraciones anteriores. Revisa cuáles ya ejecutaste y aplica únicamente las pendientes en orden: [resumen semanal](migrations/20261125150000_admin_weekly_commissions.sql), [procesamiento e historial](migrations/20261125160000_admin_commission_processing.sql), y [tasa del 10%](migrations/20261125170000_admin_commission_rate_10.sql). Si las dos primeras ya fueron aplicadas, ejecuta solo la nueva `20261125170000`. La corrección actualiza los cálculos futuros; los lotes ya procesados conservan el porcentaje histórico guardado. No ejecutar en producción sin validar permisos y recuperación del historial.
