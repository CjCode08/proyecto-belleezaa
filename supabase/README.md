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

Para mostrar la foto principal de inventario en Vendedores, ejecuta la migración de fotos indicada en el paso 1. No hace público el bucket ni otorga permisos de carga o borrado. Recarga el panel con la cuenta de vendedor y verifica una prenda activa con stock y foto de almacén; el catálogo público no debe mostrar esa foto. Los enlaces firmados caducan en cinco minutos.

La pestaña **Creadas** lista todas las órdenes del vendedor; **En proceso** muestra órdenes impagas con reserva vigente, y **Completadas** queda vacía hasta que un POS registre el pago. Las reservas vencidas se muestran como vencidas en Creadas y ya no bloquean disponibilidad. La migración no cobra, marca pagos, modifica el stock físico ni habilita el módulo en producción.
