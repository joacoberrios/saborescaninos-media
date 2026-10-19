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
    const pv = buscarVariante(vid);
    if (!pv || !pv.v.stock) return aviso("Ese producto está sin stock 😔");
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

  // ---------- Envío: $ por km desde el punto de salida ----------
  let destino = null; // { lat, lng, km }

  function haversineKm(a, b) {
    const r = (x) => (x * Math.PI) / 180;
    const d = Math.sin(r(b.lat - a.lat) / 2) ** 2 +
      Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(d));
  }

  async function kmPorCalle(desde, hasta) {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${desde.lng},${desde.lat};${hasta.lng},${hasta.lat}?overview=false`;
      const r = await (await fetch(url)).json();
      if (r.routes && r.routes[0]) return r.routes[0].distance / 1000;
    } catch { /* sin ruteo: se estima */ }
    return haversineKm(desde, hasta) * 1.3; // estimación por calle
  }

  async function geocodificar(texto) {
    const q = encodeURIComponent(texto);
    const r = await (await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ar&q=${q}`)).json();
    return r.length ? { lat: Number(r[0].lat), lng: Number(r[0].lon) } : null;
  }

  async function fijarDestino(punto, fuente) {
    if (!T.origen && T.direccionTienda) {
      try { T.origen = await geocodificar(`${T.direccionTienda}, Argentina`); } catch { /* queda a confirmar */ }
    }
    if (!T.origen) {
      destino = { ...punto, km: null };
      estadoEnvio("Ubicación guardada. Te confirmamos el costo del envío por WhatsApp.");
    } else {
      estadoEnvio("Calculando distancia…");
      const km = await kmPorCalle(T.origen, punto);
      destino = { ...punto, km };
      estadoEnvio(`${fuente}: ${km.toFixed(1)} km → ${pesos(costoEnvio(km))}`);
    }
    pintarCarrito();
  }

  async function calcularPorDireccion() {
    const dir = $("#inDireccion").value.trim();
    if (!dir) return estadoEnvio("Escribí tu dirección primero.");
    estadoEnvio("Buscando tu dirección…");
    try {
      const punto = await geocodificar(`${dir}, ${$("#selZona").value || ""}, Mendoza, Argentina`);
      if (!punto) return estadoEnvio("No encontramos la dirección. Probá con calle y número, o usá tu ubicación.");
      await fijarDestino(punto, "Tu dirección");
    } catch {
      estadoEnvio("No pudimos calcular ahora. Te confirmamos el envío por WhatsApp.");
    }
  }

  function calcularPorUbicacion() {
    if (!navigator.geolocation) return estadoEnvio("Tu navegador no permite compartir la ubicación.");
    estadoEnvio("Obteniendo tu ubicación…");
    navigator.geolocation.getCurrentPosition(
      (pos) => fijarDestino({ lat: pos.coords.latitude, lng: pos.coords.longitude }, "Tu ubicación"),
      () => estadoEnvio("No pudimos obtener tu ubicación. Probá con la dirección."),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  const costoEnvio = (km) => Math.ceil(km) * T.precioPorKm;
  const esRetiro = () => document.querySelector('[name=modo]:checked')?.value === "retiro";

  function cambiarModo() {
    const retiro = esRetiro();
    $("#camposEnvio").hidden = retiro;
    $("#txtRetiro").hidden = !retiro;
    $("#txtRetiro").textContent = `Retirás en ${T.direccionTienda}, ${$("#txtDias").textContent.replace(/\.$/, "").toLowerCase()}.`;
    $("#inDireccion").required = !retiro;
    $("#selZona").required = !retiro;
    $("#selDia").options[0].textContent = retiro ? "Día de retiro" : "Día de entrega";
    pintarCarrito();
  }
  const estadoEnvio = (txt) => { $("#estadoEnvio").textContent = txt; };

  function calcular() {
    const lineas = carrito.map((it) => ({ ...it, ...buscarVariante(it.vid) })).filter((l) => l.v);
    const subtotal = lineas.reduce((s, l) => s + precioFinal(l.v) * l.cant, 0);
    const ahorro = lineas.reduce((s, l) => s + (l.v.oferta ? (l.v.precio - l.v.oferta) * l.cant : 0), 0);
    const conOferta = lineas.some((l) => l.v.oferta);
    const gratis = subtotal >= T.envioGratisDesde && !(T.ofertasSinEnvioGratis && conOferta);
    let envio = null;
    if (gratis || esRetiro()) envio = 0;
    else if (destino && destino.km != null) envio = costoEnvio(destino.km);
    return { lineas, subtotal, ahorro, conOferta, envio, total: subtotal + (envio || 0) };
  }

  function pintarCarrito() {
    const { lineas, subtotal, ahorro, conOferta, envio, total } = calcular();
    $("#contador").textContent = lineas.reduce((s, l) => s + l.cant, 0);
    $("#items").innerHTML = lineas.length
      ? lineas.map((l) => `
        <div class="item">
          ${l.p.imagen ? `<img src="${esc(l.p.imagen)}" alt="" loading="lazy">` : `<div class="ph">🐶</div>`}
          <div>
            <div class="nom">${esc(l.p.nombre)}</div>
            <div class="sub">${esc(l.v.nombre)} · ${pesos(precioFinal(l.v))}${l.v.oferta ? " · oferta" : ""}</div>
          </div>
          <div class="cant">
            <button type="button" data-menos="${l.vid}" aria-label="Quitar uno">−</button>
            <span>${l.cant}</span>
            <button type="button" data-mas="${l.vid}" aria-label="Agregar uno">+</button>
          </div>
        </div>`).join("")
      : `<p class="vacio">Tu pedido está vacío.<br>Agregá productos del catálogo 🐾</p>`;

    let envioTxt = `${pesos(T.precioPorKm)}/km · calculalo abajo`;
    if (esRetiro()) envioTxt = "Retiro en tienda";
    else if (envio === 0) envioTxt = "¡Gratis!";
    else if (envio != null) envioTxt = pesos(envio);
    else if (destino) envioTxt = "A confirmar";
    let nota = "";
    if (esRetiro()) nota = "";
    else if (conOferta && T.ofertasSinEnvioGratis) nota = "Los pedidos con productos en oferta no tienen envío gratis.";
    else if (subtotal < T.envioGratisDesde) nota = `Te faltan ${pesos(T.envioGratisDesde - subtotal)} para el envío gratis.`;
    $("#totales").innerHTML = lineas.length ? `
      <div class="fila"><span>Subtotal</span><span>${pesos(subtotal)}</span></div>
      ${ahorro ? `<div class="fila" style="color:var(--verde)"><span>Ahorrás</span><span>${pesos(ahorro)}</span></div>` : ""}
      <div class="fila"><span>Envío</span><span>${envioTxt}</span></div>
      <div class="fila total"><span>Total</span><span>${pesos(total)}${envio == null ? " + envío" : ""}</span></div>
      ${nota ? `<div class="suave">${nota}</div>` : ""}` : "";
    $("#btnEnviar").disabled = !lineas.length || !T.whatsapp;
  }

  // Próximas fechas de entrega según los días configurados
  function proximasEntregas(n = 4) {
    const fechas = [];
    const d = new Date();
    d.setDate(d.getDate() + 1);
    while (fechas.length < n) {
      if (T.diasEntrega.includes(d.getDay())) {
        const txt = d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "numeric" });
        fechas.push(`${txt.charAt(0).toUpperCase() + txt.slice(1)} · ${T.horarioEntrega}`);
      }
      d.setDate(d.getDate() + 1);
    }
    return fechas;
  }

  // ---------- Pedido por WhatsApp ----------
  function enviarPedido(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    const { lineas, subtotal, ahorro, envio, total } = calcular();
    if (!lineas.length || !T.whatsapp) return;
    const retiro = esRetiro();
    let envioTxt = "a confirmar";
    if (retiro) envioTxt = "retiro en tienda";
    else if (envio === 0) envioTxt = "gratis";
    else if (envio != null) envioTxt = `${pesos(envio)} (${destino.km.toFixed(1)} km)`;
    const nro = "SC-" + new Date().toISOString().slice(2, 16).replace(/\D/g, "");
    const msg = [
      `¡Hola ${T.nombre}! 🐾 Quiero hacer este pedido (${nro}):`,
      "",
      ...lineas.map((l) => `• ${l.cant} x ${l.p.nombre}${l.v.nombre ? " (" + l.v.nombre + ")" : ""} — ${pesos(precioFinal(l.v) * l.cant)}`),
      "",
      `Subtotal: ${pesos(subtotal)}`,
      ahorro ? `Ahorro por oferta: ${pesos(ahorro)}` : null,
      `Envío: ${envioTxt}`,
      `*Total: ${pesos(total)}${envio == null ? " + envío" : ""}*`,
      "",
      `Nombre: ${f.get("nombre")}`,
      `Teléfono: ${f.get("telefono")}`,
      retiro ? `Retiro en: ${T.direccionTienda}` : `Dirección: ${f.get("direccion")} (${f.get("zona")})`,
      !retiro && destino ? `Ubicación: https://maps.google.com/?q=${destino.lat.toFixed(5)},${destino.lng.toFixed(5)}` : null,
      `${retiro ? "Retiro" : "Entrega"}: ${f.get("dia")}`,
      `Pago: ${f.get("pago")}`,
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
    const hayStock = (p) => (p.variantes.some((v) => v.stock) ? 0 : 1);
    lista.sort((a, b) => hayStock(a) - hayStock(b));
    const min = (p) => Math.min(...p.variantes.map(precioFinal));
    if (filtro.orden === "menor") lista.sort((a, b) => min(a) - min(b));
    if (filtro.orden === "mayor") lista.sort((a, b) => min(b) - min(a));
    if (filtro.orden === "nombre") lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
    if (filtro.orden) lista.sort((a, b) => hayStock(a) - hayStock(b));
    return lista;
  }

  function tarjeta(p) {
    const v = p.variantes.find((x) => x.oferta) || p.variantes.find((x) => x.stock) || p.variantes[0];
    const agotado = !p.variantes.some((x) => x.stock);
    const pct = (x) => Math.round((1 - x.oferta / x.precio) * 100);
    let cinta = "";
    if (agotado) cinta = `<span class="cinta gris">Sin stock</span>`;
    else if (v.oferta) cinta = `<span class="cinta">-${pct(v)}%</span>`;
    return `
      <article class="producto${agotado ? " agotado" : ""}" data-id="${p.id}">
        ${cinta}
        <div class="foto">${p.imagen ? `<img src="${esc(p.imagen)}" alt="${esc(p.nombre)}" loading="lazy">` : "🐶"}</div>
        <div class="cuerpo">
          <span class="marca">${esc(p.marca)}</span>
          <h3>${esc(p.nombre)}</h3>
          ${p.variantes.length > 1 ? `<select data-var aria-label="Presentación">${p.variantes.map((x) => `<option value="${x.id}"${x.id === v.id ? " selected" : ""}>${esc(x.nombre)}${x.stock ? "" : " (sin stock)"}</option>`).join("")}</select>` : ""}
          <div class="precio">${precioHtml(v)}</div>
          ${botonHtml(v)}
        </div>
      </article>`;
  }
  const fechaCorta = (iso) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
  function precioHtml(v) {
    return v.oferta
      ? `<span class="actual">${pesos(v.oferta)}</span><span class="antes">${pesos(v.precio)}</span><span class="vence">Oferta hasta el ${fechaCorta(v.oferta_hasta)}</span>`
      : `<span class="actual">${pesos(v.precio)}</span>`;
  }
  function botonHtml(v) {
    return v.stock
      ? `<button class="btn" data-agregar="${v.id}">Agregar</button>`
      : `<button class="btn" data-agregar="${v.id}" disabled>Sin stock</button>`;
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
    $("#listaZonas").innerHTML = T.zonas.map((z) => `<li>${esc(z)}</li>`).join("");
    $("#txtCosto").textContent = `${pesos(T.precioPorKm)} por km.`;
    $("#txtGratis").textContent = `En compras desde ${pesos(T.envioGratisDesde)}` +
      (T.ofertasSinEnvioGratis ? " (no aplica a pedidos con productos en oferta)." : ".");
    const nombresDias = T.diasEntrega.map((n) => ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"][n]);
    $("#txtDias").textContent = `${nombresDias.join(" y ").replace(/^./, (c) => c.toUpperCase())} de ${T.horarioEntrega}.`;
    $("#txtTienda").textContent = T.direccionTienda;
    $("#selZona").innerHTML += T.zonas.map((z) => `<option>${esc(z)}</option>`).join("");
    $("#selDia").innerHTML += proximasEntregas().map((d) => `<option>${esc(d)}</option>`).join("");
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
    card.querySelector("[data-agregar]").outerHTML = botonHtml(v);
  });
  $("#buscar").addEventListener("input", (e) => cambiarFiltro({ texto: e.target.value }));
  $("#marca").addEventListener("change", (e) => cambiarFiltro({ marca: e.target.value }));
  $("#orden").addEventListener("change", (e) => cambiarFiltro({ orden: e.target.value }));
  $("#verMas").addEventListener("click", () => { mostrados += POR_PAGINA; pintarCatalogo(); });
  document.querySelectorAll("[name=modo]").forEach((r) => r.addEventListener("change", cambiarModo));
  $("#btnCalcular").addEventListener("click", calcularPorDireccion);
  $("#btnUbicacion").addEventListener("click", calcularPorUbicacion);
  $("#inDireccion").addEventListener("input", () => { if (destino) { destino = null; estadoEnvio(""); pintarCarrito(); } });
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
      // Ofertas vencidas o sin stock no se muestran aunque el catálogo no se haya actualizado
      const hoy = new Date().toLocaleDateString("sv");
      d.productos.forEach((p) => p.variantes.forEach((v) => {
        if (v.oferta && (!v.stock || !v.oferta_hasta || v.oferta_hasta < hoy)) v.oferta = null;
      }));
      datos = d;
      $("#avisoMuestra").hidden = !d.muestra;
      $("#actualizado").textContent = d.actualizado;
      const marcas = [...new Set(d.productos.map((p) => p.marca).filter(Boolean))].sort();
      $("#marca").innerHTML += marcas.map((m) => `<option>${esc(m)}</option>`).join("");
      const enOferta = d.productos.flatMap((p) => p.variantes).filter((v) => v.oferta);
      if (enOferta.length) {
        const max = Math.max(...enOferta.map((v) => Math.round((1 - v.oferta / v.precio) * 100)));
        $("#badgePct").textContent = `-${max}%`;
        $("#badgeOferta").hidden = false;
      } else {
        document.querySelector('[data-filtro="ofertas"]').hidden = true;
      }
      carrito = carrito.filter((it) => { const pv = buscarVariante(it.vid); return pv && pv.v.stock; });
      pintarCatalogo();
      pintarCarrito();
    })
    .catch(() => { $("#resultado").textContent = "No pudimos cargar el catálogo. Probá recargar la página."; });
})();
