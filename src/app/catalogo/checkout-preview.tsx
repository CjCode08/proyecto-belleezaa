"use client";

import { useState } from "react";
import { venezuelaMunicipalities } from "@/lib/catalog/venezuela";

type Fulfillment = "delivery" | "envio_nacional" | "pickup";
type Payment = "bolivares" | "binance" | "efectivo";

const fieldClass = "mt-1 min-h-11 w-full rounded-lg border border-[#d9c6c8] bg-white px-3 py-2 text-[#1e1a1c]";

export function CheckoutPreview() {
  const [fulfillment, setFulfillment] = useState<Fulfillment>("pickup");
  const [payment, setPayment] = useState<Payment>("bolivares");
  const [state, setState] = useState("");
  const [municipality, setMunicipality] = useState("");

  function changeFulfillment(value: Fulfillment) {
    setFulfillment(value);
    if (value !== "pickup" && payment === "efectivo") setPayment("bolivares");
    if (value === "delivery" && state !== "Carabobo") {
      setState("Carabobo");
      setMunicipality("");
    }
  }

  return (
    <section aria-labelledby="checkout-title" className="mt-6 border-t border-[#efe6e8] pt-5">
      <h3 id="checkout-title" className="font-[family-name:var(--font-catalog-heading)] text-xl font-semibold">Datos para tu pedido</h3>
      <p className="mt-2 text-sm text-[#5b4041]">
        Formulario en preparación: tus datos aún no se guardan ni se envían.
      </p>
      <form onSubmit={(event) => event.preventDefault()}>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Nombre y apellido
          <input name="customerName" autoComplete="name" maxLength={120} required className={fieldClass} />
        </label>
        <label className="block text-sm font-medium">
          Teléfono
          <input name="customerPhone" type="tel" autoComplete="tel" maxLength={30} required className={fieldClass} />
        </label>
        <label className="block text-sm font-medium">
          Forma de entrega
          <select name="fulfillment" value={fulfillment} required onChange={(event) => {
            const value = event.target.value;
            if (value === "pickup" || value === "delivery" || value === "envio_nacional") changeFulfillment(value);
          }} className={fieldClass}>
            <option value="pickup">Retiro en tienda</option>
            <option value="delivery">Delivery</option>
            <option value="envio_nacional">Envío nacional</option>
          </select>
        </label>
        <label className="block text-sm font-medium">
          Método de pago
          <select name="payment" value={payment} required onChange={(event) => {
            const value = event.target.value;
            if (value === "bolivares" || value === "binance" || value === "efectivo") setPayment(value);
          }} className={fieldClass}>
            <option value="bolivares">Bolívares</option>
            <option value="binance">Binance</option>
            {fulfillment === "pickup" && <option value="efectivo">Efectivo</option>}
          </select>
        </label>
        {fulfillment !== "pickup" && (<>
          <label className="block text-sm font-medium">
            Estado
            <select name="state" value={state} required onChange={(event) => {
              const nextState = event.target.value;
              if (fulfillment === "delivery" && nextState !== "Carabobo") return;
              setState(nextState);
              setMunicipality("");
            }} className={fieldClass}>
              {fulfillment !== "delivery" && <option value="">Selecciona un estado</option>}
              {(fulfillment === "delivery" ? ["Carabobo"] : Object.keys(venezuelaMunicipalities).sort((a, b) => a.localeCompare(b, "es-VE"))).map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Municipio
            <select name="municipality" value={municipality} required disabled={!state} onChange={(event) => setMunicipality(event.target.value)} className={`${fieldClass} disabled:bg-[#f5ecee]`}>
              <option value="">Selecciona un municipio</option>
              {[...(venezuelaMunicipalities[state] ?? [])].sort((a, b) => a.localeCompare(b, "es-VE")).map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium">
              {fulfillment === "delivery" ? "Dirección para delivery" : "Datos para el envío nacional"}
              <textarea name="deliveryDetails" maxLength={500} rows={3} required aria-describedby="delivery-promotion" className={fieldClass}
                placeholder={fulfillment === "delivery" ? "Dirección y referencias" : "Ciudad, estado y datos necesarios para el envío"} />
            </label>
            <p id="delivery-promotion" className="mt-2 text-sm leading-6 text-[#92002a]">En pedidos mayores a $10, el delivery es gratis en San Diego, Naguanagua y Valencia, estado Carabobo.</p>
          </div>
        </>)}
      </div>
      <p className="mt-4 text-sm text-[#5b4041]">
        El costo de delivery o envío se acuerda con el vendedor y no está incluido en el total.
      </p>
      <button type="button" disabled className="mt-4 min-h-11 cursor-not-allowed rounded-lg bg-[#b50638] px-5 font-semibold text-white opacity-50">
        Envío de pedidos próximamente
      </button>
      </form>
    </section>
  );
}
