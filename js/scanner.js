/**
 * Lector de códigos de barras con la cámara usando la API nativa
 * BarcodeDetector (Chrome para Android la incluye). Requiere HTTPS o localhost.
 */

const WANTED = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

/** ¿El navegador puede escanear? */
export function scannerSupported() {
  return 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;
}

/** Valida el dígito de control de EAN-8, EAN-13, UPC-A (12) y GTIN-14. */
export function isValidBarcode(code) {
  if (!/^\d+$/.test(code)) return false;
  if (code.length === 6) return true;              // UPC-E comprimido: sin verificar
  if (![8, 12, 13, 14].includes(code.length)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop();
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** Normaliza: UPC-A de 12 dígitos se consulta como EAN-13 con un 0 delante. */
export function normalizeBarcode(code) {
  const c = String(code).replace(/\D/g, '');
  return c.length === 12 ? `0${c}` : c;
}

export class Scanner {
  constructor() {
    this.stream = null;
    this.running = false;
    this.detector = null;
    this.track = null;
  }

  /**
   * Inicia la cámara y llama a onCode(código) al leer un código válido.
   * Se necesita la misma lectura dos veces seguidas para evitar errores.
   */
  async start(video, onCode) {
    const supported = await BarcodeDetector.getSupportedFormats();
    const formats = WANTED.filter((f) => supported.includes(f));
    if (!formats.length) throw new Error('Este dispositivo no soporta códigos EAN/UPC.');
    this.detector = new BarcodeDetector({ formats });

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    this.track = this.stream.getVideoTracks()[0];
    video.srcObject = this.stream;
    video.setAttribute('playsinline', '');
    await video.play();
    this.running = true;

    let last = null;
    const loop = async () => {
      if (!this.running) return;
      try {
        if (video.readyState >= 2) {
          const codes = await this.detector.detect(video);
          const hit = codes.map((c) => c.rawValue).find(isValidBarcode);
          if (hit) {
            if (hit === last) {
              this.stop();
              navigator.vibrate?.(80);
              onCode(hit);
              return;
            }
            last = hit;
          }
        }
      } catch { /* fotograma no disponible; seguimos */ }
      setTimeout(() => requestAnimationFrame(loop), 120);
    };
    loop();
  }

  /** ¿La cámara tiene linterna? */
  hasTorch() {
    return !!this.track?.getCapabilities?.().torch;
  }

  async setTorch(on) {
    if (this.hasTorch()) await this.track.applyConstraints({ advanced: [{ torch: on }] });
  }

  stop() {
    this.running = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.track = null;
  }
}
