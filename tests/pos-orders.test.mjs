import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { PGlite } from "@electric-sql/pglite";
import { posMethods, posMoney, posReadError, posReservationExpired, posTender, validPosPayment } from "../src/lib/pos/order.ts";
import * as posOrder from "../src/lib/pos/order.ts";
import * as commercial from "../src/lib/catalog/commercial.ts";
import { filterPosSku } from "../src/lib/pos/catalog.ts";
import { attentionChannelLabel, isAttentionChannel } from "../src/lib/sellers/attention-channel.ts";
import { parsePosFilters } from "../src/lib/pos/filters.ts";

const cashier = "00000000-0000-4000-8000-000000000001";
const seller = "00000000-0000-4000-8000-000000000002";
const secondSeller = "00000000-0000-4000-8000-000000000009";
const sellerWithoutSales = "00000000-0000-4000-8000-000000000011";
const admin = "00000000-0000-4000-8000-000000000008";
const product = "00000000-0000-4000-8000-000000000003";
const variant = "00000000-0000-4000-8000-000000000004";
const bundle = "00000000-0000-4000-8000-000000000005";
const order = "00000000-0000-4000-8000-000000000006";
const key = "00000000-0000-4000-8000-000000000007";
const items = [{ kind: "variant", id: variant, quantity: 3 }, { kind: "bundle", id: bundle, quantity: 1 }];

test("total POS en bolivares usa Bs. sin perder centimos", () => {
  assert.equal(posMoney(122,"bolivares"),"Bs. 122");
  assert.equal(posMoney(122.5,"bolivares"),"Bs. 122,50");
  assert.equal(posMoney(1234.56,"bolivares"),"Bs. 1.234,56");
  assert.equal(posMoney(0,"bolivares"),"Bs. 0");
  assert.equal(posMoney(122),new Intl.NumberFormat("es-VE",{style:"currency",currency:"USD"}).format(122));
});

test("Caja permite cargar órdenes manualmente sin quitar el refresco automático", async () => {
  const refresh = await readFile(new URL("../src/app/pos/refresh-orders.tsx", import.meta.url), "utf8");
  const page = await readFile(new URL("../src/app/pos/page.tsx", import.meta.url), "utf8");
  assert.match(refresh, /onClick=\{\(\) => startTransition\(\(\) => router\.refresh\(\)\)\}/);
  assert.match(refresh, /Cargar órdenes/);
  assert.match(refresh, /belleza:pos-orders-updated/);
  assert.match(refresh, /setInterval\(refreshIfVisible, 5000\)/);
  assert.match(refresh, /addEventListener\("focus", refreshIfVisible\)/);
  assert.match(refresh, /addEventListener\("visibilitychange", refreshIfVisible\)/);
  assert.match(page, /\{!orderId && <RefreshPosOrders \/>\}/);
});

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select current_setting('test.actor',true)::uuid $$;
    create table profiles(id uuid primary key, role text, is_active boolean, full_name text, username text);
    create table products(id uuid primary key, name text, description text, category text, status text);
    create table product_variants(id uuid primary key, product_id uuid, size text, color text, sku text, stock integer check(stock >= 0));
    create table inventory_bundles(id uuid primary key, product_id uuid, assortment_description text, stock integer check(stock >= 0));
    create table inventory_product_prices(product_id uuid, payment_category text, unit_price_usd numeric, promotion_price_usd numeric,
      promotion_quantity integer, promotion_description text, bundle_price_usd numeric, needs_review boolean);
    create table exchange_rates(id integer, currency_from text, currency_to text, created_by uuid, effective_date date, updated_at timestamptz, rate numeric);
    create table inventory_movements(product_id uuid, variant_id uuid, user_id uuid, action_type text, quantity_change integer,
      comment text, product_snapshot text, variant_snapshot text);
    create function public.inventory_update_product_commercial(uuid,text,text,text,text[],jsonb,text[],uuid[],text,jsonb,jsonb,text)
      returns text[] language sql as $$ select array[]::text[] $$;
    insert into profiles values ('${cashier}','cajero',true,'Caja de prueba','caja01'),('${seller}','vendedor',true,'Asesor de prueba','vendedor01'),
      ('${secondSeller}','vendedor',true,'Vendedora Dos','vendedor02'),('${sellerWithoutSales}','vendedor',true,'Vendedor Sin Ventas','vendedor03'),
      ('${admin}','admin',true,'Administradora de prueba','admin');
    insert into products values('${product}','Franela',null,'Franela','activo');
    insert into product_variants values('${variant}','${product}','M','Rojo','F-M-R',5);
    insert into inventory_bundles values('${bundle}','${product}','Surtido 12',2);
    insert into inventory_product_prices values('${product}','divisas',10,8,3,'Tres por 24',90,false),('${product}','bolivares',12,9,3,'Tres por 27',100,false);
    insert into exchange_rates values(1,'USD','VES','${cashier}',(now() at time zone 'America/Caracas')::date,now(),40);
  `);
  for (const name of ["20261123100000_sellers_orders.sql", "20261123120000_sellers_customer_fields.sql", "20261125100000_pos_orders_payments.sql", "20261125110000_pos_query_alias_fix.sql", "20261125120000_sellers_attention_channel.sql", "20261125130000_pos_order_deletion.sql", "20261125140000_admin_sales_dashboard.sql", "20261125150000_admin_weekly_commissions.sql", "20261125160000_admin_commission_processing.sql", "20261125170000_admin_commission_rate_10.sql", "20261125180000_admin_sales_date_range.sql", "20261125190000_admin_sales_range_periods.sql", "20261125200000_pos_order_available_stock.sql", "20261126100000_pos_transactions.sql"]) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8"));
  }
  await db.exec(`set test.actor = '${cashier}'; insert into seller_orders(id,seller_id,payment_method,total_usd,idempotency_key,request_hash,expires_at,customer_name,customer_id)
    values('${order}','${seller}','efectivo',0,'${key}',sha256('seed'::bytea),now()+interval '30 minutes','Cliente Prueba','12345678');`);
  return db;
}

async function save(db, revision, currency = "divisas", lines = items) {
  return (await db.query("select public.pos_save_order($1,$2,$3,$4) as data", [order, revision, currency, JSON.stringify(lines)])).rows[0].data;
}
async function close(db, revision, currency, method, reference, amount, paymentKey = key) {
  return (await db.query("select public.pos_close_order($1,$2,$3,$4,$5,$6,(now() at time zone 'America/Caracas')::date - 1,'Prueba',$7) as data",
    [order, revision, paymentKey, currency, method, reference, amount])).rows[0].data;
}

test("el listado POS autenticado recibe ordenes de vendedores y separa pendientes de recibos", async () => {
  const db = await fixture();
  try {
    await db.exec("set role authenticated");
    const catalog = (await db.query("select public.pos_catalog_products('',0) as data")).rows[0].data;
    assert.equal(catalog[0].name,"Franela");
    assert.equal(catalog[0].variants[0].sku,"F-M-R");
    const list = async completed => (await db.query("select public.pos_list_orders($1,'',0) as data",[completed])).rows[0].data;
    const pending = await list(false);
    assert.equal(pending[0].id,order);
    assert.equal(pending[0].advisor_name,"Asesor de prueba");
    assert.equal((await list(true)).length,0);
    await save(db,1);
    await close(db,2,"divisas","efectivo","",114);
    assert.equal((await list(false)).length,0);
    assert.equal((await list(true))[0].id,order);
  } finally { await db.close(); }
});

test("POS edita, recalcula por modalidad, exige referencia y cierra una sola vez", async () => {
  const db = await fixture();
  try {
    let current = await save(db, 1);
    assert.equal(current.total_usd, 114);
    assert.equal(current.items.find(item => item.kind === "variant").promotion_units, 3);
    assert.equal(current.advisor_name, "Asesor de prueba");
    assert.equal(current.customer_name, "Cliente Prueba");
    await assert.rejects(save(db, 1), /Otra caja modifico/);
    current = await save(db, 2, "bolivares");
    assert.equal(current.total_usd, 127);
    assert.equal(current.total_ves, 5080);
    await assert.rejects(close(db, 3, "bolivares", "pago_movil", "", 5080), /referencia es obligatoria/);
    await assert.rejects(close(db, 3, "bolivares", "binance", "123", 5080), /incompatible/);
    await assert.rejects(close(db, 3, "bolivares", "pago_movil", "123", 5079), /importe recibido/);
    const paid = await close(db, 3, "bolivares", "pago_movil", "123", 5080);
    assert.equal(paid.status, "completada");
    assert.equal(paid.receipt.payment.reference, "123");
    assert.equal(paid.receipt.payment.amount, 5080);
    assert.equal(paid.receipt.cashier_name, "Caja de prueba");
    assert.equal((await db.query("select stock from product_variants")).rows[0].stock, 2);
    assert.equal((await db.query("select stock from inventory_bundles")).rows[0].stock, 1);
    assert.equal((await close(db, 3, "bolivares", "pago_movil", "123", 5080)).receipt.id, paid.receipt.id);
    await assert.rejects(close(db, 3, "bolivares", "pago_movil", "123", 5080, variant), /ya cobrada/);
    assert.equal((await db.query("select count(*)::int as count from pos_stock_movements")).rows[0].count, 2);
    assert.equal((await db.query("select count(*)::int as count from inventory_movements")).rows[0].count, 2);
  } finally { await db.close(); }
});

test("POS protege roles, reservas, tasa cambiante y revierte cobro si falla la auditoria", async () => {
  const db = await fixture();
  try {
    await db.exec(`set test.actor = '${seller}'`);
    await assert.rejects(save(db, 1), /Acceso de caja/);
    await db.exec(`set test.actor = '${cashier}'`);
    await assert.rejects(save(db, 1, "divisas", [{ kind: "variant", id: variant, quantity: 6 }]), /Disponibilidad insuficiente/);
    await save(db, 1, "bolivares");
    await db.exec("update exchange_rates set rate = 41");
    await assert.rejects(close(db, 2, "bolivares", "efectivo", "", 5080), /tasa cambiaron/);
    await save(db, 2, "divisas");
    await db.exec("update seller_orders set expires_at = now()-interval '1 minute'");
    await assert.rejects(close(db, 3, "divisas", "efectivo", "", 114), /Reserva vencida/);
    await save(db, 3);
    await db.exec("alter table inventory_movements add constraint force_failure check(quantity_change > 0)");
    await assert.rejects(close(db, 4, "divisas", "efectivo", "", 114), /force_failure/);
    assert.equal((await db.query("select stock from product_variants")).rows[0].stock, 5);
    assert.equal((await db.query("select count(*)::int as count from pos_receipts")).rows[0].count, 0);
    assert.equal((await db.query("select status from seller_orders")).rows[0].status, "en_proceso");
  } finally { await db.close(); }
});

test("validacion de pagos admite fechas anteriores y no admite fechas imposibles o futuras", () => {
  const payment = { currency:"divisas",method:"efectivo",reference:"",paidOn:"2026-11-20",comment:"",amount:10 };
  assert.equal(validPosPayment(payment,"2026-11-25"),true);
  assert.equal(validPosPayment({...payment,receivedAmount:9.99},"2026-11-25"),false);
  assert.equal(validPosPayment({...payment,receivedAmount:10},"2026-11-25"),true);
  assert.equal(validPosPayment({...payment,receivedAmount:10.01},"2026-11-25"),true);
  assert.equal(validPosPayment({...payment,receivedAmount:10.001},"2026-11-25"),false);
  assert.equal(validPosPayment({...payment,method:"binance",reference:"123",receivedAmount:10.01},"2026-11-25"),false);
  assert.equal(validPosPayment({...payment,method:"binance",reference:"123",receivedAmount:10.01,excessConfirmed:true},"2026-11-25"),false);
  assert.equal(validPosPayment({...payment,method:"binance",reference:"123",receivedAmount:10.01,comment:"Pago adicional"},"2026-11-25"),false);
  assert.equal(validPosPayment({...payment,method:"binance",reference:"123",receivedAmount:10.01,comment:"Pago adicional",excessConfirmed:true},"2026-11-25"),true);
  assert.equal(validPosPayment({...payment,method:"binance",reference:"123",receivedAmount:10},"2026-11-25"),true);
  for (const paidOn of ["2026-11-26","2026-02-30","2026-99-99",""]) assert.equal(validPosPayment({...payment,paidOn},"2026-11-25"),false);
  for (const method of ["binance","zinli"]) {
    assert.equal(validPosPayment({...payment,method},"2026-11-25"),false);
    assert.equal(validPosPayment({...payment,method,reference:"123"},"2026-11-25"),true);
  }
});

test("una segunda orden no puede consumir unidades reservadas por la primera", async () => {
  const db = await fixture();
  try {
    await save(db,1,"divisas",[{kind:"variant",id:variant,quantity:5}]);
    const second = "00000000-0000-4000-8000-000000000009";
    await db.exec(`insert into seller_orders(id,seller_id,payment_method,total_usd,idempotency_key,request_hash,expires_at)
      values('${second}','${seller}','efectivo',0,'${second}',sha256('seed2'::bytea),now()+interval '30 minutes')`);
    await assert.rejects(db.query("select public.pos_save_order($1,1,'divisas',$2)",[second,JSON.stringify([{kind:"variant",id:variant,quantity:1}])]),/Disponibilidad insuficiente/);
  } finally { await db.close(); }
});

test("Caja ofrece el máximo de stock de la orden descontando las reservas de otras órdenes", async () => {
  const db = await fixture();
  const secondOrder = "00000000-0000-4000-8000-000000000012";
  const secondKey = "00000000-0000-4000-8000-000000000013";
  try {
    await save(db,1,"divisas",[{kind:"variant",id:variant,quantity:3},{kind:"bundle",id:bundle,quantity:1}]);
    await db.exec(`insert into seller_orders(id,seller_id,payment_method,total_usd,idempotency_key,request_hash,expires_at,customer_name,customer_id)
      values('${secondOrder}','${secondSeller}','efectivo',0,'${secondKey}',sha256('availability'::bytea),now()+interval '30 minutes','Cliente Dos','87654321');`);
    await db.query("select public.pos_save_order($1,1,'divisas',$2)",[secondOrder,JSON.stringify([{kind:"variant",id:variant,quantity:1}])]);
    await db.exec("set role authenticated");

    const firstAvailability = (await db.query("select public.pos_order_availability($1) as data",[order])).rows[0].data;
    assert.equal(firstAvailability.find(item => item.kind === "variant").max_quantity,4);
    assert.equal(firstAvailability.find(item => item.kind === "bundle").max_quantity,2);
    const firstCatalog = (await db.query("select public.pos_catalog_products_for_order($1,'',0) as data",[order])).rows[0].data[0];
    assert.equal(firstCatalog.variants[0].stock,4);
    assert.equal(firstCatalog.bundles[0].stock,2);

    const secondAvailability = (await db.query("select public.pos_order_availability($1) as data",[secondOrder])).rows[0].data;
    assert.equal(secondAvailability.find(item => item.kind === "variant").max_quantity,2);
    await assert.rejects(db.query("select public.pos_save_order($1,2,'divisas',$2)",[order,JSON.stringify([{kind:"variant",id:variant,quantity:5}])]),/Disponibilidad insuficiente/);
  } finally { await db.close(); }
});

test("edicion de inventario rechaza stock obsoleto y reducciones por debajo de reservas", async () => {
  const db = await fixture();
  try {
    await db.exec(`update profiles set role = 'admin' where id = '${cashier}'`);
    const snapshot = [{kind:"variant",id:variant,stock:5},{kind:"bundle",id:bundle,stock:2}];
    const call = (stock, expected) => db.query("select public.inventory_update_product_pos_safe($1,'Franela',null,'Franela',array[]::text[],$2,array[]::text[],array[]::uuid[],null,'[]'::jsonb,$3,'Prueba',$4)",
      [product,JSON.stringify([{id:variant,stock}]),JSON.stringify([{id:bundle,stock:2}]),JSON.stringify(expected)]);
    await save(db,1,"divisas",[{kind:"variant",id:variant,quantity:5}]);
    await assert.rejects(call(4,snapshot),/reservas vigentes/);
    await call(5,snapshot);
    await close(db,2,"divisas","efectivo","",44);
    await assert.rejects(call(5,snapshot),/stock cambio/);
    assert.equal((await db.query("select stock from product_variants")).rows[0].stock,0);
  } finally { await db.close(); }
});

test("el listado de caja distingue migracion faltante, permisos y otros errores", () => {
  for (const code of ["PGRST202", "42883", "42P01", "42703"]) assert.match(posReadError({code,message:""}),/Falta la migracion POS/);
  assert.match(posReadError({code:"42501",message:""}),/Sin permiso de caja/);
  assert.match(posReadError({code:"42702",message:""}),/codigo 42702/);
});

test("las reservas vencidas se inhabilitan pero las pagadas no se reactivan", () => {
  const now = Date.parse("2026-11-25T15:00:00Z");
  assert.equal(posReservationExpired({status:"en_proceso",expires_at:"2026-11-25T14:59:59Z"},now),true);
  assert.equal(posReservationExpired({status:"en_proceso",expires_at:"2026-11-25T15:00:00Z"},now),true);
  assert.equal(posReservationExpired({status:"en_proceso",expires_at:"2026-11-25T15:01:00Z"},now),false);
  assert.equal(posReservationExpired({status:"completada",expires_at:"2026-11-25T14:59:00Z"},now),false);
});

test("buscar por SKU no devuelve todo el catalogo ni variantes ajenas", () => {
  const products = [{id:product,name:"Franela",variants:[{id:variant,sku:"FRAN-M-R"},{id:bundle,sku:"FRAN-L-A"}],bundles:[{id:bundle}],prices:[]}];
  assert.equal(filterPosSku(products,"").length,0);
  assert.equal(filterPosSku(products,"FRANELA").length,0);
  const filtered = filterPosSku(products," fran-m-r ");
  assert.equal(filtered[0].variants.length,1);
  assert.equal(filtered[0].variants[0].id,variant);
  assert.equal(filtered[0].bundles.length,0);
});

test("solo Online y En tienda son canales validos; el historial sin canal no se infiere", () => {
  assert.equal(isAttentionChannel("online"),true);
  assert.equal(isAttentionChannel("tienda"),true);
  for (const value of [null,undefined,"","otro"]) assert.equal(isAttentionChannel(value),false);
  assert.equal(attentionChannelLabel(null),"Sin clasificar");
});

test("vendedor guarda canal y lo conserva en reintentos, caja y recibo", async () => {
  const db = await fixture();
  try {
    await db.exec(`set test.actor = '${seller}'; set role authenticated`);
    const newKey = "00000000-0000-4000-8000-000000000010";
    const input = JSON.stringify([{kind:"variant",id:variant,quantity:1}]);
    const create = async channel => (await db.query("select * from public.sellers_create_order($1,'efectivo','Cliente Prueba','12345678',$2,$3)",[newKey,input,channel])).rows[0];
    await assert.rejects(create(""),/Selecciona Online/);
    const created = await create("online");
    assert.equal((await create("online")).order_id,created.order_id);
    await assert.rejects(create("tienda"),/No puedes cambiar la atencion/);
    const list = (await db.query("select * from public.sellers_list_orders('todas',0)")).rows;
    assert.equal(list.find(item => item.id === created.order_id).attention_channel,"online");
    assert.equal(list.find(item => item.id === order).attention_channel,null);
    await assert.rejects(db.query("select * from public.sellers_create_order_base($1,'efectivo','Cliente Prueba','12345678',$2)",[newKey,input]),/permission denied/);
    await db.exec(`set test.actor = '${cashier}'`);
    const editedInput = JSON.stringify([{kind:"variant",id:variant,quantity:2}]);
    const saved = (await db.query("select public.pos_save_order($1,1,'divisas',$2) as data",[created.order_id,editedInput])).rows[0].data;
    assert.equal(saved.attention_channel,"online");
    assert.equal(saved.total_usd,20);
    assert.equal(saved.items[0].quantity,2);
    await db.exec(`set test.actor = '${seller}'`);
    const afterEdit = (await db.query("select * from public.sellers_list_orders('todas',0)")).rows.find(row => row.id === created.order_id);
    assert.equal(afterEdit.status,"en_proceso");
    assert.equal(Number(afterEdit.total_usd),20);
    assert.equal(afterEdit.items[0].quantity,2);
    assert.equal(Number(afterEdit.items[0].total_usd),20);
    await db.exec(`set test.actor = '${cashier}'`);
    const paid = (await db.query("select public.pos_close_order($1,2,$2,'divisas','efectivo','',(now() at time zone 'America/Caracas')::date,'',20) as data",[created.order_id,newKey])).rows[0].data;
    assert.equal(paid.receipt.attention_channel,"online");
    await db.exec(`set test.actor = '${seller}'`);
    const afterPayment = (await db.query("select * from public.sellers_list_orders('todas',0)")).rows.find(row => row.id === created.order_id);
    assert.equal(afterPayment.status,"completada");
    assert.equal(Number(afterPayment.total_usd),20);
    assert.equal(afterPayment.items[0].quantity,2);
    assert.equal(Number(afterPayment.items[0].total_usd),20);
  } finally { await db.close(); }
});

test("solo caja elimina reservas vencidas y Vendedores conserva quien la elimino", async () => {
  const db = await fixture();
  try {
    await db.exec("set role authenticated");
    await assert.rejects(db.query("select public.pos_delete_expired_order($1,1)",[order]),/reserva sigue vigente/i);
    await db.exec("reset role; update seller_orders set expires_at=clock_timestamp()-interval '1 second'; set role authenticated");
    const deleted = (await db.query("select public.pos_delete_expired_order($1,1) as data",[order])).rows[0].data;
    assert.equal(deleted.status,"eliminada");
    assert.equal(deleted.deleted_by_role,"cajero");
    assert.equal(deleted.deleted_by,cashier);
    const retry = (await db.query("select public.pos_delete_expired_order($1,2) as data",[order])).rows[0].data;
    assert.equal(retry.deleted_at,deleted.deleted_at);
    await db.exec("reset role");
    assert.equal((await db.query("select count(*)::int as count from pos_order_events where order_id=$1",[order])).rows[0].count,1);
    await db.exec(`set role authenticated`);
    await db.exec(`set test.actor='${cashier}'`);
    assert.equal((await db.query("select public.pos_list_orders(false,'',0) as data")).rows[0].data.length,0);
    await db.exec(`set test.actor='${seller}'`);
    const listed=(await db.query("select * from public.sellers_list_orders('todas',0)")).rows.find(row=>row.id===order);
    assert.equal(listed.status,"eliminada");
    assert.equal(listed.deleted_by_name,"Caja de prueba");
    assert.equal(listed.deleted_by_role,"cajero");
    assert.ok(listed.deleted_at);
  } finally { await db.close(); }
});

test("panel administrativo resume ventas por fecha de pago y solo admite admin", async () => {
  const db = await fixture();
  try {
    await save(db,1,"divisas");
    await close(db,2,"divisas","efectivo","",114);
    const paidOn = (await db.query("select ((now() at time zone 'America/Caracas')::date - 1)::text as day")).rows[0].day;
    const date = new Date(`${paidOn}T12:00:00Z`);
    const nextDay = new Date(date);
    nextDay.setUTCDate(date.getUTCDate() + 1);
    await db.exec("set role authenticated");
    await db.exec(`set test.actor = '${cashier}'`);
    await assert.rejects(db.query("select public.admin_sales_dashboard_range('day',$1,$1)",[paidOn]),/Acceso de administrador/);
    await db.exec(`set test.actor = '${seller}'`);
    await assert.rejects(db.query("select public.admin_sales_dashboard_range('day',$1,$1)",[paidOn]),/Acceso de administrador/);
    await db.exec(`set test.actor = '${admin}'`);
    const report = (await db.query("select public.admin_sales_dashboard_range('day',$1,$1) as data",[paidOn])).rows[0].data;
    assert.equal(report.sales.receipt_count,1);
    assert.equal(report.sales.usd_equivalent,114);
    assert.equal(report.sales.usd_collected,114);
    assert.equal(report.sales.ves_collected,0);
    assert.equal(report.sales.units_sold,3);
    assert.equal(report.sales.bundles_sold,1);
    assert.equal(report.sellers[0].seller_name,"Asesor de prueba");
    assert.equal(report.products[0].product_name,"Franela");
    assert.equal(report.series.length,1);
    assert.equal(report.series[0].receipt_count,1);

    const monthStart = `${paidOn.slice(0,7)}-01`;
    const monthEnd = new Date(Date.UTC(Number(paidOn.slice(0,4)),Number(paidOn.slice(5,7)),0)).toISOString().slice(0,10);
    const monthly = (await db.query("select public.admin_sales_dashboard_range('month',$1,$2) as data",[monthStart,monthEnd])).rows[0].data;
    assert.equal(monthly.series.length,new Date(Date.UTC(Number(paidOn.slice(0,4)),Number(paidOn.slice(5,7)),0)).getUTCDate());
    assert.equal(monthly.sales.receipt_count,1);

    const yearly = (await db.query("select public.admin_sales_dashboard_range('year',$1,$2) as data",[`${paidOn.slice(0,4)}-01-01`,`${paidOn.slice(0,4)}-12-31`])).rows[0].data;
    assert.equal(yearly.series.length,12);
    const november = yearly.series.find((bucket) => bucket.bucket_date === `${paidOn.slice(0,4)}-11-01`);
    assert.ok(november);
    assert.equal(november.receipt_count,1);
    assert.equal(yearly.sales.receipt_count,1);

    await assert.rejects(db.query("select public.admin_sales_dashboard_range('week',$1,$1)",[paidOn]),/Periodo o rango de fechas invalido/);
    await assert.rejects(db.query("select public.admin_sales_dashboard_range('day',$1,$2)",[paidOn,nextDay.toISOString().slice(0,10)]),/periodo diario requiere una sola fecha/i);
    await assert.rejects(db.query("select public.admin_sales_dashboard_range('day',$1,$2)",[nextDay.toISOString().slice(0,10),paidOn]),/Periodo o rango de fechas invalido/);
    await assert.rejects(db.query("select public.admin_sales_dashboard_range('unknown',$1,$1)",[paidOn]),/Periodo o rango de fechas invalido/);
  } finally { await db.close(); }
});

test("comisiones semanales usan semana domingo-sabado y 10 por ciento del USD equivalente", async () => {
  const db = await fixture();
  const secondOrder = "00000000-0000-4000-8000-000000000012";
  const secondKey = "00000000-0000-4000-8000-000000000013";
  try {
    await save(db,1,"divisas");
    await db.query("select public.pos_close_order($1,2,$2,'divisas','efectivo','',date '2026-11-01','Prueba',114)",[order,key]);
    await db.exec(`set test.actor = '${cashier}'; insert into seller_orders(id,seller_id,payment_method,total_usd,total_ves,exchange_rate,rate_date,idempotency_key,request_hash,expires_at,customer_name,customer_id)
      values('${secondOrder}','${secondSeller}','bolivares',0,0,40,date '2026-11-07','${secondKey}',sha256('weekly'::bytea),now()+interval '30 minutes','Cliente Dos','87654321');`);
    const saved = (await db.query("select public.pos_save_order($1,1,'bolivares',$2) as data",[secondOrder,JSON.stringify([{kind:"variant",id:variant,quantity:1}])])).rows[0].data;
    assert.equal(saved.total_usd,12);
    assert.equal(saved.total_ves,480);
    await db.query("select public.pos_close_order($1,2,$2,'bolivares','efectivo','',date '2026-11-07','Prueba',480)",[secondOrder,secondKey]);

    await db.exec("set role authenticated");
    await db.exec(`set test.actor = '${cashier}'`);
    await assert.rejects(db.query("select public.admin_weekly_commissions(date '2026-11-04')"),/Acceso de administrador/);
    await db.exec(`set test.actor = '${admin}'`);
    const report = (await db.query("select public.admin_weekly_commissions(date '2026-11-04') as data")).rows[0].data;
    assert.equal(report.week_start,"2026-11-01");
    assert.equal(report.week_end,"2026-11-07");
    assert.equal(report.commission_percent,10);
    assert.equal(report.sellers.length,3);
    assert.deepEqual(report.sellers[0],{
      seller_id:seller,
      seller_name:"Asesor de prueba",
      seller_username:"vendedor01",
      sales_count:1,
      total_sales_usd:114,
      bolivares_sales_usd:0,
      usd_sales:114,
      commission_usd:11.4,
    });
    assert.equal(report.sellers[1].seller_username,"vendedor02");
    assert.equal(report.sellers[1].sales_count,1);
    assert.equal(report.sellers[1].total_sales_usd,12);
    assert.equal(report.sellers[1].bolivares_sales_usd,12);
    assert.equal(report.sellers[1].usd_sales,0);
    assert.equal(report.sellers[1].commission_usd,1.2);
    assert.equal(report.sellers[2].seller_username,"vendedor03");
    assert.equal(report.sellers[2].sales_count,0);
    assert.equal(report.sellers[2].commission_usd,0);
  } finally { await db.close(); }
});

test("procesa comisiones por rango sin volver a incluir recibos y conserva el historial", async () => {
  const db = await fixture();
  const secondOrder = "00000000-0000-4000-8000-000000000012";
  const secondKey = "00000000-0000-4000-8000-000000000013";
  const process = (sellerId, start = "2026-11-01", end = "2026-11-07") =>
    db.query("select public.admin_process_commission($1,$2,$3) as data",[sellerId,start,end]);
  const pending = (start = "2026-11-01", end = "2026-11-07") =>
    db.query("select public.admin_commission_pending($1,$2) as data",[start,end]);
  try {
    await save(db,1,"divisas");
    await db.query("select public.pos_close_order($1,2,$2,'divisas','efectivo','',date '2026-11-01','Prueba',114)",[order,key]);
    await db.exec(`set test.actor = '${cashier}'; insert into seller_orders(id,seller_id,payment_method,total_usd,total_ves,exchange_rate,rate_date,idempotency_key,request_hash,expires_at,customer_name,customer_id)
      values('${secondOrder}','${secondSeller}','bolivares',0,0,40,date '2026-11-07','${secondKey}',sha256('weekly'::bytea),now()+interval '30 minutes','Cliente Dos','87654321');`);
    const saved = (await db.query("select public.pos_save_order($1,1,'bolivares',$2) as data",[secondOrder,JSON.stringify([{kind:"variant",id:variant,quantity:1}])])).rows[0].data;
    assert.equal(saved.total_usd,12);
    assert.equal(saved.total_ves,480);
    await db.query("select public.pos_close_order($1,2,$2,'bolivares','efectivo','',date '2026-11-07','Prueba',480)",[secondOrder,secondKey]);

    await db.exec("set role authenticated");
    await db.exec(`set test.actor = '${cashier}'`);
    await assert.rejects(pending(),/Acceso de administrador/);
    await assert.rejects(process(seller),/Acceso de administrador/);
    await db.exec(`set test.actor = '${admin}'`);

    let pendingReport = (await pending()).rows[0].data;
    assert.equal(pendingReport.commission_percent,10);
    let rows = pendingReport.sellers;
    assert.equal(rows.length,2);
    assert.equal(rows[0].seller_id,seller);
    assert.equal(rows[0].sales_count,1);
    assert.equal(rows[0].total_sales_usd,114);
    assert.equal(rows[0].commission_usd,11.4);
    const first = (await process(seller)).rows[0].data;
    assert.equal(first.range_start,"2026-11-01");
    assert.equal(first.range_end,"2026-11-07");
    assert.equal(first.total_sales_usd,114);
    assert.equal(first.commission_usd,11.4);

    rows = (await pending()).rows[0].data.sellers;
    assert.equal(rows.length,1);
    assert.equal(rows[0].seller_id,secondSeller);
    assert.equal(rows[0].bolivares_sales_usd,12);
    assert.equal(rows[0].usd_sales,0);
    assert.equal(rows[0].commission_usd,1.2);
    const second = (await process(secondSeller)).rows[0].data;
    assert.equal(second.sales_count,1);
    assert.equal(second.total_sales_usd,12);
    assert.equal(second.commission_usd,1.2);
    assert.deepEqual((await pending()).rows[0].data.sellers,[]);
    await assert.rejects(process(seller),/No hay ventas pendientes/);
    await assert.rejects(process(seller,"2026-10-31","2026-11-03"),/No hay ventas pendientes/);
    await assert.rejects(process(seller,"2026-11-08","2026-11-01"),/rango de fechas invalido/i);

    await db.exec(`reset role; insert into admin_commission_batches(seller_id,seller_name,seller_username,range_start,range_end,commission_percent,sales_count,total_sales_usd,commission_usd,processed_by,processed_at)
      values('${sellerWithoutSales}','Vendedor Sin Ventas','vendedor03',date '2026-10-25',date '2026-10-31',12,1,100,12,'${admin}',now()-interval '1 day'); set role authenticated; set test.actor='${admin}'`);

    const history = (await db.query("select public.admin_commission_processed(0) as data")).rows[0].data;
    assert.equal(history.total_count,3);
    assert.equal(history.batches.length,3);
    assert.equal(history.batches[0].range_start,"2026-11-01");
    assert.equal(history.batches[0].range_end,"2026-11-07");
    const historicalBatch = history.batches.find((batch) => batch.seller_username === "vendedor03");
    assert.equal(historicalBatch.commission_percent,12);
    assert.equal(historicalBatch.commission_usd,12);
    await db.exec("reset role");
    assert.equal((await db.query("select count(*)::int as count from pos_receipts")).rows[0].count,2);
    assert.equal((await db.query("select count(*)::int as count from admin_commission_receipts")).rows[0].count,2);
  } finally { await db.close(); }
});

test("transacciones lista cobros por fecha, vincula el recibo y exige acceso de caja", async () => {
  const db = await fixture();
  try {
    await save(db,1,"bolivares");
    const paid = await close(db,2,"bolivares","pago_movil","REF-123",5080);
    const paidOn = paid.receipt.payment.paid_on;
    const secondOrder = "00000000-0000-4000-8000-000000000012";
    const secondKey = "00000000-0000-4000-8000-000000000013";
    await db.exec(`insert into seller_orders(id,seller_id,payment_method,total_usd,idempotency_key,request_hash,expires_at,customer_name,customer_id)
      values('${secondOrder}','${secondSeller}','efectivo',0,'${secondKey}',sha256('transaction'::bytea),now()+interval '30 minutes','Cliente Dos','87654321');`);
    await db.query("select public.pos_save_order($1,1,'divisas',$2)",[secondOrder,JSON.stringify([{kind:"variant",id:variant,quantity:1}])]);
    await db.query("select public.pos_close_order($1,2,$2,'divisas','efectivo','',($3::date - 1),'',10)",[secondOrder,secondKey,paidOn]);
    await db.exec("set role authenticated");
    const list = async (from, to, offset = 0) => (await db.query("select * from public.pos_list_transactions($1,$2,$3)",[from,to,offset])).rows;
    const rows = await list(paidOn,paidOn);
    assert.equal(rows.length,1);
    assert.equal(rows[0].receipt_id,paid.receipt.id);
    assert.equal(rows[0].order_id,order);
    assert.equal(rows[0].currency,"bolivares");
    assert.equal(rows[0].method,"pago_movil");
    assert.equal(Number(rows[0].amount),5080);
    assert.equal(rows[0].reference,"REF-123");
    assert.equal(rows[0].comment,"Prueba");
    const all = await list(null,null);
    assert.equal(all.length,2);
    assert.equal(all[0].order_id,order);
    assert.equal(all[1].order_id,secondOrder);
    assert.equal(all[1].currency,"divisas");
    assert.equal(all[1].method,"efectivo");
    assert.equal(Number(all[1].amount),10);
    assert.equal(all[1].reference,null);
    assert.equal((await list(null,null,1))[0].order_id,secondOrder);
    assert.equal((await list(paidOn,paidOn,1)).length,0);
    assert.equal((await list("1900-01-01","1900-01-01")).length,0);
    await assert.rejects(list("2026-11-02","2026-11-01"),/Filtro de transacciones invalido/);
    await assert.rejects(list(null,null,-1),/Filtro de transacciones invalido/);
    await db.exec(`set test.actor = '${seller}'`);
    await assert.rejects(list(null,null),/Acceso de caja/);
    await db.exec(`set test.actor = '${admin}'`);
    assert.equal((await list(null,null)).length,2);
    await db.exec("set role anon");
    await assert.rejects(list(null,null),/permission denied/i);
  } finally { await db.close(); }
});

test("Transacciones muestra cada cobro en una fila con filtros y enlace al recibo", async () => {
  const require = createRequire(import.meta.url);
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const ts = require("typescript");
  const source = await readFile(new URL("../src/app/pos/transacciones/page.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const filtersSource = await readFile(new URL("../src/app/pos/date-currency-filters.tsx", import.meta.url), "utf8");
  const filterExports = {};
  runInNewContext(ts.transpileModule(filtersSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports: filterExports, require });
  const exports = {};
  let query;
  const data = [
    { movement_type: "ingreso", receipt_id: "abcdef12-0000-4000-8000-000000000001", order_id: order, paid_on: "2026-11-25", currency: "bolivares", method: "efectivo", amount: 5100, reference: "REF-123", comment: "Pago confirmado" },
    { movement_type: "vuelto", receipt_id: "abcdef12-0000-4000-8000-000000000001", order_id: order, paid_on: "2026-11-25", currency: "bolivares", method: "efectivo", amount: 20, reference: "REF-123", comment: "Pago confirmado" },
    { movement_type: "ingreso", receipt_id: "abcdef34-0000-4000-8000-000000000002", order_id: product, paid_on: "2026-11-24", currency: "divisas", method: "efectivo", amount: null, reference: null, comment: "" },
    { movement_type: "ingreso", receipt_id: "abcdef56-0000-4000-8000-000000000003", order_id: variant, paid_on: "2026-11-24", currency: "divisas", method: "binance", amount: 10, reference: "REF-USD", comment: "" },
  ];
  runInNewContext(compiled, {
    exports, URLSearchParams, console,
    require(id) {
      if (id === "next/link") return { __esModule: true, default: ({ children, href }) => React.createElement("a", { href }, children) };
      if (id === "next/image") return { __esModule: true, default: () => null };
      if (id === "next/server") return { connection: async () => {} };
      if (id === "lucide-react") return { ReceiptText: () => null, Search: () => null };
      if (id === "@/app/login/actions") return { logoutPos: "/pos/login" };
      if (id === "@/lib/auth/pos-access") return { requirePosProfile: async () => ({ full_name: "Caja" }) };
      if (id === "@/lib/pos/order") return { posMethods, posMoney };
      if (id === "@/lib/pos/filters") return { parsePosFilters };
      if (id === "@/lib/supabase/server") return { createSupabaseServerClient: async () => ({ rpc: async (name, args) => { query = { name, args }; return { data, error: null }; } }) };
      if (id === "../date-currency-filters") return filterExports;
      if (id === "../navigation") return { PosNavigation: () => null };
      return require(id);
    },
  });
  const html = renderToStaticMarkup(await exports.default({ searchParams: Promise.resolve({ desde: "2026-11-01", hasta: "2026-11-30", moneda: "bolivares" }) }));
  assert.equal(query.name,"pos_list_money_movements_filtered");
  assert.equal(query.args.p_from,"2026-11-01");
  assert.equal(query.args.p_to,"2026-11-30");
  assert.equal(query.args.p_currency,"bolivares");
  assert.match(html,/Moneda de pago/);
  assert.match(html,/<table/);
  for (const heading of ["Fecha de pago", "Movimiento", "Modalidad", "Forma de pago", "Monto", "Referencia", "Recibo", "Comentarios"]) assert.ok(html.includes(`>${heading}</th>`));
  assert.equal((html.match(/<tr/g) ?? []).length,5);
  assert.ok(html.includes("REF-123"));
  assert.ok(html.includes("Pago confirmado"));
  assert.ok(html.includes("Sin referencia"));
  assert.ok(html.includes("Sin comentarios"));
  assert.ok(html.includes("+Bs. 5.100,00"));
  assert.ok(html.includes("-Bs. 20,00"));
  assert.ok(html.includes(`+${posMoney(10,"divisas")}`));
  assert.ok(html.includes("Salida · vuelto"));
  assert.ok(html.includes("No registrado"));
  assert.ok(html.includes(`/pos/${order}/recibo?origen=transacciones&amp;desde=2026-11-01&amp;hasta=2026-11-30&amp;moneda=bolivares`));
});

test("Recibos consulta fecha y moneda y conserva los filtros en la orden abierta", async () => {
  const require = createRequire(import.meta.url);
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const ts = require("typescript");
  const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const filterExports = {};
  runInNewContext(compile(await readFile(new URL("../src/app/pos/date-currency-filters.tsx", import.meta.url), "utf8")), { exports: filterExports, require });
  const compiled = compile(await readFile(new URL("../src/app/pos/page.tsx", import.meta.url), "utf8"));
  const exports = {};
  let query;
  runInNewContext(compiled, {
    exports, URLSearchParams, console,
    require(id) {
      if (id === "next/link") return { __esModule: true, default: ({ children, href }) => React.createElement("a", { href }, children) };
      if (id === "next/form") return { __esModule: true, default: ({ children, action }) => React.createElement("form", { action }, children) };
      if (id === "next/image") return { __esModule: true, default: () => null };
      if (id === "next/server") return { connection: async () => {} };
      if (id === "@/lib/auth/pos-access") return { requirePosProfile: async () => ({ full_name: "Caja" }) };
      if (id === "@/app/login/actions") return { logoutPos: "/pos/login" };
      if (id === "@/lib/pos/order") return posOrder;
      if (id === "@/lib/pos/filters") return { parsePosFilters };
      if (id === "@/lib/supabase/server") return { createSupabaseServerClient: async () => ({ rpc: async (name, args) => { query = { name, args }; return { data: [{ id: order, status: "completada", customer_name: "Cliente", customer_id: "12345678", advisor_name: "Vendedor", total_usd: 10, total_ves: null, paid_on: "2026-11-25" }], error: null }; } }) };
      if (id === "./date-currency-filters") return filterExports;
      if (id === "./pos-editor") return { PosEditor: () => null };
      if (id === "./expired-order-actions") return { ExpiredOrderActions: () => null };
      if (id === "./refresh-orders") return { RefreshPosOrders: () => null };
      if (id === "./navigation") return { PosNavigation: () => null };
      return require(id);
    },
  });
  const html = renderToStaticMarkup(await exports.default({ searchParams: Promise.resolve({ vista: "recibos", q: "Cliente", desde: "2026-11-01", hasta: "2026-11-30", moneda: "divisas", pagina: "2" }) }));
  assert.equal(query.name,"pos_list_receipts_filtered");
  assert.equal(query.args.p_search,"Cliente");
  assert.equal(query.args.p_from,"2026-11-01");
  assert.equal(query.args.p_to,"2026-11-30");
  assert.equal(query.args.p_currency,"divisas");
  assert.equal(query.args.p_offset,24);
  assert.match(html,/Moneda de pago/);
  assert.ok(html.includes(`vista=recibos&amp;desde=2026-11-01&amp;hasta=2026-11-30&amp;moneda=divisas&amp;orden=${order}`));
});

test("el recibo abrevia orden y recibo y muestra monto entregado sin alterar sus identificadores", async () => {
  const require = createRequire(import.meta.url);
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const ts = require("typescript");
  const source = await readFile(new URL("../src/app/pos/[orderId]/recibo/page.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  const orderId = "aabbccdd-0000-4000-8000-000000000001";
  const receiptId = "1122aabb-0000-4000-8000-000000000002";
  const receipt = { id: receiptId, customer_name: "Cliente", customer_id: "12345678", advisor_name: "Vendedor", cashier_name: "Caja", items: [], payment: { currency: "bolivares", method: "efectivo", amount: 10, received_amount: 20, change_amount: 10, paid_on: "2026-11-26", registered_at: "2026-11-26T14:00:00Z", reference: null, comment: "" } };
  runInNewContext(compiled, {
    exports, URLSearchParams, console,
    require(id) {
      if (id === "next/link") return { __esModule: true, default: ({ children, href }) => React.createElement("a", { href }, children) };
      if (id === "next/image") return { __esModule: true, default: () => null };
      if (id === "next/server") return { connection: async () => {} };
      if (id === "@/lib/auth/pos-access") return { requirePosProfile: async () => ({}) };
      if (id === "@/lib/supabase/server") return { createSupabaseServerClient: async () => ({ rpc: async () => ({ data: { id: orderId, revision: 1, items: [], receipt }, error: null }) }) };
      if (id === "@/lib/pos/order") return posOrder;
      if (id === "./print-button") return { PrintButton: () => null };
      if (id === "@/lib/sellers/attention-channel") return { attentionChannelLabel: () => "En tienda" };
      return require(id);
    },
  });
  const html = renderToStaticMarkup(await exports.default({ params: Promise.resolve({ orderId }), searchParams: Promise.resolve({}) }));
  assert.match(html,/Orden: (?:<!-- -->)?AABBCCDD/);
  assert.match(html,/Recibo: (?:<!-- -->)?1122AABB/);
  assert.match(html,/Monto entregado:/);
  assert.doesNotMatch(html,/Monto recibido:/);
  assert.ok(html.includes("/pos?vista=recibos"));
  assert.ok(!html.includes(`/pos?orden=${orderId}&amp;vista=recibos`));
  const filteredHtml = renderToStaticMarkup(await exports.default({ params: Promise.resolve({ orderId }), searchParams: Promise.resolve({ origen: "recibos", desde: "2026-11-01", hasta: "2026-11-30", moneda: "divisas", pagina: "2", q: "Cliente" }) }));
  assert.ok(filteredHtml.includes("/pos?vista=recibos&amp;desde=2026-11-01&amp;hasta=2026-11-30&amp;moneda=divisas&amp;pagina=2&amp;q=Cliente"));
  assert.ok(!filteredHtml.includes(`/pos?orden=${orderId}`));
  const transactionsHtml = renderToStaticMarkup(await exports.default({ params: Promise.resolve({ orderId }), searchParams: Promise.resolve({ origen: "transacciones", desde: "2026-11-01", moneda: "bolivares", pagina: "2" }) }));
  assert.ok(transactionsHtml.includes("/pos/transacciones?desde=2026-11-01&amp;moneda=bolivares&amp;pagina=2"));
});

test("monto recibido calcula diferencia y vuelto sin perder centimos", () => {
  assert.deepEqual(posTender("10,00", 10, "efectivo"), { received: 10, difference: 0, change: 0, sufficient: true });
  assert.deepEqual(posTender("10.01", 10, "efectivo"), { received: 10.01, difference: 0.01, change: 0.01, sufficient: true });
  assert.deepEqual(posTender("9,99", 10, "efectivo"), { received: 9.99, difference: -0.01, change: 0, sufficient: false });
  assert.equal(posTender("10,01", 10, "tarjeta").sufficient, true);
  assert.equal(posTender("10,01", 10, "tarjeta").change, 0);
  assert.equal(posTender("10", 10, "tarjeta").sufficient, true);
  for (const value of ["", "-1", "1,234", "1.000,00", "1e3", "10000000000"]) assert.equal(posTender(value, 10, "efectivo"), null);
  assert.equal(posTender("10", null, "efectivo"), null);
});

test("cobro valida monto recibido y guarda vuelto sin alterar el total neto", async () => {
  const db = await fixture();
  try {
    await save(db,1,"divisas");
    await db.exec(await readFile(new URL("../supabase/migrations/20261126110000_pos_payment_tender.sql", import.meta.url), "utf8"));
    await db.exec("set role authenticated");
    const tender = (method, received, paymentKey = key) => db.query(
      "select public.pos_close_order_with_tender($1,2,$2,'divisas',$3,'REF',(now() at time zone 'America/Caracas')::date,'Prueba',114,$4) as data",
      [order,paymentKey,method,received],
    );
    await assert.rejects(tender("efectivo",113.99),/insuficiente/);
    await assert.rejects(tender("binance",115),/debe coincidir/);
    await assert.rejects(tender("efectivo",114.001),/Monto recibido invalido/);
    await assert.rejects(tender("efectivo",null),/No existe un cierre previo/);
    await assert.rejects(db.query("select public.pos_close_order($1,2,$2,'divisas','efectivo','REF',(now() at time zone 'America/Caracas')::date,'Prueba',114)",[order,key]),/permission denied/i);
    await assert.rejects(db.query("select * from public.pos_payment_tender"),/permission denied/i);
    await db.exec("reset role; alter table public.pos_payment_tender add constraint force_tender_failure check (received_amount < 0); set role authenticated");
    await assert.rejects(tender("efectivo",120),/force_tender_failure/);
    await db.exec("reset role");
    assert.equal((await db.query("select count(*)::int as count from pos_receipts")).rows[0].count,0);
    assert.equal((await db.query("select stock from product_variants where id=$1",[variant])).rows[0].stock,5);
    await db.exec("alter table public.pos_payment_tender drop constraint force_tender_failure; set role authenticated");
    const paid = (await tender("efectivo",120)).rows[0].data;
    assert.equal(paid.receipt.payment.amount,114);
    assert.equal(paid.receipt.payment.received_amount,120);
    assert.equal(paid.receipt.payment.change_amount,6);
    assert.equal((await tender("efectivo",120)).rows[0].data.receipt.id,paid.receipt.id);
    await assert.rejects(tender("efectivo",121),/no coincide con el cierre anterior/);
    await db.exec(`set test.actor = '${seller}'`);
    await assert.rejects(tender("efectivo",120),/Acceso de caja/);
    await db.exec("reset role");
    assert.equal((await db.query("select count(*)::int as count from pos_receipts")).rows[0].count,1);
    assert.equal((await db.query("select count(*)::int as count from pos_payment_tender")).rows[0].count,1);
    assert.equal(Number((await db.query("select amount from pos_receipts")).rows[0].amount),114);
  } finally { await db.close(); }
});

test("un cierre anterior a la migración puede verificarse sin inventar vuelto", async () => {
  const db = await fixture();
  try {
    await save(db,1,"divisas");
    const previous = await close(db,2,"divisas","efectivo","",114);
    await db.exec(await readFile(new URL("../supabase/migrations/20261126110000_pos_payment_tender.sql", import.meta.url), "utf8"));
    await db.exec("set role authenticated");
    const retry = (await db.query("select public.pos_close_order_with_tender($1,2,$2,'divisas','efectivo','',(now() at time zone 'America/Caracas')::date - 1,'Prueba',114,null) as data",[order,key])).rows[0].data;
    assert.equal(retry.receipt.id,previous.receipt.id);
    assert.equal(retry.receipt.payment.received_amount,undefined);
    await assert.rejects(db.query("select public.pos_close_order_with_tender($1,2,$2,'divisas','efectivo','',(now() at time zone 'America/Caracas')::date - 1,'Prueba',114,114)",[order,key]),/no coincide con el cierre anterior/);
    await db.exec("reset role");
    await db.exec(await readFile(new URL("../supabase/migrations/20261126120000_pos_excess_and_cash_movements.sql", import.meta.url), "utf8"));
    await db.exec("set role authenticated");
    const newRetry = (await db.query("select public.pos_close_order_with_excess($1,2,$2,'divisas','efectivo','',(now() at time zone 'America/Caracas')::date - 1,'Prueba',114,null,false) as data",[order,key])).rows[0].data;
    assert.equal(newRetry.receipt.id,previous.receipt.id);
    const movements = (await db.query("select * from public.pos_list_money_movements(null,null,0)")).rows;
    assert.equal(movements.length,1);
    assert.equal(movements[0].movement_type,"ingreso");
    assert.equal(movements[0].amount,null);
  } finally { await db.close(); }
});

test("el formulario solicita monto recibido y conserva la verificación de pago", async () => {
  const require = createRequire(import.meta.url);
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const ts = require("typescript");
  const source = await readFile(new URL("../src/app/pos/pos-editor.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports, console, URLSearchParams,
    require(id) {
      if (id === "next/link") return { __esModule: true, default: ({ children, href }) => React.createElement("a", { href }, children) };
      if (id === "next/navigation") return { useRouter: () => ({ replace: () => {}, refresh: () => {} }) };
      if (id === "lucide-react") return Object.fromEntries(["Minus", "Plus", "Trash2", "ReceiptText", "Save", "Search", "X"].map(name => [name, () => null]));
      if (id === "@/lib/catalog/commercial") return commercial;
      if (id === "@/lib/pos/order") return posOrder;
      if (id === "./actions") return {};
      if (id === "@/lib/sellers/attention-channel") return { attentionChannelLabel: () => "En tienda" };
      return require(id);
    },
  });
  const currentOrder = { id: order, revision: 1, items: [], status: "en_proceso", payment_method: "efectivo", total_usd: 10, total_ves: null, expires_at: "2026-11-26T15:00:00Z", customer_name: "Cliente", customer_id: "12345678", advisor_name: "Vendedor" };
  const html = renderToStaticMarkup(React.createElement(exports.PosEditor, { order: currentOrder, availability: {}, today: "2026-11-26", serverTime: "2026-11-26T14:00:00Z", returnHref: "/pos" }));
  assert.match(html,/Monto recibido/);
  assert.match(html,/aria-label="Vuelto"/);
  assert.match(html,/aria-label="Diferencia entre monto recibido y total"/);
  assert.match(html,/type="checkbox"[^>]*disabled/);
  assert.match(html,/Pago verificado por/);
  assert.match(html,/disabled=""[^>]*>Registrar pago y cerrar orden/);
  const completed = renderToStaticMarkup(React.createElement(exports.PosEditor, { order: { ...currentOrder, status: "completada" }, availability: {}, today: "2026-11-26", serverTime: "2026-11-26T14:00:00Z", returnHref: "/pos?q=Cliente&pagina=2&vista=recibos&desde=2026-11-01&hasta=2026-11-30&moneda=divisas" }));
  assert.ok(completed.includes(`/pos/${order}/recibo?q=Cliente&amp;pagina=2&amp;desde=2026-11-01&amp;hasta=2026-11-30&amp;moneda=divisas&amp;origen=recibos`));
});

test("el formulario exige comentario y confirmación adicionales para excedentes electrónicos", async () => {
  const require = createRequire(import.meta.url);
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const ts = require("typescript");
  const source = await readFile(new URL("../src/app/pos/pos-editor.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const render = (comment, excessConfirmed, verified) => {
    let stateIndex = 0;
    const overrides = { 11: "binance", 12: "REF", 14: comment, 15: "12", 16: excessConfirmed, 17: verified };
    const hooks = { ...React, useState: initial => [Object.hasOwn(overrides, stateIndex) ? overrides[stateIndex++] : (stateIndex++, initial), () => {}], useEffect: () => {}, useRef: () => ({ current: null }), useSyncExternalStore: () => null, useTransition: () => [false, () => {}] };
    const exports = {};
    runInNewContext(compiled, {
      exports, console, URLSearchParams,
      require(id) {
        if (id === "react") return hooks;
        if (id === "next/link") return { __esModule: true, default: ({ children, href }) => React.createElement("a", { href }, children) };
        if (id === "next/navigation") return { useRouter: () => ({ replace: () => {}, refresh: () => {} }) };
        if (id === "lucide-react") return Object.fromEntries(["Minus", "Plus", "Trash2", "ReceiptText", "Save", "Search", "X"].map(name => [name, () => null]));
        if (id === "@/lib/catalog/commercial") return commercial;
        if (id === "@/lib/pos/order") return posOrder;
        if (id === "./actions") return {};
        if (id === "@/lib/sellers/attention-channel") return { attentionChannelLabel: () => "En tienda" };
        return require(id);
      },
    });
    const currentOrder = { id: order, revision: 1, items: [], status: "en_proceso", payment_method: "efectivo", total_usd: 10, total_ves: null, expires_at: "2026-11-26T15:00:00Z", customer_name: "Cliente", customer_id: "12345678", advisor_name: "Vendedor" };
    return renderToStaticMarkup(React.createElement(exports.PosEditor, { order: currentOrder, availability: {}, today: "2026-11-26", serverTime: "2026-11-26T14:00:00Z", returnHref: "/pos" }));
  };
  const incomplete = render("", false, false);
  assert.match(incomplete,/Confirmo que el monto recibido es mayor al monto por cobrar/);
  assert.match(incomplete,/Comentarios \(obligatorio por diferencia\)/);
  assert.match(incomplete,/disabled=""[^>]*>Registrar pago y cerrar orden/);
  const confirmed = render("Diferencia registrada", true, true);
  assert.doesNotMatch(confirmed,/disabled=""[^>]*>Registrar pago y cerrar orden/);
});

test("movimientos registran ingreso recibido y salida por vuelto en el mismo cierre", async () => {
  const db = await fixture();
  try {
    await save(db,1,"divisas");
    for (const migration of ["20261126110000_pos_payment_tender.sql", "20261126120000_pos_excess_and_cash_movements.sql"]) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), "utf8"));
    }
    await db.exec("set role authenticated");
    const closeWithExcess = (method, received, comment, confirmed) => db.query(
      "select public.pos_close_order_with_excess($1,2,$2,'divisas',$3,'REF',(now() at time zone 'America/Caracas')::date,$4,114,$5,$6) as data",
      [order,key,method,comment,received,confirmed],
    );
    await assert.rejects(closeWithExcess("efectivo",113.99,"",false),/insuficiente/);
    await assert.rejects(closeWithExcess("binance",120,"",true),/comentario/);
    await assert.rejects(closeWithExcess("binance",120,"diferencia",false),/Confirma/);
    await assert.rejects(db.query("select public.pos_close_order_with_tender($1,2,$2,'divisas','efectivo','REF',(now() at time zone 'America/Caracas')::date,'',114,120)",[order,key]),/permission denied/i);
    assert.equal((await db.query("select * from public.pos_list_money_movements(null,null,0)")).rows.length,0);
    await db.exec("reset role; alter table public.pos_payment_tender add constraint force_movement_failure check (received_amount < 0); set role authenticated");
    await assert.rejects(closeWithExcess("efectivo",120,"",false),/force_movement_failure/);
    assert.equal((await db.query("select * from public.pos_list_money_movements(null,null,0)")).rows.length,0);
    await db.exec("reset role");
    assert.equal((await db.query("select stock from public.product_variants where id=$1",[variant])).rows[0].stock,5);
    await db.exec("alter table public.pos_payment_tender drop constraint force_movement_failure; set role authenticated");
    const paid = (await closeWithExcess("efectivo",120,"",false)).rows[0].data;
    assert.equal(paid.receipt.payment.amount,114);
    assert.equal(paid.receipt.payment.received_amount,120);
    assert.equal(paid.receipt.payment.change_amount,6);
    const movements = (await db.query("select * from public.pos_list_money_movements(null,null,0)")).rows;
    assert.equal(movements.length,2);
    assert.equal(movements[0].movement_type,"ingreso");
    assert.equal(Number(movements[0].amount),120);
    assert.equal(movements[1].movement_type,"vuelto");
    assert.equal(Number(movements[1].amount),6);
    assert.equal(movements[0].receipt_id,paid.receipt.id);
    assert.equal(movements[1].receipt_id,paid.receipt.id);
    const laterPage = (await db.query("select * from public.pos_list_money_movements(null,null,1)")).rows;
    assert.equal(laterPage.length,1);
    assert.equal(laterPage[0].movement_type,"vuelto");
    assert.equal((await closeWithExcess("efectivo",120,"",false)).rows[0].data.receipt.id,paid.receipt.id);
    await db.exec(`set test.actor = '${seller}'`);
    await assert.rejects(db.query("select * from public.pos_list_money_movements(null,null,0)"),/Acceso de caja/);
  } finally { await db.close(); }
});

test("pagos electrónicos con excedente requieren comentario y confirmación en ambas monedas", async () => {
  for (const { currency, methods, expected, received } of [
    { currency: "bolivares", methods: ["pago_movil", "transferencia", "tarjeta"], expected: 5080, received: 5100 },
    { currency: "divisas", methods: ["binance", "zinli"], expected: 114, received: 120 },
  ]) {
    const db = await fixture();
    try {
      await save(db,1,currency);
      for (const migration of ["20261126110000_pos_payment_tender.sql", "20261126120000_pos_excess_and_cash_movements.sql"]) {
        await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), "utf8"));
      }
      await db.exec("set role authenticated");
      const closeWithExcess = (method, comment, confirmed) => db.query(
        "select public.pos_close_order_with_excess($1,2,$2,$3,$4,'REF',(now() at time zone 'America/Caracas')::date,$5,$6,$7,$8) as data",
        [order,key,currency,method,comment,expected,received,confirmed],
      );
      for (const method of methods) {
        await assert.rejects(closeWithExcess(method,"",true),/comentario/);
        await assert.rejects(closeWithExcess(method," \n\t ",true),/comentario/);
        await assert.rejects(closeWithExcess(method,"Diferencia confirmada",false),/Confirma/);
      }
      const paid = (await closeWithExcess(methods[0],"Diferencia confirmada",true)).rows[0].data;
      assert.equal(paid.receipt.payment.amount,expected);
      assert.equal(paid.receipt.payment.received_amount,received);
      assert.equal(paid.receipt.payment.change_amount,0);
      assert.equal(paid.receipt.payment.comment,"Diferencia confirmada");
      assert.equal((await closeWithExcess(methods[0],"Diferencia confirmada",true)).rows[0].data.receipt.id,paid.receipt.id);
      await assert.rejects(closeWithExcess(methods[0],"Diferencia confirmada",false),/confirmacion no coincide/);
      const movements = (await db.query("select * from public.pos_list_money_movements(null,null,0)")).rows;
      assert.equal(movements.length,1);
      assert.equal(movements[0].movement_type,"ingreso");
      assert.equal(Number(movements[0].amount),received);
      await db.exec("reset role");
      assert.equal((await db.query("select excess_confirmed from public.pos_payment_tender")).rows[0].excess_confirmed,true);
      assert.equal(Number((await db.query("select amount from public.pos_receipts")).rows[0].amount),expected);
    } finally { await db.close(); }
  }
});

test("vuelto en efectivo de bolívares registra entrada y salida separadas", async () => {
  const db = await fixture();
  try {
    await save(db,1,"bolivares");
    for (const migration of ["20261126110000_pos_payment_tender.sql", "20261126120000_pos_excess_and_cash_movements.sql"]) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), "utf8"));
    }
    await db.exec("set role authenticated");
    const paid = (await db.query("select public.pos_close_order_with_excess($1,2,$2,'bolivares','efectivo','',(now() at time zone 'America/Caracas')::date,'',5080,5200,false) as data",[order,key])).rows[0].data;
    assert.equal(paid.receipt.payment.amount,5080);
    assert.equal(paid.receipt.payment.received_amount,5200);
    assert.equal(paid.receipt.payment.change_amount,120);
    const movements = (await db.query("select * from public.pos_list_money_movements(null,null,0)")).rows;
    assert.deepEqual(movements.map(movement => movement.movement_type),["ingreso","vuelto"]);
    assert.deepEqual(movements.map(movement => Number(movement.amount)),[5200,120]);
    assert.ok(movements.every(movement => movement.currency === "bolivares" && movement.receipt_id === paid.receipt.id));
  } finally { await db.close(); }
});

test("recibos y movimientos filtran fecha y moneda antes de paginar", async () => {
  const db = await fixture();
  const secondOrder = "00000000-0000-4000-8000-000000000012";
  const secondKey = "00000000-0000-4000-8000-000000000013";
  try {
    await save(db,1,"bolivares");
    for (const migration of ["20261126110000_pos_payment_tender.sql", "20261126120000_pos_excess_and_cash_movements.sql", "20261126130000_pos_receipt_transaction_filters.sql"]) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), "utf8"));
    }
    const paid = (await db.query("select public.pos_close_order_with_excess($1,2,$2,'bolivares','efectivo','',date '2026-11-20','',5080,5200,false) as data",[order,key])).rows[0].data;
    await db.exec(`insert into public.seller_orders(id,seller_id,payment_method,total_usd,idempotency_key,request_hash,expires_at,customer_name,customer_id)
      values('${secondOrder}','${secondSeller}','efectivo',0,'${secondKey}',sha256('filters'::bytea),now()+interval '30 minutes','Cliente Dos','87654321');`);
    await db.query("select public.pos_save_order($1,1,'divisas',$2)",[secondOrder,JSON.stringify([{kind:"variant",id:variant,quantity:1}])]);
    await db.query("select public.pos_close_order_with_excess($1,2,$2,'divisas','efectivo','',date '2026-11-21','',10,10,false)",[secondOrder,secondKey]);
    await db.exec("set role authenticated");
    const receipts = async (search, from, to, currency, offset = 0) => (await db.query("select public.pos_list_receipts_filtered($1,$2,$3,$4,$5) as data",[search,from,to,currency,offset])).rows[0].data;
    const movements = async (from, to, currency, offset = 0) => (await db.query("select * from public.pos_list_money_movements_filtered($1,$2,$3,$4)",[from,to,currency,offset])).rows;
    assert.equal((await receipts("",null,null,null)).length,2);
    assert.equal((await receipts("",null,null,"bolivares"))[0].id,order);
    assert.equal((await receipts("",null,null,"divisas"))[0].id,secondOrder);
    assert.equal((await receipts("", "2026-11-20", "2026-11-20", null))[0].id,order);
    assert.equal((await receipts("Cliente Dos",null,null,null))[0].id,secondOrder);
    assert.equal((await receipts(paid.receipt.id.slice(0,8),null,null,null))[0].id,order);
    assert.equal((await receipts("",null,null,"bolivares",1)).length,0);
    assert.equal((await movements(null,null,"bolivares")).length,2);
    assert.deepEqual((await movements(null,null,"bolivares")).map(row => row.movement_type),["ingreso","vuelto"]);
    assert.equal((await movements("2026-11-21","2026-11-21",null)).length,1);
    assert.equal((await movements(null,null,"divisas"))[0].order_id,secondOrder);
    assert.equal((await movements(null,null,"bolivares",1))[0].movement_type,"vuelto");
    await db.exec(`reset role;
      with generated_orders as (
        insert into public.seller_orders(id,seller_id,status,payment_method,total_usd,idempotency_key,request_hash,expires_at,completed_at,customer_name)
        select gen_random_uuid(),'${seller}','completada','efectivo',1,gen_random_uuid(),sha256('pagination'::bytea),now(),now(),'Cliente Lote'
        from generate_series(1,26) returning id
      )
      insert into public.pos_receipts(order_id,cashier_id,idempotency_key,request_hash,currency,method,paid_on,comment,amount,snapshot)
      select id,'${cashier}',gen_random_uuid(),sha256('pagination'::bytea),'divisas','efectivo',date '2026-11-25','',1,'{}'::jsonb
      from generated_orders;
      set role authenticated;`);
    assert.equal((await receipts("",null,null,null)).length,25);
    assert.equal((await receipts("",null,null,"bolivares"))[0].id,order);
    assert.equal((await movements(null,null,"bolivares")).length,2);
    await assert.rejects(receipts("",null,null,"otra"),/Filtro de recibos invalido/);
    await assert.rejects(movements("2026-11-21","2026-11-20",null),/Filtro de transacciones invalido/);
    await db.exec(`set test.actor = '${seller}'`);
    await assert.rejects(receipts("",null,null,null),/Acceso de caja/);
    await assert.rejects(movements(null,null,null),/Acceso de caja/);
    await db.exec("set role anon");
    await assert.rejects(receipts("",null,null,null),/permission denied/i);
    await assert.rejects(movements(null,null,null),/permission denied/i);
  } finally { await db.close(); }
});

test("filtros POS validan fechas inclusivas y moneda", () => {
  assert.deepEqual(parsePosFilters({}), { from: "", to: "", currency: "", valid: true });
  assert.equal(parsePosFilters({ desde: "2026-11-01", hasta: "2026-11-30", moneda: "divisas" }).valid, true);
  assert.equal(parsePosFilters({ desde: "2026-11-26", hasta: "2026-11-26", moneda: "bolivares" }).valid, true);
  for (const params of [{ desde: "2026-02-30" }, { desde: "2026-11-30", hasta: "2026-11-01" }, { moneda: "otra" }, { moneda: ["divisas", "bolivares"] }]) {
    assert.equal(parsePosFilters(params).valid, false);
  }
});