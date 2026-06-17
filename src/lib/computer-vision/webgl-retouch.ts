/**
 * V-02 — Single-pass WebGL2 retouch processor.
 *
 * All 15 RetouchOptions are applied as GLSL uniforms in one fragment shader,
 * replacing the Canvas 2D getImageData/putImageData round-trips and the
 * pixel-by-pixel Worker loop with a single GPU draw call.
 *
 * Falls back gracefully: `isSupported` is false when WebGL2 is unavailable.
 */

import { RetouchOptions } from '../../types';

// ---------- Shaders ----------

const VERT_SRC = `#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_uv;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_uv = a_texCoord;
}`;

const FRAG_SRC = `#version 300 es
precision highp float;

uniform sampler2D u_image;
uniform vec2      u_texelSize;

// All values normalized: -100→-1.0, 0→0.0, +100→+1.0
uniform float u_exposure;
uniform float u_contrast;
uniform float u_temperature;
uniform float u_tint;
uniform float u_highlights;
uniform float u_shadows;
uniform float u_whites;
uniform float u_blacks;
uniform float u_clarity;
uniform float u_texture_str;
uniform float u_dehaze;
uniform float u_vibrance;
uniform float u_saturation;
uniform float u_midtoneContrast;
uniform float u_sharpness;

in vec2 v_uv;
out vec4 fragColor;

float lum(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

// 3x3 box blur sampled from the original texture
vec3 blur3x3(vec2 uv) {
  vec3 acc = vec3(0.0);
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      acc += texture(u_image, uv + vec2(float(dx), float(dy)) * u_texelSize).rgb;
    }
  }
  return acc / 9.0;
}

void main() {
  vec4 orig = texture(u_image, v_uv);
  vec3 c = orig.rgb;

  // ── Exposure (brightness) ───────────────────────────────────────────────
  if (abs(u_exposure) > 0.001) {
    c = clamp(c * (1.0 + u_exposure), 0.0, 1.0);
  }

  // ── Contrast (CSS-equivalent S-curve) ───────────────────────────────────
  if (abs(u_contrast) > 0.001) {
    c = clamp((c - 0.5) * (1.0 + u_contrast) + 0.5, 0.0, 1.0);
  }

  // ── Temperature / Tint (simple channel shift) ───────────────────────────
  float tempD = u_temperature * 0.118;
  float tintD = u_tint * 0.118;
  c.r = clamp(c.r + tempD + tintD,       0.0, 1.0);
  c.g = clamp(c.g - tintD * 0.5,         0.0, 1.0);
  c.b = clamp(c.b - tempD + tintD,       0.0, 1.0);

  float L = lum(c);

  // ── Tone curve (highlights / shadows / whites / blacks) ─────────────────
  float hW = L * L;
  float sW = (1.0 - L) * (1.0 - L);
  float wW = hW * hW;                    // pow(L, 4)
  float bW = sW * sW;                    // pow(1-L, 4)

  float toneDelta = u_highlights * hW * 0.35
                  + u_shadows    * sW * 0.35
                  + u_whites     * wW * 0.55
                  + u_blacks     * bW * 0.55;
  c = clamp(c + toneDelta, 0.0, 1.0);
  L = lum(c);

  // ── Midtone contrast ────────────────────────────────────────────────────
  if (abs(u_midtoneContrast) > 0.001) {
    float mtW = 1.0 - abs(L - 0.5) * 2.0;
    c = clamp(c + u_midtoneContrast * (L - 0.5) * mtW * 0.47, 0.0, 1.0);
    L = lum(c);
  }

  // ── Dehaze ──────────────────────────────────────────────────────────────
  if (abs(u_dehaze) > 0.001) {
    float haze = (0.5 - L) * u_dehaze * 0.7;
    c.r = clamp(c.r + haze,        0.0, 1.0);
    c.g = clamp(c.g + haze,        0.0, 1.0);
    c.b = clamp(c.b + haze * 0.9,  0.0, 1.0);
    L = lum(c);
  }

  // ── Vibrance (selective saturation – stronger on low-sat pixels) ─────────
  if (abs(u_vibrance) > 0.001) {
    float vibF = 1.0 + u_vibrance * (1.0 - L);
    c = clamp(mix(vec3(L), c, vibF), 0.0, 1.0);
    L = lum(c);
  }

  // ── Global saturation ───────────────────────────────────────────────────
  if (abs(u_saturation) > 0.001) {
    c = clamp(mix(vec3(L), c, 1.0 + u_saturation), 0.0, 1.0);
  }

  // ── Clarity (midtone local contrast) ────────────────────────────────────
  if (abs(u_clarity) > 0.001) {
    float blurL = lum(blur3x3(v_uv));
    float detail = L - blurL;
    float mtW = 1.0 - abs(L - 0.5) * 2.0;
    c = clamp(c + detail * u_clarity * mtW * 0.24, 0.0, 1.0);
  }

  // ── Texture (fine detail enhancement) ───────────────────────────────────
  if (abs(u_texture_str) > 0.001) {
    float blurL = lum(blur3x3(v_uv));
    float detail = L - blurL;
    c = clamp(c + detail * u_texture_str * 0.32, 0.0, 1.0);
  }

  // ── Sharpness (unsharp mask, 5-tap cross, positive only) ────────────────
  if (u_sharpness > 0.001) {
    vec3 t = texture(u_image, v_uv + vec2(0.0,            -u_texelSize.y)).rgb;
    vec3 b = texture(u_image, v_uv + vec2(0.0,             u_texelSize.y)).rgb;
    vec3 l = texture(u_image, v_uv + vec2(-u_texelSize.x,  0.0          )).rgb;
    vec3 r = texture(u_image, v_uv + vec2( u_texelSize.x,  0.0          )).rgb;
    vec3 center = (t + b + l + r) * 0.25;
    c = clamp(c + (c - center) * u_sharpness * 2.0, 0.0, 1.0);
  }

  fragColor = vec4(c, orig.a);
}`;

// ---------- Processor class ----------

const UNIFORM_NAMES = [
  'u_image',
  'u_texelSize',
  'u_exposure',
  'u_contrast',
  'u_temperature',
  'u_tint',
  'u_highlights',
  'u_shadows',
  'u_whites',
  'u_blacks',
  'u_clarity',
  'u_texture_str',
  'u_dehaze',
  'u_vibrance',
  'u_saturation',
  'u_midtoneContrast',
  'u_sharpness',
] as const;

export class WebGLRetouchProcessor {
  private gl: WebGL2RenderingContext | null = null;
  readonly canvas: HTMLCanvasElement;
  private program: WebGLProgram | null = null;
  private tex: WebGLTexture | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private locs: Partial<
    Record<(typeof UNIFORM_NAMES)[number], WebGLUniformLocation>
  > = {};
  private _supported = false;

  constructor() {
    this.canvas = document.createElement('canvas');
    try {
      const gl = this.canvas.getContext('webgl2', {
        premultipliedAlpha: false,
      });
      if (!gl) return;
      this.gl = gl;
      this.setup(gl);
    } catch {
      // WebGL2 unavailable in this environment
    }
  }

  get isSupported(): boolean {
    return this._supported;
  }

  // Synchronous — no pixel readback, result is the WebGL canvas itself.
  applyRetouch(
    image: HTMLImageElement,
    options: RetouchOptions
  ): HTMLCanvasElement {
    const gl = this.gl;
    if (!gl || !this._supported || !this.program || !this.vao) {
      throw new Error('WebGL not ready');
    }

    const { width, height } = image;
    this.canvas.width = width;
    this.canvas.height = height;
    gl.viewport(0, 0, width, height);

    // Upload image as texture
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    const set1i = (name: (typeof UNIFORM_NAMES)[number], v: number) => {
      const loc = this.locs[name];
      if (loc) gl.uniform1i(loc, v);
    };
    const set1f = (name: (typeof UNIFORM_NAMES)[number], v: number) => {
      const loc = this.locs[name];
      if (loc) gl.uniform1f(loc, v);
    };
    const set2f = (
      name: (typeof UNIFORM_NAMES)[number],
      x: number,
      y: number
    ) => {
      const loc = this.locs[name];
      if (loc) gl.uniform2f(loc, x, y);
    };

    set1i('u_image', 0);
    set2f('u_texelSize', 1 / width, 1 / height);

    // Normalize -100..100 → -1..1
    const n = (v: number) => v / 100;
    set1f('u_exposure', n(options.exposure));
    set1f('u_contrast', n(options.contrast));
    set1f('u_temperature', n(options.temperature));
    set1f('u_tint', n(options.tint));
    set1f('u_highlights', n(options.highlights));
    set1f('u_shadows', n(options.shadows));
    set1f('u_whites', n(options.whites));
    set1f('u_blacks', n(options.blacks));
    set1f('u_clarity', n(options.clarity));
    set1f('u_texture_str', n(options.texture));
    set1f('u_dehaze', n(options.dehaze));
    set1f('u_vibrance', n(options.vibrance));
    set1f('u_saturation', n(options.saturation));
    set1f('u_midtoneContrast', n(options.midtoneContrast));
    set1f('u_sharpness', Math.max(0, n(options.sharpness)));

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    return this.canvas;
  }

  dispose(): void {
    const gl = this.gl;
    if (!gl) return;
    if (this.tex) gl.deleteTexture(this.tex);
    if (this.program) gl.deleteProgram(this.program);
    if (this.vao) gl.deleteVertexArray(this.vao);
    this._supported = false;
  }

  // ── Private setup ────────────────────────────────────────────────────────

  private setup(gl: WebGL2RenderingContext): void {
    const vert = this.compile(gl, gl.VERTEX_SHADER, VERT_SRC);
    const frag = this.compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vert || !frag) return;

    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('[WebGL retouch] link failed:', gl.getProgramInfoLog(prog));
      return;
    }
    this.program = prog;

    // Full-screen quad (two triangles as TRIANGLE_STRIP)
    //  positions: clip-space [-1,+1]
    //  texCoords: UV [0,1], Y-flipped to match image origin
    const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const texCoords = new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]);

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);

    this.bindAttrib(gl, prog, 'a_position', positions, 2);
    this.bindAttrib(gl, prog, 'a_texCoord', texCoords, 2);

    gl.bindVertexArray(null);

    // Texture
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Cache uniform locations
    for (const name of UNIFORM_NAMES) {
      const loc = gl.getUniformLocation(prog, name);
      if (loc) this.locs[name] = loc;
    }

    this._supported = true;
  }

  private compile(
    gl: WebGL2RenderingContext,
    type: number,
    src: string
  ): WebGLShader | null {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('[WebGL retouch] shader compile:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  private bindAttrib(
    gl: WebGL2RenderingContext,
    prog: WebGLProgram,
    name: string,
    data: Float32Array,
    size: number
  ): void {
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, name);
    if (loc >= 0) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    }
  }
}
