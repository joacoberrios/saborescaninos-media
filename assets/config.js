// Datos del negocio. Editar acá: la web los toma automáticamente.
window.TIENDA = {
  nombre: "Sabores Caninos",
  // WhatsApp de pedidos en formato internacional, sin + ni espacios
  whatsapp: "5492615166830",
  instagram: "sabores.caninos",
  // Punto de salida de los repartos para calcular los km: { lat: -32.9, lng: -68.8 }
  origen: null,            // [COMPLETAR]
  precioPorKm: 200,
  envioGratisDesde: 30000,
  ofertasSinEnvioGratis: true, // los pedidos con productos en oferta pagan envío
  zonas: ["Capital", "Godoy Cruz", "Guaymallén", "Las Heras", "Maipú", "Luján de Cuyo"],
  // Días de entrega (0 = domingo … 6 = sábado)
  diasEntrega: [3, 5],
  horarioEntrega: "15 a 19 h",
  mediosDePago: ["Efectivo", "Transferencia", "Mercado Pago"], // [CONFIRMAR]
};
