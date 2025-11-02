import {
  ClampToEdgeWrapping,
  GLSL3,
  LinearFilter,
  AmbientLight,
  NoToneMapping,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  RawShaderMaterial,
  Scene,
  SRGBColorSpace,
  ShaderChunk,
  Texture,
  Vector2,
  Vector4,
  WebGLRenderer,
  WebGLRenderTarget,
  WebGLRendererParameters,
} from "three";
import { shaderMaterial as createShaderGradientMaterial } from "shadergradient/dist/shaders/shaderMaterial.mjs";
import {
  fragmentShader as shaderGradientFragmentShader,
  vertexShader as shaderGradientVertexShader,
} from "shadergradient/dist/shaders/a/index.mjs";
import { DitheringTypes } from "@paper-design/shaders";

const UNLIT_GRADIENT_FRAGMENT_SHADER = shaderGradientFragmentShader.replace(
  "gl_FragColor = vec4(outgoingLight, diffuseColor.a);",
  "gl_FragColor = diffuseColor;"
);

const DEFAULT_COLORS: [string, string, string] = [
  "#ffffff",
  "#ffffff",
  "#2b2b2b",
];

const DEFAULT_GRADIENT_CONFIG: GradientConfigInternal = {
  colors: DEFAULT_COLORS,
  speed: 0.1,
  noiseDensity: 1,
  noiseStrength: 3,
  frequency: 1.0,
  amplitude: 1.0,
  intensity: 0.45,
};

const DEFAULT_DITHER_CONFIG: DitherConfigInternal = {
  ditherType: "4x4",
  ditherStrength: 1,
  levels: 5,
  pixelSize: 2,
  colorFront: "#ffffff",
  colorBack: "#000000",
  colorHighlight: "#ffffff",
  useOriginalColors: false,
  enabled: true,
};

const DEFAULT_PERFORMANCE_CONFIG: Required<PerformanceConfig> = {
  renderScale: null,
};

const MAX_PIXEL_RATIO = 2.5;
const MIN_PIXEL_RATIO = 1.0;

const FULLSCREEN_VERTEX_SHADER = `
in vec3 position;
in vec2 uv;
out vec2 v_uv;
void main() {
  v_uv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const DITHER_FRAGMENT_SHADER = `
precision highp float;

in vec2 v_uv;

uniform sampler2D u_image;
uniform vec2 u_resolution;
uniform float u_colorSteps;
uniform float u_pxSize;
uniform float u_mixStrength;
uniform int u_type;
uniform vec4 u_colorFront;
uniform vec4 u_colorBack;
uniform vec4 u_colorHighlight;
uniform bool u_originalColors;

out vec4 fragColor;

const int BAYER_2X2[4] = int[4](0, 2, 3, 1);
const int BAYER_4X4[16] = int[16](
  0,  8,  2, 10,
 12,  4, 14,  6,
  3, 11,  1,  9,
 15,  7, 13,  5
);
const int BAYER_8X8[64] = int[64](
   0, 32,  8, 40,  2, 34, 10, 42,
  48, 16, 56, 24, 50, 18, 58, 26,
  12, 44,  4, 36, 14, 46,  6, 38,
  60, 28, 52, 20, 62, 30, 54, 22,
   3, 35, 11, 43,  1, 33,  9, 41,
  51, 19, 59, 27, 49, 17, 57, 25,
  15, 47,  7, 39, 13, 45,  5, 37,
  63, 31, 55, 23, 61, 29, 53, 21
);

float hash21(vec2 p) {
  p = fract(p * vec2(0.3183099, 0.3678794)) + 0.1;
  p += dot(p, p + 19.19);
  return fract(p.x * p.y);
}

float bayerThreshold(vec2 coord, int size) {
  ivec2 pos = ivec2(mod(coord, float(size)));
  int index = pos.y * size + pos.x;

  if (size == 2) {
    return float(BAYER_2X2[index]) / 4.0;
  }
  if (size == 4) {
    return float(BAYER_4X4[index]) / 16.0;
  }
  return float(BAYER_8X8[index]) / 64.0;
}

float sampleThreshold(vec2 pixel, int ditherType, float pxSize) {
  if (ditherType == 1) {
    return hash21(pixel);
  }

  vec2 grid = floor(pixel / max(pxSize, 1.0));
  if (ditherType == 2) {
    return bayerThreshold(grid, 2);
  }
  if (ditherType == 3) {
    return bayerThreshold(grid, 4);
  }
  return bayerThreshold(grid, 8);
}

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(
    abs((q.w - q.y) / (6.0 * d + e)),
    d / (q.x + e),
    q.x
  );
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec4 baseSample = texture(u_image, v_uv);
  vec3 baseColor = baseSample.rgb;
  float luminance = dot(baseColor, vec3(0.2126, 0.7152, 0.0722));
  float steps = max(u_colorSteps, 2.0);

  vec2 pixel = v_uv * u_resolution;
  float threshold = sampleThreshold(pixel, u_type, u_pxSize);
  float centered = threshold - 0.5;

  float biased = clamp(luminance + centered * u_mixStrength, 0.0, 1.0);
  float quantized = floor(biased * steps + 0.5) / steps;

  float blendAmount = clamp(u_mixStrength, 0.0, 1.0);
  vec3 paletteColor;

  if (u_originalColors) {
    float highlightMask = step(1.02 - 0.02 * steps, quantized);
    vec3 fgColor = u_colorFront.rgb * u_colorFront.a;
    vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
    vec3 hlColor = u_colorHighlight.rgb * u_colorHighlight.a;
    float fgOpacity = u_colorFront.a;
    float bgOpacity = u_colorBack.a;
    float hlOpacity = u_colorHighlight.a;

    vec3 tintedForeground = mix(fgColor, hlColor, highlightMask);
    float tintedOpacity = mix(fgOpacity, hlOpacity, highlightMask);

    vec3 color = tintedForeground * quantized;
    float opacity = tintedOpacity * quantized;
    color += bgColor * (1.0 - opacity);
    opacity += bgOpacity * (1.0 - opacity);
    paletteColor = color / max(opacity, 1e-4);
  } else {
    vec3 hsv = rgb2hsv(baseColor);
    hsv.z = quantized;
    paletteColor = hsv2rgb(hsv);
  }

  vec3 finalColor = mix(baseColor, paletteColor, blendAmount);
  fragColor = vec4(finalColor, baseSample.a);
}
`;

const GradientMaterialClass = createShaderGradientMaterial(
  {
    colors: DEFAULT_COLORS,
    uTime: 0,
    uSpeed: DEFAULT_GRADIENT_CONFIG.speed,
    uNoiseDensity: DEFAULT_GRADIENT_CONFIG.noiseDensity,
    uNoiseStrength: DEFAULT_GRADIENT_CONFIG.noiseStrength,
    uFrequency: DEFAULT_GRADIENT_CONFIG.frequency,
    uAmplitude: DEFAULT_GRADIENT_CONFIG.amplitude,
    uIntensity: DEFAULT_GRADIENT_CONFIG.intensity,
    uLoadingTime: 1,
  },
  shaderGradientVertexShader,
  UNLIT_GRADIENT_FRAGMENT_SHADER,
  undefined
);

type GradientMaterial = InstanceType<typeof GradientMaterialClass>;

type GradientColorStop = {
  position: number;
  color: string;
};

type GradientConfig = {
  colorStops?: GradientColorStop[];
  colors?: [string, string, string];
  speed?: number;
  noiseDensity?: number;
  noiseStrength?: number;
  frequency?: number;
  amplitude?: number;
  intensity?: number;
};

type GradientConfigInternal = {
  colors: [string, string, string];
  speed: number;
  noiseDensity: number;
  noiseStrength: number;
  frequency: number;
  amplitude: number;
  intensity: number;
};

type DitherType = "ordered" | "blue-noise" | "8x8" | "4x4" | "2x2" | "random";

type DitherConfig = {
  ditherType?: DitherType;
  ditherStrength?: number; // 0..1 controls blend strength
  levels?: number;
  pixelSize?: number;
  colorFront?: string;
  colorBack?: string;
  colorHighlight?: string;
  useOriginalColors?: boolean;
  enabled?: boolean;
};

type DitherConfigInternal = Required<Omit<DitherConfig, "ditherType">> & {
  ditherType: DitherType;
};

type PerformanceConfig = {
  renderScale?: number | null;
};

type DitheredGradientOptions = {
  container?: HTMLElement;
  gradient?: GradientConfig;
  dither?: DitherConfig;
  performance?: PerformanceConfig;
};

type DitheredGradientUpdate = {
  gradient?: GradientConfig;
  dither?: DitherConfig;
  performance?: PerformanceConfig;
};

type DitheredGradientImageOptions = DitheredGradientOptions & {
  width: number;
  height: number;
  time?: number;
  mimeType?: string;
  quality?: number;
};

export type {
  DitherConfig,
  DitheredGradientOptions,
  DitheredGradientImageOptions,
  DitheredGradientUpdate,
  DitherType,
  GradientColorStop,
  GradientConfig,
  PerformanceConfig,
};

export class DitheredGradient {
  private readonly container: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;

  private gradientScene: Scene;
  private gradientCamera: PerspectiveCamera;
  private gradientMaterial: GradientMaterial;
  private gradientMesh: Mesh;
  private gradientRenderTarget: WebGLRenderTarget;

  private postScene: Scene;
  private postCamera: OrthographicCamera;
  private postMaterial: RawShaderMaterial;
  private postMesh: Mesh;

  private gradientConfig: GradientConfigInternal;
  private ditherConfig: DitherConfigInternal;
  private performanceConfig: Required<PerformanceConfig>;

  private renderScale: number | null = null;
  private lastContainerWidth = 0;
  private lastContainerHeight = 0;
  private pixelRatio = 1;

  private running = false;
  private rafId: number | null = null;
  private startTime = 0;
  private manualTime: number | null = null;

  private resizeObserver: ResizeObserver | null = null;
  private readonly onResize = () => this.handleResize();
  private readonly onContextLost = (event: Event) => {
    event.preventDefault();
    this.stop();
  };

  constructor(options: DitheredGradientOptions = {}) {
    if (typeof window === "undefined" || typeof document === "undefined") {
      throw new Error("DitheredGradient can only run in a browser environment");
    }

    this.container = options.container ?? document.body;
    ensureContainerIsPositioned(this.container);

    ensureShaderChunksPatched();

    this.canvas = document.createElement("canvas");
    styleCanvas(this.canvas, this.container === document.body);
    this.container.appendChild(this.canvas);

    const contextAttributes: WebGLContextAttributes = {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    };

    const context = this.canvas.getContext("webgl2", contextAttributes);
    if (!context) {
      this.container.removeChild(this.canvas);
      throw new Error("WebGL2 is required for DitheredGradient background");
    }

    const rendererParams: WebGLRendererParameters = {
      canvas: this.canvas,
      context,
      powerPreference: "high-performance",
      alpha: true,
      antialias: false,
    };

    this.renderer = new WebGLRenderer(rendererParams);
    this.renderer.autoClear = true;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NoToneMapping;

    this.gradientConfig = mergeGradientConfig(options.gradient);
    this.ditherConfig = mergeDitherConfig(options.dither);
    this.performanceConfig = mergePerformanceConfig(options.performance);
    this.renderScale = this.performanceConfig.renderScale ?? null;

    this.gradientScene = new Scene();
    this.gradientCamera = createGradientCamera();
    this.gradientMaterial = createGradientMaterial(this.gradientConfig);
    this.gradientMesh = createGradientMesh(this.gradientMaterial);
    this.gradientScene.add(this.gradientMesh);
    this.gradientScene.add(new AmbientLight(0xffffff, 1.0));

    this.gradientRenderTarget = new WebGLRenderTarget(1, 1, {
      depthBuffer: false,
      stencilBuffer: false,
      magFilter: LinearFilter,
      minFilter: LinearFilter,
      wrapS: ClampToEdgeWrapping,
      wrapT: ClampToEdgeWrapping,
    });
    this.gradientRenderTarget.texture.colorSpace = SRGBColorSpace;

    this.postScene = new Scene();
    this.postCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postMaterial = createPostMaterial(
      this.gradientRenderTarget.texture,
      this.ditherConfig
    );
    this.postMesh = new Mesh(new PlaneGeometry(2, 2), this.postMaterial);
    this.postMesh.frustumCulled = false;
    this.postScene.add(this.postMesh);

    this.canvas.addEventListener("webglcontextlost", this.onContextLost, false);

    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(this.container);
    } else {
      window.addEventListener("resize", this.onResize);
    }

    this.handleResize(true);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.startTime = performance.now();
    this.rafId = requestAnimationFrame(this.render);
  }

  stop() {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  dispose() {
    this.stop();
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    } else {
      window.removeEventListener("resize", this.onResize);
    }

    if (this.canvas.parentElement === this.container) {
      this.container.removeChild(this.canvas);
    }

    disposeMesh(this.gradientMesh);
    disposeMesh(this.postMesh);
    this.gradientMaterial.dispose();
    this.postMaterial.dispose();
    this.gradientRenderTarget.dispose();
    this.renderer.dispose();
  }

  update(update: DitheredGradientUpdate) {
    if (!update) return;

    if (update.gradient) {
      this.gradientConfig = mergeGradientConfig({
        ...this.gradientConfig,
        ...update.gradient,
      });
      applyGradientConfig(this.gradientMaterial, this.gradientConfig);
    }

    if (update.dither) {
      this.ditherConfig = mergeDitherConfig({
        ...this.ditherConfig,
        ...update.dither,
      });
      applyDitherConfig(this.postMaterial, this.ditherConfig, this.pixelRatio);
    }

    if (update.performance) {
      const nextPerformance = mergePerformanceConfig(update.performance);
      if (nextPerformance.renderScale !== this.performanceConfig.renderScale) {
        this.performanceConfig = nextPerformance;
        this.renderScale = nextPerformance.renderScale;
        this.handleResize(true);
      }
    }
  }

  renderFrame(time?: number): void {
    if (typeof time === "number" && Number.isFinite(time)) {
      this.manualTime = time;
    }

    if (this.manualTime != null) {
      this.drawFrame(this.manualTime);
      return;
    }

    const now = performance.now();
    if (this.startTime === 0) {
      this.startTime = now;
    }
    const elapsed = (now - this.startTime) * 0.001;
    this.drawFrame(elapsed);
  }

  setManualTime(time: number | null) {
    if (typeof time === "number" && Number.isFinite(time)) {
      this.manualTime = time;
      this.drawFrame(time);
      return;
    }
    this.manualTime = null;
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  private render = (time: number) => {
    if (!this.running) return;

    if (this.startTime === 0) {
      this.startTime = time;
    }
    const elapsed = (time - this.startTime) * 0.001;
    this.drawFrame(elapsed);

    this.rafId = requestAnimationFrame(this.render);
  };

  private drawFrame(elapsed: number) {
    const timeToUse = this.manualTime ?? elapsed;
    updateGradientTime(this.gradientMaterial, timeToUse);

    this.renderer.setRenderTarget(this.gradientRenderTarget);
    this.renderer.render(this.gradientScene, this.gradientCamera);

    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCamera);
  }

  private handleResize(force = false) {
    const rect =
      this.container === document.body
        ? new DOMRect(0, 0, window.innerWidth, window.innerHeight)
        : this.container.getBoundingClientRect();

    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));

    if (
      !force &&
      width === this.lastContainerWidth &&
      height === this.lastContainerHeight
    ) {
      return;
    }

    this.lastContainerWidth = width;
    this.lastContainerHeight = height;

    const dpr = clamp(
      window.devicePixelRatio ?? 1,
      MIN_PIXEL_RATIO,
      MAX_PIXEL_RATIO
    );
    const scale = this.renderScale ?? autoRenderScale(width, height, dpr);
    const pixelRatio = clamp(dpr * scale, MIN_PIXEL_RATIO, MAX_PIXEL_RATIO);
    this.pixelRatio = pixelRatio;

    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);

    const canvasWidth = Math.max(1, Math.round(width * pixelRatio));
    const canvasHeight = Math.max(1, Math.round(height * pixelRatio));

    this.gradientCamera.aspect = width / height;
    this.gradientCamera.updateProjectionMatrix();

    this.gradientRenderTarget.setSize(canvasWidth, canvasHeight);
    updatePostMaterialResolution(
      this.postMaterial,
      canvasWidth,
      canvasHeight,
      pixelRatio,
      this.ditherConfig,
      this.gradientRenderTarget.texture
    );
  }
}

function createGradientMaterial(
  config: GradientConfigInternal
): GradientMaterial {
  const material = new GradientMaterialClass();
  material.metalness = 0;
  material.roughness = 0;
  material.toneMapped = false;
  material.emissive.setScalar(0);
  material.emissiveIntensity = 0;
  applyGradientConfig(material, config);
  return material;
}

function createGradientMesh(material: GradientMaterial): Mesh {
  const geometry = new PlaneGeometry(10, 10, 180, 180);
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

function createGradientCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 6);
  camera.lookAt(0, 0, 0);
  return camera;
}

function createPostMaterial(
  texture: Texture,
  config: DitherConfigInternal
): RawShaderMaterial {
  const mixStrength = config.enabled ? clamp(config.ditherStrength, 0, 1) : 0;
  const uniforms = {
    u_resolution: { value: new Vector2(1, 1) },
    u_image: { value: texture },
    u_type: { value: mapDitherType(config.ditherType) },
    u_pxSize: { value: Math.max(1, config.pixelSize) },
    u_colorSteps: { value: Math.max(2, config.levels) },
    u_mixStrength: { value: mixStrength },
    u_colorFront: { value: hexToVec4(config.colorFront) },
    u_colorBack: { value: hexToVec4(config.colorBack) },
    u_colorHighlight: { value: hexToVec4(config.colorHighlight) },
    u_originalColors: { value: config.useOriginalColors },
  } satisfies Record<string, { value: unknown }>;

  return new RawShaderMaterial({
    glslVersion: GLSL3,
    uniforms,
    vertexShader: FULLSCREEN_VERTEX_SHADER,
    fragmentShader: DITHER_FRAGMENT_SHADER,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
}

function applyGradientConfig(
  material: GradientMaterial,
  config: GradientConfigInternal
) {
  const colors = resolveGradientColors(config);
  setGradientColors(material, colors);
  setUniform(material, "uSpeed", config.speed);
  setUniform(material, "uNoiseDensity", config.noiseDensity);
  setUniform(material, "uNoiseStrength", config.noiseStrength);
  setUniform(material, "uFrequency", config.frequency);
  setUniform(material, "uAmplitude", config.amplitude);
  setUniform(material, "uIntensity", config.intensity);
  setUniform(material, "uLoadingTime", 1);
  // Ensure shader recompiles if colors changed
  material.needsUpdate = true;
}

function applyDitherConfig(
  material: RawShaderMaterial,
  config: DitherConfigInternal,
  pixelRatio = 1
) {
  const clampedRatio = Math.max(pixelRatio, 1);
  const mixStrength = config.enabled ? clamp(config.ditherStrength, 0, 1) : 0;
  setRawUniform(material, "u_type", mapDitherType(config.ditherType));
  setRawUniform(
    material,
    "u_pxSize",
    Math.max(1, config.pixelSize) * clampedRatio
  );
  setRawUniform(material, "u_colorSteps", Math.max(2, config.levels));
  setRawUniform(material, "u_mixStrength", mixStrength);
  setRawUniform(material, "u_colorFront", hexToVec4(config.colorFront));
  setRawUniform(material, "u_colorBack", hexToVec4(config.colorBack));
  setRawUniform(material, "u_colorHighlight", hexToVec4(config.colorHighlight));
  setRawUniform(material, "u_originalColors", config.useOriginalColors);
}

function updateGradientTime(material: GradientMaterial, time: number) {
  setUniform(material, "uTime", time);
}

function updatePostMaterialResolution(
  material: RawShaderMaterial,
  width: number,
  height: number,
  pixelRatio: number,
  config: DitherConfigInternal,
  texture: Texture
) {
  setRawUniform(material, "u_resolution", new Vector2(width, height));
  applyDitherConfig(material, config, pixelRatio);
  setRawUniform(material, "u_image", texture);
}

function mergeGradientConfig(partial?: GradientConfig): GradientConfigInternal {
  const colorStops = partial?.colorStops;
  const colors = partial?.colors;
  const resolvedColors = resolveGradientColors({ colorStops, colors });

  return {
    colors: resolvedColors,
    speed: partial?.speed ?? DEFAULT_GRADIENT_CONFIG.speed,
    noiseDensity: partial?.noiseDensity ?? DEFAULT_GRADIENT_CONFIG.noiseDensity,
    noiseStrength:
      partial?.noiseStrength ?? DEFAULT_GRADIENT_CONFIG.noiseStrength,
    frequency: partial?.frequency ?? DEFAULT_GRADIENT_CONFIG.frequency,
    amplitude: partial?.amplitude ?? DEFAULT_GRADIENT_CONFIG.amplitude,
    intensity: partial?.intensity ?? DEFAULT_GRADIENT_CONFIG.intensity,
  };
}

function mergeDitherConfig(partial?: DitherConfig): DitherConfigInternal {
  const normalizedType = normalizeDitherType(
    partial?.ditherType ?? DEFAULT_DITHER_CONFIG.ditherType
  );
  return {
    ditherType: normalizedType,
    ditherStrength: clamp(
      partial?.ditherStrength ?? DEFAULT_DITHER_CONFIG.ditherStrength,
      0,
      1
    ),
    levels: clamp(
      Math.round(partial?.levels ?? DEFAULT_DITHER_CONFIG.levels),
      2,
      16
    ),
    pixelSize: clamp(
      partial?.pixelSize ?? DEFAULT_DITHER_CONFIG.pixelSize,
      0.5,
      8
    ),
    colorFront: normalizeColor(
      partial?.colorFront,
      DEFAULT_DITHER_CONFIG.colorFront
    ),
    colorBack: normalizeColor(
      partial?.colorBack,
      DEFAULT_DITHER_CONFIG.colorBack
    ),
    colorHighlight: normalizeColor(
      partial?.colorHighlight,
      DEFAULT_DITHER_CONFIG.colorHighlight
    ),
    useOriginalColors:
      partial?.useOriginalColors ?? DEFAULT_DITHER_CONFIG.useOriginalColors,
    enabled: partial?.enabled ?? DEFAULT_DITHER_CONFIG.enabled,
  };
}

function mergePerformanceConfig(
  partial?: PerformanceConfig
): Required<PerformanceConfig> {
  const next = { ...DEFAULT_PERFORMANCE_CONFIG };
  if (partial && Object.prototype.hasOwnProperty.call(partial, "renderScale")) {
    next.renderScale = partial.renderScale ?? null;
  }
  return next;
}

function resolveGradientColors(
  config: Pick<GradientConfig, "colorStops" | "colors">
): [string, string, string] {
  if (config.colors && config.colors.length === 3) {
    return [...config.colors] as [string, string, string];
  }

  const stops = (config.colorStops ?? [])
    .slice()
    .sort((a, b) => a.position - b.position);
  if (stops.length >= 3) {
    return [
      stops[0].color,
      stops[Math.floor(stops.length / 2)].color,
      stops[stops.length - 1].color,
    ];
  }
  if (stops.length === 2) {
    return [
      stops[0].color,
      mixColors(stops[0].color, stops[1].color, 0.5),
      stops[1].color,
    ];
  }
  if (stops.length === 1) {
    return [stops[0].color, stops[0].color, stops[0].color];
  }
  return [...DEFAULT_COLORS];
}

function setGradientColors(
  material: GradientMaterial,
  colors: [string, string, string]
) {
  const [c1, c2, c3] = colors.map(hexToRgbNormalized);
  setUniform(material, "colors", colors);
  setUniform(material, "uC1r", c1[0]);
  setUniform(material, "uC1g", c1[1]);
  setUniform(material, "uC1b", c1[2]);
  setUniform(material, "uC2r", c2[0]);
  setUniform(material, "uC2g", c2[1]);
  setUniform(material, "uC2b", c2[2]);
  setUniform(material, "uC3r", c3[0]);
  setUniform(material, "uC3g", c3[1]);
  setUniform(material, "uC3b", c3[2]);
}

function setUniform(material: GradientMaterial, name: string, value: unknown) {
  const materialAny = material as unknown as {
    uniforms?: Record<string, { value: unknown }>;
    userData?: Record<string, { value: unknown }>;
  };

  if (materialAny.userData && materialAny.userData[name]) {
    materialAny.userData[name].value = value;
  }

  if (materialAny.uniforms && materialAny.uniforms[name]) {
    materialAny.uniforms[name].value = value;
  }
}

function setRawUniform(
  material: RawShaderMaterial,
  name: string,
  value: unknown
) {
  if (material.uniforms[name]) {
    material.uniforms[name].value = value;
  }
}

function disposeMesh(mesh: Mesh) {
  mesh.geometry.dispose();
  // MeshPhysicalMaterial handled separately
}

function ensureContainerIsPositioned(container: HTMLElement) {
  if (container !== document.body) {
    const style = window.getComputedStyle(container);
    if (style.position === "static") {
      container.style.position = "relative";
    }
  }
}

let shaderChunksPatched = false;

function ensureShaderChunksPatched() {
  if (shaderChunksPatched) return;
  const chunk = ShaderChunk as unknown as Record<string, string | undefined>;
  chunk["uv2_pars_vertex"] = chunk["uv2_pars_vertex"] ?? "";
  chunk["uv2_vertex"] = chunk["uv2_vertex"] ?? "";
  chunk["uv2_pars_fragment"] = chunk["uv2_pars_fragment"] ?? "";
  chunk["encodings_fragment"] = chunk["encodings_fragment"] ?? "";
  shaderChunksPatched = true;
}

function styleCanvas(canvas: HTMLCanvasElement, isDocumentBody: boolean) {
  canvas.style.position = isDocumentBody ? "fixed" : "absolute";
  canvas.style.inset = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "-1";
  canvas.style.transform = "translateZ(0)";
}

function autoRenderScale(width: number, height: number, dpr: number): number {
  const minDimension = Math.min(width, height);
  if (minDimension <= 720) {
    return 0.6;
  }
  if (dpr >= 2) {
    return 0.75;
  }
  return 1.0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function mixColors(a: string, b: string, t: number): string {
  const rgbA = hexToRgbNormalized(a);
  const rgbB = hexToRgbNormalized(b);
  const mixed: [number, number, number] = [
    lerp(rgbA[0], rgbB[0], t),
    lerp(rgbA[1], rgbB[1], t),
    lerp(rgbA[2], rgbB[2], t),
  ];
  return rgbToHex(mixed);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hexToRgbNormalized(color: string): [number, number, number] {
  let hex = color.trim();
  if (hex.startsWith("#")) {
    hex = hex.slice(1);
  }

  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    return [r / 255, g / 255, b / 255];
  }

  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return [r / 255, g / 255, b / 255];
  }

  return [1, 1, 1];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const toHex = (value: number) => {
    const clamped = clamp(Math.round(value * 255), 0, 255);
    return clamped.toString(16).padStart(2, "0");
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToVec4(color: string): Vector4 {
  const [r, g, b] = hexToRgbNormalized(color);
  return new Vector4(r, g, b, 1);
}

function normalizeColor(value: string | undefined, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return fallback;
  }
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

function normalizeDitherType(type: DitherType): DitherType {
  if (type === "ordered") {
    return "8x8";
  }
  if (type === "blue-noise") {
    return "random";
  }
  return type;
}

function mapDitherType(type: DitherType): number {
  const normalized = normalizeDitherType(type);
  switch (normalized) {
    case "random":
      return DitheringTypes["random"] ?? 1;
    case "2x2":
      return DitheringTypes["2x2"] ?? 2;
    case "4x4":
      return DitheringTypes["4x4"] ?? 3;
    case "8x8":
    default:
      return DitheringTypes["8x8"] ?? 4;
  }
}

export function generateDitheredGradientImage(
  options: DitheredGradientImageOptions
): string {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error(
      "generateDitheredGradientImage can only run in a browser environment"
    );
  }

  const {
    width,
    height,
    time,
    mimeType = "image/png",
    quality,
    container: providedContainer,
    ...rest
  } = options;

  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error("width and height must be positive numbers");
  }

  let container = providedContainer ?? null;
  let createdContainer = false;
  let previousWidth: string | undefined;
  let previousHeight: string | undefined;

  if (!container) {
    container = document.createElement("div");
    createdContainer = true;
    container.style.position = "absolute";
    container.style.left = "-10000px";
    container.style.top = "0";
    document.body.appendChild(container);
  } else {
    previousWidth = container.style.width;
    previousHeight = container.style.height;
  }

  container.style.width = `${Math.round(width)}px`;
  container.style.height = `${Math.round(height)}px`;

  let gradient: DitheredGradient | null = null;

  try {
    gradient = new DitheredGradient({
      ...rest,
      container,
    });

    if (typeof time === "number" && Number.isFinite(time)) {
      gradient.renderFrame(time);
    } else {
      gradient.renderFrame();
    }

    const canvas = gradient.getCanvas();
    return canvas.toDataURL(mimeType, quality);
  } finally {
    gradient?.dispose();

    if (createdContainer && container.parentElement) {
      container.parentElement.removeChild(container);
    } else if (!createdContainer) {
      container.style.width = previousWidth ?? "";
      container.style.height = previousHeight ?? "";
    }
  }
}
