# Guía de Desarrollo - Proyecto Belleza

## 1. Stack Tecnológico y Directrices Generales
- **Stack obligatorio:** Next.js, Tailwind CSS, Supabase, Git y Visual Studio Code.
- **Base de datos:** La base de datos en Supabase ya está inicializada; **no recrearla** bajo ninguna circunstancia.
- **Documentación de Next.js:** Consulta siempre `node_modules/next/dist/docs/` antes de programar componentes o lógica de Next.js para evitar romper convenciones de esta versión.
- **Diseño UI/UX:** Interfaz limpia, minimalista, estilo rojo minimalista y enfoque *mobile-first* (prioridad en móvil y tablet). Los modulos punto de ventas y panel administrativos tambien deben ir optimizados para móvil, tablet y Pc's.

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
  - Control de precios por reglas: unitario, precio promo de 3 a 11, y precio mayorista a partir de 12 unidades.
  - Estados visuales fijos: activo (verde), inhabilitado (rojo), reabastecer (amarillo, si aplica); no cambiar estados automáticamente.
  - Carga de imágenes privada al bucket `inventario-privado` (JPEG/PNG/WebP ≤4 MB, máximo 5 imágenes).
- **Auditoría obligatoria:** Registrar toda creación, edición, inhabilitación y eliminación detallando usuario, fecha y comentario.
- **Catálogo:** búsqueda de productos por nombre, categoría o SKU de variante, con paginación.
- Panel de inventario en `/inventario/panel`; `/` redirige allí por compatibilidad.
- Productos: clasificación múltiple por hombres, mujeres, niños y niñas; categorías persistentes. Las tallas se guardan en mayúsculas y los colores con inicial mayúscula.
- Al crear o editar productos, nombre, categoría nueva, descripción y comentario llevan inicial mayúscula; SKU opcional en mayúsculas con letras, números y guiones.

## 5. Requisitos Futuros (Planificación)
- **E-commerce:** Pedido pendiente en Supabase antes de abrir WhatsApp; entrega/envío se acuerda con vendedor y no se incluye en el total. No descontar stock hasta POS.
- Datos de entrega y envío nacional se solicitan en el formulario y se guardan con el pedido; pickup sin dirección.
- **E-commerce:** Delivery, envío nacional, pickup; pago en Bolívares o Binance, efectivo solo en retiro. Multimoneda USD/VES.
- Vista previa pública `/catalogo` conectada mediante SQL `supabase/migrations/20261109140000_public_catalog_read.sql`; compras aún no implementadas.
- Catálogo visual inspirado en `resources/DESIGN.md` y referencias móvil/escritorio; usa datos reales y no muestra promociones o funciones ficticias.
- Carrito preliminar local en panel lateral con fondo difuminado: precios estimados por producto y variantes; aún no envía pedidos ni sustituye la validación del servidor.
- Vista previa del formulario: datos no se guardan ni envían; efectivo solo en retiro. Despliegue previsto en Netlify; proteger el registro público antes de habilitar pedidos.
- Catálogo: visor de imágenes de catálogo con URL renovada; en tarjeta solo precio unitario y mayorista. La promoción de 3 a 11 sigue aplicándose al carrito.
- Delivery limitado a Carabobo; envío nacional a todos los estados. Estado, municipio y dirección obligatorios; delivery gratis en San Diego, Naguanagua y Valencia si supera $10. Validación segura y persistencia pendientes.
- Conversión pública a Bs. usa solo tasa del día; usuario ejecutó `supabase/migrations/20261109160000_catalog_current_rate.sql` y se verificó la consulta anónima.
- Imágenes de catálogo: solo admin gestiona; SQL `supabase/migrations/20261109150000_catalog_images.sql` ejecutado; usuario confirmó carga y vista; operaciones anónimas rechazadas.
- **Tasa USD/VES:** ingreso manual exclusivo del administrador desde el panel, con fecha e histórico; solo usar tasa de hoy (Caracas). Si falta, alertar y bloquear pedidos; permitir tasas futuras.
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