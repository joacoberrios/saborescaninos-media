(() => {
  const T = window.TIENDA;
  const POR_PAGINA = 24;
  const $ = (s) => document.querySelector(s);
  const pesos = (n) => "$" + Math.round(n).toLocaleString("es-AR");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let datos = { productos: [] };
  let filtro = { cat: "todos", texto: "", marca: "", orden: "" };
  let mostrados = POR_PAGINA;
  let carrito = leer();

  // ---------- Carrito (persistente en el navegador) ----------
  function leer() {
    try { return JSON.parse(localStorage.getItem("sc-carrito")) || []; } catch { return []; }
  }
  function guardar() {
    try { localStorage.setItem("sc-carrito", JSON.stringify(carrito)); } catch { /* sin almacenamiento */ }
  }
  const precioFinal = (v) => v.oferta || v.precio;

  function buscarVariante(vid) {
    for (const p of datos.productos) {
      const v = p.variantes.find((x) => x.id === vid);
      if (v) return { p, v };
    }
    return null;
  }

  function agregar(vid) {
    const it = carrito.find((x) => x.vid === vid);
    if (it) it.cant++;
    else carrito.push({ vid, cant: 1 });
    guardar();
    pintarCarrito();
    aviso("Agregado al pedido 🐾");
  }

  function cambiar(vid, delta) {
    const it = carrito.find((x) => x.vid === vid);
    if (!it) return;
    it.cant += delta;
    if (it.cant <= 0) carrito = carrito.filter((x) => x.vid !== vid);
    guardar();
    pintarCarrito();
  }

  function zonaElegida() {
    return T.zonas.find((z) => z.nombre === $("#selZona").value);
  }

  function calcular() {
    const lineas = carrito.map((it) => ({ ...it, ...buscarVariante(it.vid) })).filter((l) => l.v);
    const subtotal = lineas.reduce((s, l) => s + precioFinal(l.v) * l.cant, 0);
    const ahorro = lineas.reduce((s, l) => s + (l.v.oferta ? (l.v.precio - l.v.oferta) * l.cant : 0), 0);
    let envio = null;
    const z = zonaElegida();
    if (T.envioGratisDesde != null && subtotal >= T.envioGratisDesde) envio = 0;
    else if (z && z.costo != null) envio = z.costo;
    return { lineas, subtotal, ahorro, envio, total: subtotal + (envio || 0) };
  }

  function pintarCarrito() {
    const { lineas, subtotal, ahorro, envio, total } = calcular();
    $("#contador").textContent = lineas.reduce((s, l) => s + l.cant, 0);
    $("#items").innerHTML = lineas.length
      ? lineas.map((l) => `
        <div class="item">
          ${l.p.imagen ? `<img src="${esc(l.p.imagen)}" alt="" loading="lazy">` : `<div class="ph">🐶</div>`}
          <div>
            <div class="nom">${esc(l.p.nombre)}</div>
            <div class="sub">${esc(l.v.nombre)} · ${pesos(precioFinal(l.v))}</div>
          </div>
          <div class="cant">
            <button type="button" data-menos="${l.vid}" aria-label="Quitar uno">−</button>
            <span>${l.cant}</span>
            <button type="button" data-mas="${l.vid}" aria-label="Agregar uno">+</button>
          </div>
        </div>`).join("")
      : `<p class="vacio">Tu pedido está vacío.<br>Agregá productos del catálogo 🐾</p>`;

    let envioTxt = "A confirmar";
    if (envio === 0) envioTxt = "¡Gratis!";
    else if (envio != null) envioTxt = pesos(envio);
    else if (!zonaElegida()) envioTxt = "Elegí tu zona";
    $("#totales").innerHTML = lineas.length ? `
      <div class="fila"><span>Subtotal</span><span>${pesos(subtotal)}</span></div>
      ${ahorro ? `<div class="fila" style="color:var(--verde)"><span>Ahorrás</span><span>${pesos(ahorro)}</span></div>` : ""}
      <div class="fila"><span>Envío</span><span>${envioTxt}</span></div>
      <div class="fila total"><span>Total</span><span>${pesos(total)}</span></div>
      ${T.envioGratisDesde != null && subtotal < T.envioGratisDesde ? `<div class="suave">Te faltan ${pesos(T.envioGratisDesde - subtotal)} para el envío gratis</div>` : ""}` : "";
    $("#btnEnviar").disabled = !lineas.length || !T.whatsapp;
  }

  // ---------- Pedido por WhatsApp ----------
  function enviarPedido(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    const { lineas, subtotal, ahorro, envio, total } = calcular();
    if (!lineas.length || !T.whatsapp) return;
    const nro = "SC-" + new Date().toISOString().slice(2, 16).replace(/\D/g, "");
    const msg = [
      `¡Hola ${T.nombre}! 🐾 Quiero hacer este pedido (${nro}):`,
      "",
      ...lineas.map((l) => `• ${l.cant} x ${l.p.nombre}${l.v.nombre ? " (" + l.v.nombre + ")" : ""} — ${pesos(precioFinal(l.v) * l.cant)}`),
      "",
      `Subtotal: ${pesos(subtotal)}`,
      ahorro ? `Ahorro por oferta: ${pesos(ahorro)}` : null,
      `Envío: ${envio === 0 ? "gratis" : envio != null ? pesos(envio) : "a confirmar"}`,
      `*Total: ${pesos(total)}*`,
      "",
      `Nombre: ${f.get("nombre")}`,
      `Teléfono: ${f.get("telefono")}`,
      `Dirección: ${f.get("direccion")} (${f.get("zona")})`,
      `Pago: ${f.get("pago")}`,
      f.get("horario") ? `Horario: ${f.get("horario")}` : null,
      f.get("notas") ? `Notas: ${f.get("notas")}` : null,
    ].filter((x) => x !== null).join("\n");
    window.open(`https://wa.me/${T.whatsapp}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
  }

  // ---------- Catálogo ----------
  function filtrados() {
    const txt = filtro.texto.toLowerCase();
    let lista = datos.productos.filter((p) => {
      if (filtro.cat === "ofertas" && !p.variantes.some((v) => v.oferta)) return false;
      if (!["todos", "ofertas"].includes(filtro.cat) && p.categoria !== filtro.cat) return false;
      if (filtro.marca && p.marca !== filtro.marca) return false;
      if (txt && !(p.nombre + " " + p.marca).toLowerCase().includes(txt)) return false;
      return true;
    });
    const min = (p) => Math.min(...p.variantes.map(precioFinal));
    if (filtro.orden === "menor") lista.sort((a, b) => min(a) - min(b));
    if (filtro.orden === "mayor") lista.sort((a, b) => min(b) - min(a));
    if (filtro.orden === "nombre") lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
    return lista;
  }

  function tarjeta(p) {
    const v = p.variantes[0];
    const pct = (x) => Math.round((1 - x.oferta / x.precio) * 100);
    return `
      <article class="producto" data-id="${p.id}">
        ${v.oferta ? `<span class="cinta">-${pct(v)}%</span>` : ""}
        <div class="foto">${p.imagen ? `<img src="${esc(p.imagen)}" alt="${esc(p.nombre)}" loading="lazy">` : "🐶"}</div>
        <div class="cuerpo">
          <span class="marca">${esc(p.marca)}</span>
          <h3>${esc(p.nombre)}</h3>
          ${p.variantes.length > 1 ? `<select data-var aria-label="Presentación">${p.variantes.map((x) => `<option value="${x.id}">${esc(x.nombre)}</option>`).join("")}</select>` : ""}
          <div class="precio">${precioHtml(v)}</div>
          <button class="btn" data-agregar="${v.id}">Agregar</button>
        </div>
      </article>`;
  }
  function precioHtml(v) {
    return v.oferta
      ? `<span class="actual">${pesos(v.oferta)}</span><span class="antes">${pesos(v.precio)}</span>`
      : `<span class="actual">${pesos(v.precio)}</span>`;
  }

  function pintarCatalogo() {
    const lista = filtrados();
    $("#grilla").innerHTML = lista.slice(0, mostrados).map(tarjeta).join("");
    $("#resultado").textContent = `${lista.length} producto${lista.length === 1 ? "" : "s"}`;
    $("#verMas").hidden = lista.length <= mostrados;
  }

  function cambiarFiltro(cambios) {
    Object.assign(filtro, cambios);
    mostrados = POR_PAGINA;
    document.querySelectorAll("#chips button").forEach((b) => b.classList.toggle("activo", b.dataset.cat === filtro.cat));
    pintarCatalogo();
  }

  // ---------- Info del negocio ----------
  function pintarInfo() {
    $("#listaZonas").innerHTML = T.zonas.map((z) => `<li>${esc(z.nombre)}${z.costo === 0 ? " — gratis" : z.costo ? " — " + pesos(z.costo) : ""}</li>`).join("");
    $("#txtGratis").textContent = T.envioGratisDesde != null ? `En compras desde ${pesos(T.envioGratisDesde)}.` : "Consultanos por WhatsApp.";
    $("#txtDias").textContent = T.diasEntrega;
    $("#txtPlazo").textContent = "Entrega: " + T.plazoEntrega;
    $("#txtPagos").textContent = T.mediosDePago.join(" · ");
    $("#selZona").innerHTML += T.zonas.map((z) => `<option>${esc(z.nombre)}</option>`).join("");
    $("#selPago").innerHTML += T.mediosDePago.map((m) => `<option>${esc(m)}</option>`).join("");
    $("#linkIg").href = `https://www.instagram.com/${T.instagram}/`;
    if (T.whatsapp) $("#linkWa").href = `https://wa.me/${T.whatsapp}`;
    else $("#sepWa").hidden = true;
    $("#avisoWa").textContent = T.whatsapp ? "Se abre WhatsApp con tu pedido listo para enviar." : "Pedidos online disponibles muy pronto.";
  }

  // ---------- Eventos ----------
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-agregar],[data-mas],[data-menos],[data-cat],[data-filtro]");
    if (!t) return;
    if (t.dataset.agregar) agregar(Number(t.dataset.agregar));
    if (t.dataset.mas) cambiar(Number(t.dataset.mas), 1);
    if (t.dataset.menos) cambiar(Number(t.dataset.menos), -1);
    if (t.dataset.cat) cambiarFiltro({ cat: t.dataset.cat });
    if (t.dataset.filtro) {
      e.preventDefault();
      cambiarFiltro({ cat: t.dataset.filtro });
      $("#catalogo").scrollIntoView();
    }
  });
  document.addEventListener("change", (e) => {
    if (!e.target.matches("[data-var]")) return;
    const card = e.target.closest(".producto");
    const p = datos.productos.find((x) => x.id === Number(card.dataset.id));
    const v = p.variantes.find((x) => x.id === Number(e.target.value));
    card.querySelector(".precio").innerHTML = precioHtml(v);
    card.querySelector("[data-agregar]").dataset.agregar = v.id;
  });
  $("#buscar").addEventListener("input", (e) => cambiarFiltro({ texto: e.target.value }));
  $("#marca").addEventListener("change", (e) => cambiarFiltro({ marca: e.target.value }));
  $("#orden").addEventListener("change", (e) => cambiarFiltro({ orden: e.target.value }));
  $("#verMas").addEventListener("click", () => { mostrados += POR_PAGINA; pintarCatalogo(); });
  $("#selZona").addEventListener("change", pintarCarrito);
  $("#formPedido").addEventListener("submit", enviarPedido);

  const abrir = (si) => {
    $("#carrito").classList.toggle("abierto", si);
    $("#carrito").setAttribute("aria-hidden", String(!si));
    $("#velo").hidden = !si;
  };
  $("#abrirCarrito").addEventListener("click", () => abrir(true));
  $("#cerrarCarrito").addEventListener("click", () => abrir(false));
  $("#velo").addEventListener("click", () => abrir(false));

  let tt;
  function aviso(txt) {
    $("#toast").textContent = txt;
    $("#toast").classList.add("ver");
    clearTimeout(tt);
    tt = setTimeout(() => $("#toast").classList.remove("ver"), 1800);
  }

  // ---------- Inicio ----------
  pintarInfo();
  fetch("datos/productos.json", { cache: "no-cache" })
    .then((r) => r.json())
    .then((d) => {
      datos = d;
      $("#avisoMuestra").hidden = !d.muestra;
      $("#actualizado").textContent = d.actualizado;
      const marcas = [...new Set(d.productos.map((p) => p.marca).filter(Boolean))].sort();
      $("#marca").innerHTML += marcas.map((m) => `<option>${esc(m)}</option>`).join("");
      if (d.descuento_bolsas && d.productos.some((p) => p.variantes.some((v) => v.oferta))) {
        $("#badgePct").textContent = `${d.descuento_bolsas}%`;
        $("#badgeKg").textContent = d.kg_bolsa_grande;
        $("#badgeOferta").hidden = false;
      }
      carrito = carrito.filter((it) => buscarVariante(it.vid));
      pintarCatalogo();
      pintarCarrito();
    })
    .catch(() => { $("#resultado").textContent = "No pudimos cargar el catálogo. Probá recargar la página."; });
})();
