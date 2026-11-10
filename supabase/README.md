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
