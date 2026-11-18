# Guía de Desarrollo - Proyecto Belleza

## Estado verificado 17/11/2026
- Se revisó el conjunto actual de cambios del proyecto y se validó la coherencia entre inventario, catálogo comercial y checkout preparado.
- Los ajustes principales incluyen: precios con bultos y promociones, SKU base/variantes, control de visibilidad del catálogo, tasas manuales y pruebas funcionales específicas.
- Catálogo e inventario comparten un selector persistente de tema claro/oscuro; las tarjetas muestran resumen en divisas y el detalle conserva ambas listas de precios.
- El catálogo comercial se activa al desplegar; `CATALOG_MAINTENANCE=true` lo pausa. Productos y promociones actuales son de prueba y no válidos para pedidos; conservar sus datos. El usuario confirmó la tasa del 17/11/2026 cargada. El checkout público continúa deshabilitado.

## 1. Stack Tecnológico y Directrices Generales
- **Stack obligatorio:** Next.js, Tailwind CSS, Supabase, Git y Visual Studio Code.
- **Base de datos:** La base de datos en Supabase ya está inicializada; **no recrearla** bajo ninguna circunstancia.
- **Documentación de Next.js:** Consulta siempre `node_modules/next/dist/docs/` antes de programar componentes o lógica de Next.js para evitar romper convenciones de esta versión.
- **Diseño UI/UX:** Interfaz limpia, minimalista, estilo rojo minimalista y enfoque *mobile-first* (prioridad en móvil y tablet). El control persistente claro/oscuro es global para catálogo e inventario; todo módulo futuro debe respetar `data-theme` y los tokens de `src/app/globals.css`. Los módulos de ventas y panel administrativo también deben optimizarse para móvil, tablet y PC.

## 2. Skills de Referencia UI/UX y Diseño Frontend
Al diseñar o refactorizar interfaces de usuario (componentes React, maquetación mobile-first con Tailwind CSS, tablas de inventario, formularios, catálogos y paneles de navegación), el agente debe consultar y aplicar de forma estricta las directrices de las siguientes skills:

- **UI/UX Pro Max:** Aplica su inteligencia de diseño (patrones visuales, tipografía, paletas coherentes, contraste accesible y componentes estándar para dashboards y e-commerce):
  - Referencia: https://www.skills.sh/nextlevelbuilder/ui-ux-pro-max-skill/ui-ux-pro-max
- **Web Interface Guidelines (Vercel):** Sigue las mejores prácticas oficiales de Vercel en accesibilidad (WCAG), jerarquía de contenido, espaciados consistentes y comportamiento interactivo:
  - Referencia: https://www.skills.sh/vercel-labs/agent-skills/web-design-guidelines
- **Frontend Design (Anthropic):** Adopta una dirección estética deliberada y con personalidad propia; rechaza esquemas de color predecibles, fuentes sobreutilizadas o layouts genéricos de IA:
  - Referencia: https://www.skills.sh/anthropics/skills/frontend-design
- **Web Design System & Art Direction:** Fundamenta las elecciones visuales en la identidad del producto mediante sistemas de tokens, jerarquía tipográfica, dirección de arte e impacto emocional:
  - Referencia: https://www.skills.sh/partnereconomist-sketch/web-desing/web-design

## 3. Desarrollo por Etapas (Orden Estricto)
El proyecto se ejecuta de forma secuencial. No desarrollar etapas futuras sin completar y verificar la actual:
1. **Sistema de inventarios** *(etapa completada y verificada)*
2. **E-commerce** *(etapa activa)*
3. **Interfaz para vendedores**
4. **Punto de ventas (POS)**
5. **Panel administrativo**
*Nota: Explicar siempre el plan en español y pedir verificación antes de iniciar una nueva etapa.*

## 4. Reglas Específicas: Inventario
- **Autenticación:** Login por username y contraseña. Roles: administrador, operador1 y operador2. Usar identificadores internos de Supabase Auth tipo `@belleza.invalid` (no correos reales).
- **Seguridad y Permisos:** 
  - RLS habilitado.
  - Administrador tiene control total (lectura global, edición, baja lógica, borrado y auditoría completa).
  - Operadores pueden crear, editar, inhabilitar y consultar únicamente sus propios movimientos de auditoría. No pueden eliminar.
  - Toda modificación en Supabase (SQL) debe presentarse primero al usuario para que sea él quien la ejecute.
- **Gestión de Catálogo y Variantes:**
  - El inventario y catálogo comercial usan precios por listas, promociones, variantes y bultos; el catálogo se activa en producción por defecto y se pausa con `CATALOG_MAINTENANCE=true`.
  - Estados visuales fijos: activo (verde), inhabilitado (rojo), reabastecer (amarillo, si aplica); no cambiar estados automáticamente.
  - Carga de imágenes privada al bucket `inventario-privado` (JPEG/PNG/WebP ≤4 MB, máximo 5 imágenes).
- **Auditoría obligatoria:** Registrar toda creación, edición, inhabilitación y eliminación detallando usuario, fecha y comentario.
- **Catálogo:** búsqueda de productos por nombre, categoría o SKU de variante, con paginación.
- Panel de inventario en `/inventario/panel`; `/` redirige allí por compatibilidad, salvo en `www.belleezaa.com` y `belleezaa.com`, donde redirige al catálogo. El proxy excluye solo esas raíces de la comprobación de login.
- Productos: clasificación múltiple por hombres, mujeres, niños y niñas; categorías persistentes. Las tallas se guardan en mayúsculas y los colores con inicial mayúscula.
- Al crear o editar productos, nombre, categoría nueva, descripción y comentario llevan inicial mayúscula; SKU opcional en mayúsculas con letras, números y guiones.
- Variantes agrupadas por talla con color, existencias y SKU generado desde base, talla y abreviatura editable. Guardar sin base borra solo los SKU del producto, previa confirmación.
- Formularios y listado registran por bolívares y divisas precio unitario, una promoción por unidad con descripción opcional y precio total del bulto de 12. La promoción es por grupos de 2, 3 o 4 unidades por producto en ambas listas; el carrito y servidor calculan y validan pedidos. El catálogo muestra la descripción si existe precio promocional. El surtido y stock de bultos se guardan aparte. Los precios anteriores son referencias para revisión sin cantidad promocional inferida; el mayorista anterior no se convierte en precio de bulto. No eliminar productos de prueba automáticamente.
- La tarjeta del inventario suma las existencias de variantes como unidades sueltas disponibles, sin incluir bultos, y aclara las etiquetas de precios; pendiente de verificar en la web.
- Si falla el guardado, el formulario de producto conserva sus datos; los errores distinguen conexión, sesión y permisos para poder reintentar sin perder el borrador.
- El usuario ejecutó `supabase/migrations/20261113190000_inventory_pricing_bundles_sku.sql` en Supabase y verificó tablas, funciones y referencias de precios; no volver a ejecutarla. Despliegue realizado; usuario confirmó creación de un producto de prueba y edición de existencias. Avanzó sin respaldo ni copia de pruebas; antes se probó en base sintética.
- Visibilidad de catálogo independiente del estado de inventario: solo admin la cambia con comentario auditado; productos existentes conservan permiso y nuevos quedan ocultos. Solo se listan si también están activos y tienen stock. El usuario ejecutó `supabase/migrations/20261113200000_inventory_catalog_visibility.sql` y verificó columna, función y trigger; no volver a ejecutarla. En producción confirmó habilitar y ocultar un producto de prueba. Filtra lecturas públicas e imágenes y solicitudes de prueba nuevas; URL ya firmadas duran hasta expirar. Reintentos guardados se conservan.
- Vista previa local autenticada en `/inventario/vista-previa`: permite revisar el formulario sin consultar tablas nuevas ni guardar datos o imágenes; no está disponible en producción ni prueba el guardado real.
- Valor total de inventario oculto temporalmente mientras se define cómo valorar los productos con dos listas y bultos.

## 5. Requisitos Futuros (Planificación)
- **E-commerce:** Pedido pendiente en Supabase antes de abrir WhatsApp; entrega/envío se acuerda con vendedor y no se incluye en el total. No descontar stock hasta POS.
- Datos de entrega y envío nacional se solicitan en el formulario y se guardan con el pedido; pickup sin dirección.
- **E-commerce:** Delivery, envío nacional, pickup; pago en Bolívares o Binance, efectivo solo en retiro. Multimoneda USD/VES.
- Vista pública anterior `/catalogo` conectada mediante SQL `supabase/migrations/20261109140000_public_catalog_read.sql`; permanece en mantenimiento durante la transición comercial.
- Catálogo desplegado en Netlify: `belleezaa.com` redirige al dominio principal `www.belleezaa.com`, cuya raíz abre el catálogo. El usuario confirmó acceso y cierre de sesión en `inventario.belleezaa.com` tras recargar después del despliegue.
- Catálogo comercial listo para despliegue: se activa por defecto en producción y se pausa con `CATALOG_MAINTENANCE=true`; esto no activa el checkout. El usuario confirmó la tasa del 17/11/2026 cargada. Mantener sin cambios las promociones actuales porque corresponden a productos de prueba y todavía no son válidas para pedidos.
- Catálogo comercial: ficha con imágenes, listas por forma de pago, promociones, variantes y bultos. SQL `supabase/migrations/20261117100000_catalog_commercial_read.sql` ejecutado por el usuario; consulta anónima verificada.
- Catálogo visual inspirado en `resources/DESIGN.md` y referencias móvil/escritorio; usa datos reales y no muestra promociones o funciones ficticias.
- Carrito comercial local en panel lateral: estima precios por pago, promociones agrupadas y bultos separados; la solicitud siempre se recalcula en el servidor.
- Formulario: por defecto no guarda ni envía; efectivo solo en retiro. Modo de prueba local requiere configuración explícita. Despliegue previsto en Netlify; proteger el registro público antes de habilitar pedidos.
- Checkout comercial conectado localmente; el usuario ejecutó `20261117110000_checkout_commercial_requests.sql` y se verificó rechazo anónimo y acceso de servicio con petición inválida. Prueba local y producción se activan explícitamente por separado; pendientes prueba integral y recuperación. El endpoint de prueba antiguo permanece bloqueado por usar precios anteriores.
- Los reintentos conservan la solicitud y su clave en `sessionStorage` de la pestaña; tras guardar se abre WhatsApp en otra pestaña sin cerrar el catálogo, se retiran del carrito las variantes cuya cantidad no cambió y se limpian los avisos de productos agregados. Si se bloquea la pestaña, se conserva el carrito y se puede reabrir el mensaje. El cliente debe pulsar enviar en WhatsApp; abrirlo no confirma el envío.
- Si falla Turnstile, el catálogo permanece disponible y el formulario muestra el error; la clave pública local debe configurarse sin corchetes.
- Turnstile se monta solo al abrir el carrito y se reinicia al cerrarlo. El límite compartido respondió y rechazó un token inválido; el usuario confirmó que la verificación funciona en su navegador.
- El mensaje comercial incluye SKU por variante o «Sin SKU», unidades promocionales y bultos con surtido; distingue pruebas de solicitudes reales. El SQL `supabase/migrations/20261111140000_checkout_test_sku.sql` conserva el SKU del flujo anterior.
- Protección acordada: límite compartido de 30 intentos por 60 segundos en Supabase más 5 por IP y dominio en 60 segundos en Netlify. En la ruta pública `/api/checkout`, 24 solicitudes inválidas produjeron 12 respuestas 404 y 12 respuestas 429; la ruta con barra también respondió 429. La ruta comercial aún no está desplegada; verificar el log y repetir la prueba tras el despliegue. Netlify puede tardar hasta 10 segundos en aplicar el bloqueo.
- SQL para solicitudes de prueba: `supabase/migrations/20261111120000_checkout_test_requests.sql` ejecutado; usuario verificó RLS y ejecución limitada a `service_role`. No habilita el checkout por sí solo.
- SQL antiguo de solicitudes reales `supabase/migrations/20261111150000_checkout_production_requests.sql` no ejecutado y no compatible con precios nuevos; no aplicarlo. La nueva tabla `checkout_commercial_items` conserva snapshots y requiere integración futura con POS. Mantener checkout público deshabilitado hasta validar extremo a extremo y límites en Netlify.
- El carrito se guarda como solicitud pendiente antes de abrir WhatsApp; el vendedor arma la orden, la envía al cliente para revisión y comparte los datos de pago. No pedir confirmación en el catálogo por cambios de precio o tasa: el vendedor los aclara por WhatsApp.
- Catálogo comercial: visor con URL renovada; tarjeta muestra precio unitario y precio del bulto. Las promociones se aplican por grupos configurados y los bultos tienen existencias separadas.
- Catálogo: selector muestra unidades disponibles por variante; SQL `supabase/migrations/20261111100000_catalog_variant_stock.sql` ejecutado. Disponibilidad sujeta a confirmación.
- Catálogo: filtros combinables por tipo de prenda y categoría, laterales en escritorio y desplegables en móvil, con búsqueda y paginación; SQL `supabase/migrations/20261111110000_catalog_filters.sql` ejecutado.
- Delivery limitado a Carabobo; envío nacional a todos los estados. Estado, municipio y dirección obligatorios; delivery gratis en San Diego, Naguanagua y Valencia si supera $10. Validación y persistencia comercial preparadas localmente; falta prueba integral real.
- Conversión pública a Bs. usa solo tasa del día; usuario ejecutó `supabase/migrations/20261109160000_catalog_current_rate.sql` y se verificó la consulta anónima.
- Imágenes de catálogo: solo admin gestiona; SQL `supabase/migrations/20261109150000_catalog_images.sql` ejecutado; usuario confirmó carga y vista; operaciones anónimas rechazadas.
- **Tasa USD/VES:** ingreso manual exclusivo del administrador desde el panel, con fecha e histórico; normalmente se carga el día anterior y se mantiene durante su fecha. Solo usar tasa de hoy (Caracas); si falta, alertar y bloquear pedidos. Permitir tasas futuras; si cambia, el vendedor lo comunica por WhatsApp.
- Usuario ejecutó SQL de fecha e histórico `supabase/migrations/20261109120000_exchange_rate_dates_history.sql`; panel de tasa muestra formulario e histórico simplificado. Auditoría permanece en la BD.
- Gestión de tasas con fecha única, edición, eliminación y auditoría: SQL `supabase/migrations/20261109130000_exchange_rate_manage.sql` ejecutado; usuario confirmó pruebas y acceso anónimo rechazado.
- **Vendedores:** Carrito asistido, trazabilidad de pedidos por vendedor y multimoneda (USD/VES).
- **POS:** Cierre de pedidos online/tienda y descuento automático de inventario.
- **Panel Administrativo:** Métricas de ventas por periodo, comisiones, top de vendedores y productos, y stock tipo semáforo.
- **Imágenes:** Fotos de inventario privadas; imágenes de catálogo mejoradas externamente, cargadas por separado y optimizadas por el sistema. Nunca usar fotos privadas como sustitutas.

## 6. Restricciones Operativas para Copilot
- Mantener los cambios pequeños, limpios, trazables y validados.
- Asegurarse de verificar que el código pase el compilador (Build) y las pruebas asociadas antes de finalizar cualquier tarea.
```[cite: 1, 2]

Simpre leer este archivo, antes de empezar a desarrollar y actualiza su contenido según los cambios realizados en el proyecto de manera simple, breve y ordenada para no perder información ni generar inconsistencias.