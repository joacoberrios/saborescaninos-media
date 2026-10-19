// Datos del negocio. Editar acá: la web los toma automáticamente.
window.TIENDA = {
  nombre: "Sabores Caninos",
  // WhatsApp de pedidos en formato internacional, sin + ni espacios: 549261XXXXXXX
  whatsapp: "",            // [COMPLETAR]
  instagram: "sabores.caninos",
  // Zonas de entrega y costo de envío (0 = gratis)
  zonas: [
    { nombre: "Capital", costo: null },      // [COMPLETAR costo]
    { nombre: "Godoy Cruz", costo: null },
    { nombre: "Guaymallén", costo: null },
    { nombre: "Las Heras", costo: null },
    { nombre: "Maipú", costo: null },
    { nombre: "Luján de Cuyo", costo: null },
  ],
  envioGratisDesde: 30000,
  diasEntrega: "[COMPLETAR: ej. lunes a sábado, 9 a 19 h]",
  plazoEntrega: "[COMPLETAR: ej. 24 a 48 h]",
  mediosDePago: ["Efectivo", "Transferencia", "Mercado Pago"], // [CONFIRMAR]
};
