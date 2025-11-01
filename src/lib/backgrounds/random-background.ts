import {
  type DitherConfig,
  type DitherType,
  type GradientConfig,
  type PerformanceConfig,
  generateDitheredGradientImage,
  type DitheredGradientImageOptions,
} from "./dithered-gradient";

export type BackgroundProfile = {
  colors: [string, string, string];
  speed: number;
  noiseStrength: number;
  intensity: number;
  noiseDensityScale: number;
  frequencyScale: number;
  amplitudeScale: number;
  dither: DitherConfig;
  performance: PerformanceConfig;
};

const BACKGROUND_PALETTES: [string, string, string][] = [
  ["#fdfdfd", "#ededed", "#d5d5d5"],
  ["#fafafa", "#e7e7e7", "#cfcfcf"],
  ["#f7f7f7", "#e2e2e2", "#cbcbcb"],
  ["#f5f5f5", "#dadada", "#c0c0c0"],
  ["#ffffff", "#ececec", "#d4d4d4"],
];

const DITHER_CHOICES: DitherType[] = ["8x8", "4x4", "2x2"];

export function createRandomBackgroundProfile(
  rng: () => number = Math.random
): BackgroundProfile {
  const palette =
    BACKGROUND_PALETTES[Math.floor(rng() * BACKGROUND_PALETTES.length)];
  const noiseStrength = 0.35 + rng() * 0.15;
  const intensity = 0.3 + rng() * 0.12;

  return {
    colors: palette,
    speed: 0,
    noiseStrength,
    intensity,
    noiseDensityScale: 0.7 + rng() * 0.25,
    frequencyScale: 0.82 + rng() * 0.25,
    amplitudeScale: 0.85 + rng() * 0.2,
    dither: {
      enabled: true,
      ditherType: DITHER_CHOICES[Math.floor(rng() * DITHER_CHOICES.length)],
      ditherStrength: 0.6 + rng() * 0.25,
      levels: 3 + Math.floor(rng() * 3),
      pixelSize: 1.1 + rng() * 1,
      colorFront: palette[1],
      colorBack: palette[2],
      colorHighlight: palette[0],
      useOriginalColors: false,
    },
    performance: {
      renderScale: 0.84 + rng() * 0.1,
    },
  };
}

export function profileToGradient(
  profile: BackgroundProfile,
  meshShape: number
): GradientConfig {
  const shape = resolveGradientShape(meshShape);
  return {
    colors: profile.colors,
    speed: profile.speed,
    noiseDensity: shape.noiseDensity * profile.noiseDensityScale,
    noiseStrength: profile.noiseStrength,
    frequency: shape.frequency * profile.frequencyScale,
    amplitude: shape.amplitude * profile.amplitudeScale,
    intensity: profile.intensity,
  };
}

export type RandomBackgroundImageOptions = {
  width: number;
  height: number;
  meshShape?: number;
  rng?: () => number;
} & Omit<DitheredGradientImageOptions, "width" | "height" | "gradient" | "dither" | "performance">;

export function generateRandomBackgroundImage({
  width,
  height,
  meshShape = 0,
  rng,
  ...rest
}: RandomBackgroundImageOptions): string {
  const random = rng ?? Math.random;
  const profile = createRandomBackgroundProfile(random);
  const gradient = profileToGradient(profile, meshShape);
  return generateDitheredGradientImage({
    width,
    height,
    gradient,
    dither: profile.dither,
    performance: profile.performance,
    ...rest,
  });
}

function resolveGradientShape(value: number) {
  const t = Math.min(Math.max(value / 4, 0), 1);
  return {
    noiseDensity: 0.8 + t * 0.8,
    frequency: 1.0 + t * 0.5,
    amplitude: 0.6 + t * 0.3,
  };
}
