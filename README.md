This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Preparación del checkout para Netlify

El catálogo comercial se activa al desplegar en producción. Para ponerlo en mantenimiento, configurar `CATALOG_MAINTENANCE=true` en Netlify. Los productos y promociones actuales son datos de prueba y no son válidos para pedidos; conservarlos sin cambios hasta su validación. El usuario confirmó que la tasa del 17/11/2026 ya está cargada. El checkout real sigue apagado salvo configuración explícita y validación integral de Turnstile, límites y reintentos. El inventario conserva su acceso habitual.

La vista `/inventario/vista-previa/catalogo` está disponible solo en desarrollo y requiere sesión de inventario. Usa productos reales visibles, precios revisados y un carrito separado; no guarda pedidos. La galería de bultos sin variantes depende de la nueva migración pública.

Migraciones comerciales ejecutadas por el usuario en Supabase y probadas previamente en PostgreSQL aislado:

1. `supabase/migrations/20261117100000_catalog_commercial_read.sql`: publica mediante funciones los datos comerciales de productos activos, visibles y disponibles, incluidos bultos y precios revisados. Las fotos privadas siguen protegidas. La API será consultable públicamente aunque la web muestre mantenimiento.
2. `supabase/migrations/20261117110000_checkout_commercial_requests.sql`: crea líneas históricas separadas para solicitudes comerciales y una función limitada a `service_role`; calcula los precios y comprueba existencias sin descontarlas. No activa el checkout por sí sola. La futura interfaz POS deberá integrar `checkout_commercial_items`.

No volver a ejecutar estas migraciones. No ejecutar el SQL antiguo `20261111150000_checkout_production_requests.sql`: utiliza reglas de precios anteriores.

El catálogo en Netlify requiere `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`. El checkout comercial de prueba requiere `CHECKOUT_TEST_ENABLED=true`, `CHECKOUT_TEST_ORIGIN` con el origen exacto de localhost, las claves locales de Supabase y Turnstile y `WHATSAPP_NUMBER`; no habilitarlo en producción. La ruta real permanece apagada salvo configuración explícita de `CHECKOUT_PRODUCTION_ENABLED=true`, `CHECKOUT_PRODUCTION_ORIGIN=https://www.belleezaa.com` y `CATALOG_MAINTENANCE=false`; antes deben verificarse Turnstile, el límite de Netlify y los reintentos en el despliegue. Nunca pegar claves secretas en el chat ni subirlas a Git.

## Transición del inventario comercial

El inventario integra SKU base, variantes agrupadas por talla y dos listas de precios. Cada lista registra precio unitario, una promoción por unidad con descripción opcional y precio del bulto cerrado de 12; el surtido y stock de bultos se registran aparte. Para cada promoción se seleccionan 2, 3 o 4 unidades por producto, tanto en bolívares como en divisas. El catálogo local muestra la descripción y el carrito calcula promociones por grupos; el servidor vuelve a calcular el pedido. Los precios anteriores se copian como referencia y deben revisarse; sus cantidades no se inventan y el mayorista anterior no se convierte automáticamente a precio de bulto. Sin SKU base, guardar elimina los SKU de las variantes del producto, previa confirmación. El valor total del inventario permanece oculto.

El usuario ejecutó en Supabase `supabase/migrations/20261113190000_inventory_pricing_bundles_sku.sql` y confirmó que existen las nuevas tablas y funciones y las dos referencias de precios por producto. La aplicación nueva fue desplegada y el usuario confirmó que pudo crear un producto de prueba y editar sus existencias. No volver a ejecutar el SQL. El usuario decidió avanzar sin respaldo ni copia de pruebas; las pruebas funcionales anteriores se hicieron en una base sintética.

La migración `supabase/migrations/20261113200000_inventory_catalog_visibility.sql` también fue ejecutada por el usuario, que confirmó la columna, el control y el trigger. No volver a ejecutarla. Agrega un control de catálogo separado del estado de inventario: solo el administrador puede cambiarlo con comentario auditado; los productos existentes conservan su configuración visible y los nuevos comienzan ocultos. Habilitarlo no garantiza su aparición: también se exige que el producto esté activo y tenga disponibilidad. Las consultas públicas de productos, categorías e imágenes y las nuevas solicitudes de prueba respetan esta configuración; las URL de imágenes ya firmadas pueden funcionar hasta que expiren. Los reintentos de solicitudes guardadas se conservan.

El usuario confirmó en producción que pudo habilitar y volver a ocultar un producto de prueba. El endpoint de prueba antiguo está bloqueado por usar precios anteriores. El checkout comercial nuevo necesita las migraciones y pruebas indicadas arriba antes de usarse.

En desarrollo, con sesión de inventario iniciada, `/inventario/vista-previa` permite revisar el formulario sin consultar las nuevas tablas ni guardar datos o imágenes. Las categorías reales no se cargan en esta vista; no valida el guardado ni sustituye las pruebas con una base separada. No está disponible en producción.

El checkout comercial está preparado localmente, pero **no está habilitado ni probado de extremo a extremo**. Las rutas antiguas de prueba siguen bloqueadas para evitar precios obsoletos.

La función `netlify/edge-functions/checkout-rate-limit.js` prepara un límite de 5 solicitudes por 60 segundos por IP y dominio para la futura ruta `/api/checkout` (y su variante con barra final). La ruta real aún no existe y esta protección todavía no se ha probado en Netlify. Las personas que compartan una IP comparten el límite. Netlify advierte que puede tardar hasta 10 segundos en bloquear solicitudes; este límite complementa, pero no sustituye, el límite compartido de Supabase y Turnstile.

El generador de mensajes distingue explícitamente solicitudes de prueba y reales; por defecto solo acepta pruebas. Esto no crea pedidos reales ni habilita el checkout.

Antes de habilitar pedidos reales:

1. Crear el sitio en Netlify conectando el repositorio y comprobar el catálogo desplegado, sin activar el checkout.
2. Autorizar el dominio definitivo en el widget de Turnstile y configurar las variables de entorno necesarias en Netlify, sin publicar claves secretas ni colocarlas en variables `NEXT_PUBLIC_`.
3. Las dos migraciones comerciales indicadas arriba ya fueron ejecutadas y sus permisos básicos verificados. Solo el usuario puede ejecutar SQL en Supabase; no recrear la base de datos.
4. Probar la ruta `/api/checkout` preparada con activación deshabilitada por defecto, validación de origen y Turnstile, precios y stock calculados en servidor, idempotencia y protección contra abuso.
5. Comprobar en el despliegue que el límite por IP se aplica a la ruta real, incluyendo su barra final y la interacción con el adaptador de Next.js. Verificar los reintentos sin duplicados, los fallos de red y la apertura de WhatsApp, usando solicitudes identificadas de prueba.
6. Activar pedidos reales únicamente después de verificar estas protecciones y acordar la activación.

Referencias: [límites de Netlify](https://docs.netlify.com/manage/security/secure-access-to-sites/rate-limiting/), [Next.js en Netlify](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/) y [hostnames de Turnstile](https://developers.cloudflare.com/turnstile/additional-configuration/hostname-management/).

## Dominios previstos

La raíz de `www.belleezaa.com` y `belleezaa.com` redirige a `/catalogo`. La raíz de `inventario.belleezaa.com` redirige al panel de inventario, que conserva su login y permisos. En localhost y en el dominio de Netlify se conserva la redirección anterior al inventario; el catálogo sigue disponible en `/catalogo`.

Los dominios deben asignarse en Netlify y configurarse en Cloudflare antes de probarlos. La separación de direcciones no sustituye la autenticación y RLS: las rutas internas siguen existiendo en el mismo despliegue.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
