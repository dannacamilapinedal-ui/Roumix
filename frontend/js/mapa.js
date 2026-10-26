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

  marcadorCampus: function(mapa) {
    const icono = L.divIcon({
      className: "custom-div-icon",
      html: '<div class="map-pin-university">🎓 Santo Tomás</div>',
      iconSize: [120, 32],
      iconAnchor: [60, 16]
    });
    return L.marker(this.CAMPUS_USTA, { icon: icono, keyboard: false, zIndexOffset: -100 })
      .addTo(mapa)
      .bindPopup("<strong>Universidad Santo Tomás</strong><br>Sede Aguas Claras");
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
