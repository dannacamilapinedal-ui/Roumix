/**
 * ROUMIX - Landing (inicio.html)
 * Animaciones de presentación y datos reales de la API (inmuebles y universidades).
 * Todo respeta "reducir movimiento" del sistema.
 */
document.addEventListener("DOMContentLoaded", () => {
  const reducir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Todas las secciones requieren cuenta: los botones cambian según haya sesión o no
  const usuarioActual = RoumixStorage.getUsuario();
  const conSesion = Boolean(usuarioActual);
  if (conSesion) {
    document.querySelectorAll("[data-texto-usuario]").forEach((el) => { el.textContent = el.dataset.textoUsuario; });
    document.querySelectorAll("[data-solo-visitante]").forEach((el) => { el.hidden = true; });
    const finalPrincipal = document.querySelector(".lx-final-acciones .lx-btn-naranja");
    if (finalPrincipal) {
      // Cada rol vuelve a su propio inicio
      finalPrincipal.href = `pages/${paginaInicioRol(usuarioActual)}`;
      finalPrincipal.querySelector("span").textContent = {
        admin: "Ir al panel",
        propietario: "Ir a mis publicaciones",
      }[usuarioActual.rol] || "Ir a buscar vivienda";
    }
    const finalSecundario = document.querySelector(".lx-final-acciones .lx-btn-contorno");
    if (finalSecundario) finalSecundario.hidden = true;
    const textoFinal = document.querySelector(".lx-final-caja p");
    if (textoFinal) textoFinal.textContent = usuarioActual.rol === "estudiante"
      ? "Ya tienes tu cuenta: sigue buscando cerca de tu universidad."
      : "Ya tienes tu cuenta: continúa desde tu área de Roumix.";
  }

  // ---------- 1. Palabra que rota en el título ----------
  const rotador = document.getElementById("lx-rotador");
  const frases = ["cerca de tu U", "a tu presupuesto", "con todo gestionado", "en un solo lugar"];
  let frase = 0;
  if (rotador && !reducir) {
    setInterval(() => {
      rotador.classList.add("lx-sale");
      setTimeout(() => {
        frase = (frase + 1) % frases.length;
        rotador.textContent = frases[frase];
        rotador.classList.remove("lx-sale");
        rotador.classList.add("lx-entra-palabra");
        setTimeout(() => rotador.classList.remove("lx-entra-palabra"), 450);
      }, 320);
    }, 2600);
  }

  // ---------- 2. Búsqueda rápida → buscar.html?universidad=... ----------
  const formulario = document.getElementById("lx-form-busqueda");
  if (formulario) {
    formulario.addEventListener("submit", (e) => {
      e.preventDefault();
      const uni = document.getElementById("lx-universidad").value;
      window.location.href = conSesion
        ? `pages/buscar.html?universidad=${encodeURIComponent(uni)}`
        : "ingresar.html?registro=estudiante";
    });
  }

  // ---------- 3. Profundidad: las capas siguen al mouse ----------
  const visual = document.getElementById("lx-visual");
  const capas = visual ? [...visual.querySelectorAll("[data-prof]")] : [];
  const conMouse = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (visual && conMouse && !reducir) {
    const hero = document.querySelector(".lx-hero");
    let objetivoX = 0, objetivoY = 0, actualX = 0, actualY = 0, animando = false;
    const mover = () => {
      actualX += (objetivoX - actualX) * 0.08;
      actualY += (objetivoY - actualY) * 0.08;
      capas.forEach((capa) => {
        const p = Number(capa.dataset.prof) / 10;
        capa.style.translate = `${actualX * p}px ${actualY * p}px`;
      });
      if (Math.abs(objetivoX - actualX) > 0.05 || Math.abs(objetivoY - actualY) > 0.05) {
        requestAnimationFrame(mover);
      } else {
        animando = false;
      }
    };
    hero.addEventListener("pointermove", (e) => {
      const caja = hero.getBoundingClientRect();
      objetivoX = ((e.clientX - caja.left) / caja.width - 0.5) * 14;
      objetivoY = ((e.clientY - caja.top) / caja.height - 0.5) * 14;
      if (!animando) { animando = true; requestAnimationFrame(mover); }
    });
    hero.addEventListener("pointerleave", () => {
      objetivoX = 0; objetivoY = 0;
      if (!animando) { animando = true; requestAnimationFrame(mover); }
    });
  }

  // ---------- 4. Tarjetas que se inclinan hacia el mouse ----------
  if (conMouse && !reducir) {
    document.querySelectorAll(".lx-inclinable").forEach((tarjeta) => {
      tarjeta.addEventListener("pointermove", (e) => {
        const caja = tarjeta.getBoundingClientRect();
        const x = (e.clientX - caja.left) / caja.width - 0.5;
        const y = (e.clientY - caja.top) / caja.height - 0.5;
        tarjeta.style.setProperty("--rx", `${(-y * 7).toFixed(2)}deg`);
        tarjeta.style.setProperty("--ry", `${(x * 7).toFixed(2)}deg`);
        tarjeta.style.setProperty("--brillo-x", `${(x + 0.5) * 100}%`);
        tarjeta.style.setProperty("--brillo-y", `${(y + 0.5) * 100}%`);
      });
      tarjeta.addEventListener("pointerleave", () => {
        tarjeta.style.setProperty("--rx", "0deg");
        tarjeta.style.setProperty("--ry", "0deg");
      });
    });
  }

  // ---------- 5. Aparición al hacer scroll + cifras que cuentan ----------
  const contarEn = (raiz) => raiz.querySelectorAll("[data-contar-final]").forEach((el) => {
    if (el.dataset.contarFinal === "" || el.dataset.contado) return;
    el.dataset.contado = "1";
    animarNumero(el, Number(el.dataset.contarFinal), 1200);
  });

  const revelables = document.querySelectorAll(".lx-revelar");
  if (!reducir && "IntersectionObserver" in window) {
    const observador = new IntersectionObserver((entradas) => {
      entradas.forEach((entrada) => {
        if (!entrada.isIntersecting) return;
        entrada.target.classList.add("lx-visible");
        contarEn(entrada.target);
        observador.unobserve(entrada.target);
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -30px 0px" });
    revelables.forEach((el) => observador.observe(el));
  } else {
    revelables.forEach((el) => { el.classList.add("lx-visible"); contarEn(el); });
  }

  // Línea de los pasos que se llena al bajar
  const pasos = document.getElementById("lx-pasos");
  const progreso = document.getElementById("lx-pasos-progreso");
  if (pasos && progreso) {
    const actualizarLinea = () => {
      const caja = pasos.getBoundingClientRect();
      const avance = Math.min(1, Math.max(0, (window.innerHeight * 0.75 - caja.top) / caja.height));
      progreso.style.transform = `scaleX(${avance})`;
    };
    window.addEventListener("scroll", actualizarLinea, { passive: true });
    actualizarLinea();
  }

  // ---------- 6. Datos reales: total de inmuebles y tarjeta de la portada ----------
  let inmuebles = [];
  const cifraInmuebles = document.getElementById("lx-cifra-inmuebles");
  RoumixAPI.getInmuebles()
    .then((lista) => {
      inmuebles = lista;
      cifraInmuebles.dataset.contarFinal = String(lista.length);
      if (cifraInmuebles.closest(".lx-visible") || reducir) contarEn(cifraInmuebles.parentElement);
      pintarTarjetaReal(lista[0]);
      pintarPines();
      actualizarExplora();
    })
    .catch(() => {
      cifraInmuebles.textContent = "–";
      actualizarExplora();
    });

  function pintarTarjetaReal(item) {
    const tarjeta = document.getElementById("lx-tarjeta-real");
    if (!tarjeta || !item) return;
    tarjeta.querySelector(".lx-tarjeta-foto").style.backgroundImage = `url("${String(item.imagen).replace(/"/g, "%22")}")`;
    tarjeta.querySelector("strong").textContent = item.titulo;
    tarjeta.querySelector(".lx-tarjeta-info > span").textContent =
      [item.barrio, item.tiempoPie].filter(Boolean).join(" · ");
    tarjeta.querySelector("b").textContent = item.precioFormato;

    // El pin destacado del mapa y el tiempo caminando corresponden a esa misma vivienda
    const pin = document.getElementById("lx-pin-destacado");
    if (pin) pin.lastChild.textContent = ` $${Math.round(Number(item.precio) / 1000)}k`;
    const tiempo = document.querySelector(".lx-mapa-tiempo span");
    if (tiempo && item.tiempoPie) tiempo.textContent = item.tiempoPie;
  }

  // ---------- 7. Explora por universidad (mapa real) ----------
  const contenedorMapa = document.getElementById("lx-mapa");
  let mapa = null;
  let pines = [];
  let campus = [];
  let uniActiva = "Santo Tomás";

  function iniciarMapa() {
    if (mapa || !contenedorMapa || !RoumixMapa.disponible()) return;
    mapa = RoumixMapa.crear(contenedorMapa, { zoom: 14, centro: RoumixMapa.CAMPUS_USTA });
    if (!mapa) return;
    campus = RoumixMapa.marcadoresCampus(mapa, uniActiva);
    pintarPines();
  }

  function pintarPines() {
    if (!mapa) return;
    pines.forEach((p) => mapa.removeLayer(p));
    pines = inmuebles
      .filter((i) => i.lat !== null && i.lng !== null)
      .map((i) => L.marker([i.lat, i.lng], { icon: RoumixMapa.iconoPrecio(i.precio, i.id), title: i.titulo })
        .addTo(mapa)
        .on("click", () => {
          window.location.href = conSesion ? `pages/detalle.html?id=${i.id}` : "ingresar.html?registro=estudiante";
        }));
  }

  // El mapa se crea solo cuando la sección se acerca a la pantalla (carga más rápida)
  if (contenedorMapa) {
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entradas, obs) => {
        if (entradas.some((e) => e.isIntersecting)) { iniciarMapa(); obs.disconnect(); }
      }, { rootMargin: "300px" }).observe(contenedorMapa);
    } else {
      iniciarMapa();
    }
  }

  async function actualizarExplora() {
    const cantidad = document.getElementById("lx-explora-cantidad");
    const texto = document.getElementById("lx-explora-texto");
    const boton = document.getElementById("lx-explora-boton");
    if (conSesion) {
      boton.href = `pages/buscar.html?universidad=${encodeURIComponent(uniActiva)}`;
      boton.querySelector("span").textContent = "Ver opciones cerca";
    }
    try {
      const cerca = await RoumixAPI.getInmuebles({ universidad: uniActiva });
      animarNumero(cantidad, cerca.length, 600);
      texto.textContent = cerca.length === 1 ? `opción cerca de ${uniActiva}` : `opciones cerca de ${uniActiva}`;
    } catch (e) {
      cantidad.textContent = "–";
      texto.textContent = "No pudimos consultar las opciones ahora.";
    }
  }

  const botonesUni = document.querySelectorAll(".lx-uni");
  const moverPildoraUni = activarPildoraDeslizante(document.getElementById("lx-unis"));
  botonesUni.forEach((boton) => {
    boton.addEventListener("click", () => {
      botonesUni.forEach((b) => {
        b.classList.toggle("active", b === boton);
        b.setAttribute("aria-checked", String(b === boton));
      });
      moverPildoraUni();
      uniActiva = boton.dataset.uni;
      actualizarExplora();
      if (mapa) {
        const sede = RoumixMapa.CAMPUS.find((c) => c.universidad === uniActiva);
        if (sede) mapa.flyTo(sede.coords, 15, { duration: reducir ? 0 : 1.1 });
        campus.forEach((m) => mapa.removeLayer(m));
        campus = RoumixMapa.marcadoresCampus(mapa, uniActiva);
      }
    });
  });

  // ---------- 8. Estudiante / propietario ----------
  const tabEst = document.getElementById("lx-tab-estudiante");
  const tabProp = document.getElementById("lx-tab-propietario");
  const moverPildoraPerfil = activarPildoraDeslizante(document.getElementById("lx-perfiles"));
  function elegirPerfil(propietario) {
    tabEst.classList.toggle("active", !propietario);
    tabProp.classList.toggle("active", propietario);
    tabEst.setAttribute("aria-selected", String(!propietario));
    tabProp.setAttribute("aria-selected", String(propietario));
    const mostrar = document.getElementById(propietario ? "lx-panel-propietario" : "lx-panel-estudiante");
    const ocultar = document.getElementById(propietario ? "lx-panel-estudiante" : "lx-panel-propietario");
    ocultar.hidden = true;
    ocultar.classList.remove("active");
    mostrar.hidden = false;
    void mostrar.offsetWidth;
    mostrar.classList.add("active");
    moverPildoraPerfil();
  }
  tabEst.addEventListener("click", () => elegirPerfil(false));
  tabProp.addEventListener("click", () => elegirPerfil(true));
  [tabEst, tabProp].forEach((tab) => tab.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      const propietario = tab === tabEst;
      elegirPerfil(propietario);
      (propietario ? tabProp : tabEst).focus();
    }
  }));

  // ---------- 9. Preguntas: solo una abierta a la vez ----------
  const preguntas = document.querySelectorAll(".lx-faq details");
  preguntas.forEach((p) => p.addEventListener("toggle", () => {
    if (p.open) preguntas.forEach((otra) => { if (otra !== p) otra.open = false; });
  }));

  // ---------- Llegada con ancla (por ejemplo /#insignias desde una publicación) ----------
  if (location.hash.length > 1) {
    const destino = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (destino) {
      destino.querySelectorAll(".lx-revelar").forEach((el) => el.classList.add("lx-visible"));
      if (destino.classList.contains("lx-revelar")) destino.classList.add("lx-visible");
      // "instant": el desplazamiento suave de la página no debe dejarlo a mitad de camino
      setTimeout(() => {
        const y = destino.getBoundingClientRect().top + window.scrollY - 96;
        window.scrollTo({ top: y, behavior: "instant" });
      }, 60);
    }
  }

  // ---------- 10. Barra superior más compacta al bajar ----------
  const cabecera = document.querySelector(".main-header");
  const revisarCabecera = () => cabecera.classList.toggle("lx-cabecera-baja", window.scrollY > 40);
  window.addEventListener("scroll", revisarCabecera, { passive: true });
  revisarCabecera();
});
