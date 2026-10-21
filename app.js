/**
 * ==========================================================================
 * ROUMIX - JAVASCRIPT GLOBAL & MODULAR
 * Control de roles (Estudiante / Propietario), LocalStorage y Navegación
 * ==========================================================================
 */

// 1. Inmuebles iniciales por defecto (Villavicencio - Estudiantes)
const INMUEBLES_DEFAULT = [
  {
    id: 1,
    titulo: "Habitación amoblada en apartaestudio",
    tipo: "habitacion",
    tipoLabel: "Habitación",
    precio: 420000,
    precioFormato: "$420.000",
    barrio: "La Grama",
    universidad: "Santo Tomás",
    distanciaTexto: "La Grama · 750m de Santo Tomás · 9 min a pie",
    distanciaMetros: 750,
    estrato: 3,
    area: "14 m²",
    tiempoPie: "9 min",
    transporte: "Ruta bus a 1 cuadra",
    amenidades: ["Wifi", "Amoblada", "Baño privado"],
    disponible: true,
    lat: 4.1535,
    lng: -73.6360,
    imagen: "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=1000&q=80",
    galeria: [
      "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=1000&q=80",
      "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=600&q=80"
    ],
    propietario: {
      nombre: "Marta Ruiz",
      iniciales: "MR",
      telefono: "573108845612",
      verificado: true,
      tiempoRespuesta: "responde en 2 h"
    },
    descripcion: "Excelente habitación privada dentro de un apartaestudio compartido enfocado exclusivamente en estudiantes. Cuenta con todos los servicios incluidos en el canon mensual (agua, luz, gas, internet de alta velocidad de 200 megas). Ubicada en un sector residencial muy seguro de La Grama, a pocos minutos caminando de la U. Santo Tomás y con acceso inmediato a transporte público hacia el centro de la ciudad.",
    deposito: "$420.000 (un mes)",
    contratoMinimo: "6 meses",
    disponibleDesde: "Inmediato"
  },
  {
    id: 2,
    titulo: "Apartaestudio moderno tipo loft",
    tipo: "apartaestudio",
    tipoLabel: "Apartaestudio",
    precio: 650000,
    precioFormato: "$650.000",
    barrio: "El Barzal",
    universidad: "Santo Tomás",
    distanciaTexto: "El Barzal · 1.2 km de Santo Tomás · 15 min a pie",
    distanciaMetros: 1200,
    estrato: 4,
    area: "28 m²",
    tiempoPie: "15 min",
    transporte: "A 3 cuadras y ciclorruta",
    amenidades: ["Cocina integral", "Wifi", "Baño privado", "Parqueadero"],
    disponible: true,
    lat: 4.1480,
    lng: -73.6310,
    imagen: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1000&q=80",
    galeria: [
      "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1000&q=80",
      "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=600&q=80"
    ],
    propietario: {
      nombre: "Andrés Beltrán",
      iniciales: "AB",
      telefono: "573123456789",
      verificado: true,
      tiempoRespuesta: "responde en 1 h"
    },
    descripcion: "Apartaestudio independiente de ambiente exclusivo en El Barzal. Cuenta con acabados modernos, cocina integral, closet amplio, balcón con vista y acceso seguro con cerradura digital.",
    deposito: "$650.000 (un mes)",
    contratoMinimo: "6 meses",
    disponibleDesde: "Inmediato"
  },
  {
    id: 3,
    titulo: "Habitación individual cerca al campus",
    tipo: "habitacion",
    tipoLabel: "Habitación",
    precio: 380000,
    precioFormato: "$380.000",
    barrio: "La Grama",
    universidad: "Santo Tomás",
    distanciaTexto: "La Grama · 500m de Santo Tomás · 6 min a pie",
    distanciaMetros: 500,
    estrato: 3,
    area: "12 m²",
    tiempoPie: "6 min",
    transporte: "Ruta universitaria directa",
    amenidades: ["Wifi", "Amoblada", "Lavandería"],
    disponible: true,
    lat: 4.1560,
    lng: -73.6375,
    imagen: "https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=1000&q=80",
    galeria: ["https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=1000&q=80"],
    propietario: {
      nombre: "Gladys Rodríguez",
      iniciales: "GR",
      telefono: "573159988776",
      verificado: true,
      tiempoRespuesta: "responde en 3 h"
    },
    descripcion: "Habitación cómoda para estudiante, ambiente silencioso ideal para estudiar, derecho a cocina y zona de ropas con lavadora.",
    deposito: "$380.000 (un mes)",
    contratoMinimo: "3 meses",
    disponibleDesde: "Inmediato"
  },
  {
    id: 4,
    titulo: "Apartamento compartido de 2 alcobas",
    tipo: "apartamento",
    tipoLabel: "Apartamento",
    precio: 700000,
    precioFormato: "$700.000",
    barrio: "San Benito",
    universidad: "Santo Tomás",
    distanciaTexto: "San Benito · 900m de Santo Tomás · 11 min a pie",
    distanciaMetros: 900,
    estrato: 3,
    area: "45 m²",
    tiempoPie: "11 min",
    transporte: "Busetas continuas",
    amenidades: ["2 Habitaciones", "Cocina", "Wifi", "Bicicletero"],
    disponible: true,
    lat: 4.1440,
    lng: -73.6390,
    imagen: "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=1000&q=80",
    galeria: ["https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=1000&q=80"],
    propietario: {
      nombre: "Carlos Julio Rincón",
      iniciales: "CR",
      telefono: "573204445566",
      verificado: true,
      tiempoRespuesta: "responde en 4 h"
    },
    descripcion: "Ideal para 2 compañeros que deseen compartir gastos. Espacioso, seguro, con sala comedor amplia y zona de estudio.",
    deposito: "$700.000 (un mes)",
    contratoMinimo: "6 meses",
    disponibleDesde: "Inmediato"
  }
];

// 2. Módulo de Almacenamiento Local (LocalStorage)
const RoumixStorage = {
  getInmuebles: function() {
    try {
      const guardados = localStorage.getItem("roumix_inmuebles");
      if (guardados) {
        return JSON.parse(guardados);
      }
    } catch (e) {
      console.warn("No se pudo leer de localStorage", e);
    }
    localStorage.setItem("roumix_inmuebles", JSON.stringify(INMUEBLES_DEFAULT));
    return [...INMUEBLES_DEFAULT];
  },

  guardarInmueble: function(nuevo) {
    const lista = this.getInmuebles();
    lista.unshift(nuevo);
    localStorage.setItem("roumix_inmuebles", JSON.stringify(lista));
    return lista;
  },

  getInmueblePorId: function(id) {
    const lista = this.getInmuebles();
    return lista.find(item => Number(item.id) === Number(id)) || lista[0];
  },

  getUsuario: function() {
    try {
      const u = localStorage.getItem("roumix_usuario");
      return u ? JSON.parse(u) : { rol: "estudiante", nombre: "Estudiante" };
    } catch (e) {
      return { rol: "estudiante", nombre: "Estudiante" };
    }
  },

  setUsuario: function(usuario) {
    localStorage.setItem("roumix_usuario", JSON.stringify(usuario));
  },

  cerrarSesion: function() {
    localStorage.removeItem("roumix_usuario");
    window.location.href = "index.html";
  }
};

// 3. Formateador de moneda colombiana
function formatearPrecioCOP(valor) {
  return "$" + Number(valor).toLocaleString("es-CO");
}

// 4. Modal de Contacto por WhatsApp (Compartido)
function abrirModalContacto(id) {
  const inmueble = RoumixStorage.getInmueblePorId(id);
  if (!inmueble) return;

  const modal = document.getElementById("modal-contacto");
  if (!modal) return;

  const propNombre = document.getElementById("modal-prop-nombre");
  const propDueno = document.getElementById("modal-prop-dueno");
  const textMensaje = document.getElementById("modal-mensaje-wa");
  const btnWhatsApp = document.getElementById("modal-btn-whatsapp");

  if (propNombre) propNombre.textContent = `${inmueble.titulo} — ${inmueble.precioFormato}/mes`;
  if (propDueno) propDueno.textContent = `${inmueble.propietario.nombre} (Arrendador verificado)`;

  const mensajePredeterminado = `Hola ${inmueble.propietario.nombre}, vi en Roumix tu publicación de "${inmueble.titulo}" en ${inmueble.barrio} por ${inmueble.precioFormato}. Soy estudiante universitario y me gustaría consultar disponibilidad y coordinar una visita. ¡Muchas gracias!`;
  
  if (textMensaje) textMensaje.value = mensajePredeterminado;

  if (btnWhatsApp) {
    btnWhatsApp.href = `https://wa.me/${inmueble.propietario.telefono}?text=${encodeURIComponent(mensajePredeterminado)}`;
  }

  modal.classList.add("open");
}

function cerrarModalContacto() {
  const modal = document.getElementById("modal-contacto");
  if (modal) modal.classList.remove("open");
}

// 5. Renderizado inteligente y homogéneo de la barra de navegación según el rol
function sincronizarBarraNavegacion() {
  const header = document.querySelector(".main-header");
  if (!header) return;

  // Si estamos en la página de login (index.html o iniciarsesion.html), no renderizamos menú de usuario
  const esPaginaLogin = window.location.pathname.endsWith("index.html") || 
                        window.location.pathname.endsWith("iniciarsesion.html") || 
                        window.location.pathname.endsWith("/");
  if (document.body.classList.contains("page-login") || (esPaginaLogin && document.getElementById("form-auth"))) {
    return;
  }

  const usuario = RoumixStorage.getUsuario();
  const esPropietario = usuario && usuario.rol === "propietario";
  const paginaActual = window.location.pathname.split("/").pop() || "buscar.html";

  // Obtenemos los contenedores de nav
  const navContainer = header.querySelector(".nav-links");
  const rightContainer = header.querySelector(".header-right");

  if (navContainer) {
    // Si es propietario: Inicio, Buscar, Publicar, Mis publicaciones, Cómo funciona, Comparar
    // Si es estudiante: Inicio, Buscar, Cómo funciona, Comparar (SIN 'Detalle')
    if (esPropietario) {
      navContainer.innerHTML = `
        <li><a href="buscar.html" class="nav-link ${paginaActual === 'buscar.html' ? 'active' : ''}">Inicio</a></li>
        <li><a href="buscar.html" class="nav-link">Buscar</a></li>
        <li><a href="publicar.html" class="nav-link ${paginaActual === 'publicar.html' ? 'active' : ''}">Publicar</a></li>
        <li><a href="mis-publicaciones.html" class="nav-link ${paginaActual === 'mis-publicaciones.html' ? 'active' : ''}">Mis publicaciones</a></li>
        <li><a href="como-funciona.html" class="nav-link ${paginaActual === 'como-funciona.html' ? 'active' : ''}">Cómo funciona</a></li>
        <li><a href="comparar.html" class="nav-link ${paginaActual === 'comparar.html' ? 'active' : ''}">Comparar</a></li>
      `;
    } else {
      navContainer.innerHTML = `
        <li><a href="buscar.html" class="nav-link ${paginaActual === 'buscar.html' ? 'active' : ''}">Inicio</a></li>
        <li><a href="buscar.html" class="nav-link">Buscar</a></li>
        <li><a href="como-funciona.html" class="nav-link ${paginaActual === 'como-funciona.html' ? 'active' : ''}">Cómo funciona</a></li>
        <li><a href="comparar.html" class="nav-link ${paginaActual === 'comparar.html' ? 'active' : ''}">Comparar</a></li>
      `;
    }
  }

  if (rightContainer) {
    const rolTexto = esPropietario ? "Propietario" : "Estudiante";
    rightContainer.innerHTML = `
      <span class="user-role-badge">${rolTexto}</span>
      <a href="index.html" class="btn-logout-pill" onclick="RoumixStorage.cerrarSesion(); return false;">Cerrar sesión</a>
    `;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  sincronizarBarraNavegacion();

  const btnCerrar = document.getElementById("btn-cerrar-modal");
  if (btnCerrar) {
    btnCerrar.addEventListener("click", cerrarModalContacto);
  }

  const modal = document.getElementById("modal-contacto");
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) cerrarModalContacto();
    });
  }
});
