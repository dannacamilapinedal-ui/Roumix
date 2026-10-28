/**
 * ============================================================================
 * ROUMIX - CAPTCHA (Cloudflare Turnstile)
 * La clave pública se pide al servidor (/api/config). Si el servidor no tiene
 * CAPTCHA configurado, no se muestra nada y los formularios siguen funcionando.
 * El token resultante se envía al backend, que lo verifica con Cloudflare.
 * ============================================================================
 */
const RoumixCaptcha = {
  _clave: undefined,
  _script: null,

  _obtenerClave: async function() {
    if (this._clave !== undefined) return this._clave;
    try {
      const res = await fetch(`${RoumixAPI.baseURL}/config`);
      const json = await res.json();
      this._clave = (json.data && json.data.turnstileSiteKey) || null;
    } catch (error) {
      this._clave = null;
    }
    return this._clave;
  },

  _cargarScript: function() {
    if (!this._script) {
      this._script = new Promise((resolver, rechazar) => {
        const script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.onload = () => resolver();
        script.onerror = () => rechazar(new Error("No se pudo cargar la verificación de seguridad."));
        document.head.appendChild(script);
      });
    }
    return this._script;
  },

  /**
   * Dibuja el CAPTCHA dentro de "contenedor". Devuelve { obtener(), reiniciar() }.
   * Si el CAPTCHA está desactivado en el servidor, obtener() devuelve "".
   */
  montar: async function(contenedor) {
    const sinCaptcha = { activo: false, obtener: () => "", reiniciar: () => {} };
    const clave = await this._obtenerClave();
    if (!clave) {
      contenedor.hidden = true;
      return sinCaptcha;
    }

    try {
      await this._cargarScript();
    } catch (error) {
      contenedor.textContent = "No se pudo cargar la verificación de seguridad. Revisa tu conexión o desactiva el bloqueador de anuncios y recarga la página.";
      contenedor.classList.add("captcha-error");
      return sinCaptcha;
    }

    const id = window.turnstile.render(contenedor, {
      sitekey: clave,
      language: "es",
      theme: "light",
      "refresh-expired": "auto"
    });
    return {
      activo: true,
      obtener: () => window.turnstile.getResponse(id) || "",
      // Cada token sirve una sola vez: después de cada envío se pide uno nuevo
      reiniciar: () => window.turnstile.reset(id)
    };
  }
};
