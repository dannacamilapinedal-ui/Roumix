/**
 * ============================================================================
 * ROUMIX - MAPAS (Leaflet + cartografía de OpenStreetMap)
 * Funciones compartidas por buscar.html, publicar.html y detalle.html.
 * Requiere cargar Leaflet antes que este archivo.
 * ============================================================================
 */

const RoumixMapa = {
  // Universidad Santo Tomás, sede Aguas Claras (Anillo Vial). Fuente: OpenStreetMap / Nominatim.
  CAMPUS_USTA: [4.1220, -73.6155],
  // Campus universitarios de Villavicencio. Coordenadas tomadas de OpenStreetMap (Nominatim).
  // "universidad" coincide con los valores del filtro de buscar.html.
  // La Universidad Antonio Nariño no aparece en OpenStreetMap: no se ubica para no inventar coordenadas.
  CAMPUS: [
    { universidad: "Santo Tomás", nombre: "Santo Tomás", sede: "Sede Aguas Claras", coords: [4.1220, -73.6155] },
    { universidad: "Unillanos", nombre: "Unillanos", sede: "Sede San Antonio", coords: [4.14615, -73.64307] },
    { universidad: "Unillanos", nombre: "Unillanos Barcelona", sede: "Sede Barcelona (vía a Puerto López)", coords: [4.07435, -73.58310] },
    { universidad: "Cooperativa", nombre: "Cooperativa", sede: "Universidad Cooperativa de Colombia", coords: [4.11611, -73.60918] },
    { universidad: "Uniminuto", nombre: "Uniminuto", sede: "Uniminuto Villavicencio", coords: [4.11273, -73.63418] }
  ],
  CENTRO_VILLAVICENCIO: [4.1420, -73.6266],
  // Radio de la zona aproximada que ven los estudiantes (la API pública redondea a ~100 m)
  RADIO_APROXIMADO_M: 250,

  disponible: function() {
    return typeof L !== "undefined";
  },

  /**
   * Crea un mapa con la capa de Roumix. Devuelve null si Leaflet no cargó.
   */
  crear: function(elemento, opciones = {}) {
    if (!this.disponible()) return null;
    const mapa = L.map(elemento, {
      center: opciones.centro || this.CENTRO_VILLAVICENCIO,
      zoom: opciones.zoom || 14,
      scrollWheelZoom: opciones.scrollWheelZoom ?? false,
      zoomControl: true
    });
    // Teselas de OpenStreetMap servidas por el backend de Roumix (con caché). Pedirlas
    // directamente desde el navegador falla con "403 Access blocked" cuando el navegador
    // no envía la cabecera Referer. (Las de CARTO dejaron de servirse sin clave.)
    const baseAPI = typeof RoumixAPI !== "undefined" ? RoumixAPI.baseURL : "/api";
    L.tileLayer(`${baseAPI}/mapa/teselas/{z}/{x}/{y}.png`, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">colaboradores de OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(mapa);
    return mapa;
  },

  /**
   * Marca todos los campus universitarios. "destacada" (valor del filtro) resalta esa universidad.
   */
  marcadoresCampus: function(mapa, destacada) {
    return this.CAMPUS.map((campus) => {
      const resaltado = destacada && destacada !== "todas" && campus.universidad === destacada;
      const icono = L.divIcon({
        className: "custom-div-icon",
        html: `<div class="map-pin-university${resaltado ? " map-pin-university-activa" : ""}">🎓 ${campus.nombre}</div>`,
        iconSize: [0, 0]
      });
      return L.marker(campus.coords, { icon: icono, keyboard: false, zIndexOffset: resaltado ? 500 : -100, title: campus.sede })
        .addTo(mapa)
        .bindPopup(`<strong>${campus.nombre}</strong><br>${campus.sede}`);
    });
  },

  // Compatibilidad: algunas páginas solo necesitan los campus sin resaltar
  marcadorCampus: function(mapa) {
    return this.marcadoresCampus(mapa);
  },

  // Coordenadas de los campus de la universidad elegida en el filtro (vacío si es "todas")
  coordsCampus: function(universidad) {
    if (!universidad || universidad === "todas") return [];
    return this.CAMPUS.filter((c) => c.universidad === universidad).map((c) => c.coords);
  },

  iconoPrecio: function(precio, id) {
    const precioK = Math.round(precio / 1000) + "k";
    return L.divIcon({
      className: "custom-div-icon",
      html: `<div class="map-pin-price" data-id="${Number(id)}">$${precioK}</div>`,
      iconSize: [68, 28],
      iconAnchor: [34, 14]
    });
  },

  /**
   * Mensaje en lugar del mapa cuando Leaflet o la cartografía no cargan
   */
  mostrarNoDisponible: function(elemento, texto) {
    elemento.innerHTML = "";
    const aviso = document.createElement("div");
    aviso.className = "mapa-no-disponible";
    aviso.setAttribute("role", "status");
    aviso.textContent = texto || "El mapa no está disponible en este momento.";
    elemento.appendChild(aviso);
  },

  /**
   * Selector de ubicación para propietarios: clic en el mapa o marcador arrastrable.
   * Muestra también la zona aproximada que verán los estudiantes.
   * opciones.alCambiar(lat, lng) se llama cada vez que cambia la ubicación.
   */
  selector: function(elemento, opciones = {}) {
    const mapa = this.crear(elemento, { zoom: 14, scrollWheelZoom: true });
    if (!mapa) return null;
    this.marcadorCampus(mapa);

    let marcador = null;
    let zona = null;
    const radio = this.RADIO_APROXIMADO_M;

    function colocar(lat, lng, centrar) {
      lat = Number(lat.toFixed(6));
      lng = Number(lng.toFixed(6));
      if (!marcador) {
        marcador = L.marker([lat, lng], { draggable: true, title: "Ubicación del inmueble (arrástrame)" }).addTo(mapa);
        marcador.on("dragend", () => {
          const p = marcador.getLatLng();
          colocar(p.lat, p.lng, false);
        });
        zona = L.circle([lat, lng], {
          radius: radio, color: "#3d7053", weight: 1.5, dashArray: "5 5", fillColor: "#3d7053", fillOpacity: 0.08
        }).addTo(mapa);
      } else {
        marcador.setLatLng([lat, lng]);
        zona.setLatLng([lat, lng]);
      }
      if (centrar) mapa.setView([lat, lng], 16);
      if (opciones.alCambiar) opciones.alCambiar(lat, lng);
    }

    mapa.on("click", (e) => colocar(e.latlng.lat, e.latlng.lng, false));

    return {
      mapa,
      colocar: (lat, lng) => colocar(Number(lat), Number(lng), true),
      centrar: (lat, lng) => mapa.setView([lat, lng], 16),
      obtener: () => (marcador ? { latitud: marcador.getLatLng().lat, longitud: marcador.getLatLng().lng } : null),
      refrescar: () => mapa.invalidateSize()
    };
  }
};
