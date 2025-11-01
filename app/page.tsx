"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DitheredGradient,
  generateDitheredGradientImage,
} from "@/lib/backgrounds/dithered-gradient";
import {
  type BackgroundProfile,
  createRandomBackgroundProfile,
  profileToGradient,
} from "@/lib/backgrounds/random-background";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const DITHER_TYPES = ["random", "8x8", "4x4", "2x2"] as const;

type DitherTypeOption = (typeof DITHER_TYPES)[number];

type GradientState = ReturnType<typeof profileToGradient>;

type DitherState = BackgroundProfile["dither"];
type PerformanceState = BackgroundProfile["performance"];

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

function createStateFromProfile(profile: BackgroundProfile, meshShape = 0) {
  return {
    gradient: profileToGradient(profile, meshShape),
    dither: { ...profile.dither },
    performance: { ...profile.performance },
  };
}

export default function Page() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gradientRef = useRef<DitheredGradient | null>(null);

  // Use deterministic default for both SSR and initial client render to avoid hydration mismatch
  const deterministicProfile: BackgroundProfile = useMemo(
    () => ({
      colors: ["#fdfdfd", "#ededed", "#d5d5d5"] as [string, string, string],
      speed: 0,
      noiseStrength: 0.4,
      intensity: 0.36,
      noiseDensityScale: 0.825,
      frequencyScale: 0.945,
      amplitudeScale: 0.95,
      dither: {
        enabled: true,
        ditherType: "4x4" as const,
        ditherStrength: 0.725,
        levels: 4,
        pixelSize: 1.6,
        colorFront: "#ededed",
        colorBack: "#d5d5d5",
        colorHighlight: "#fdfdfd",
        useOriginalColors: false,
      },
      performance: {
        renderScale: 0.89,
      },
    }),
    []
  );

  const [{ gradient, dither, performance }, setConfigs] = useState(() =>
    createStateFromProfile(deterministicProfile)
  );

  const [downloadWidth, setDownloadWidth] = useState(1920);
  const [downloadHeight, setDownloadHeight] = useState(1080);

  const profileToState = useCallback(
    (profile: BackgroundProfile) => createStateFromProfile(profile),
    []
  );

  // Regenerate with random values once mounted on client
  useEffect(() => {
    if (typeof window !== "undefined") {
      setConfigs(profileToState(createRandomBackgroundProfile()));
    }
  }, [profileToState]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const instance = new DitheredGradient({
      container,
      gradient,
      dither,
      performance,
    });
    gradientRef.current = instance;
    instance.start();

    return () => {
      instance.dispose();
      gradientRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    gradientRef.current?.update({
      gradient,
      dither,
      performance,
    });
  }, [gradient, dither, performance]);

  const setGradientValue = (partial: Partial<GradientState>) => {
    setConfigs((prev) => ({
      ...prev,
      gradient: {
        ...prev.gradient,
        ...partial,
      },
    }));
  };

  const setGradientColor = (index: number, color: string) => {
    setConfigs((prev) => {
      const colors = [...(prev.gradient.colors ?? [])] as [
        string,
        string,
        string
      ];
      colors[index] = color;
      return {
        ...prev,
        gradient: {
          ...prev.gradient,
          colors,
        },
        dither: {
          ...prev.dither,
          colorHighlight: colors[0],
          colorFront: colors[1],
          colorBack: colors[2],
        },
      };
    });
  };

  const setDitherValue = (partial: Partial<DitherState>) => {
    setConfigs((prev) => ({
      ...prev,
      dither: {
        ...prev.dither,
        ...partial,
      },
    }));
  };

  const setPerformanceValue = (partial: Partial<PerformanceState>) => {
    setConfigs((prev) => ({
      ...prev,
      performance: {
        ...prev.performance,
        ...partial,
      },
    }));
  };

  const randomizeProfile = () => {
    setConfigs(profileToState(createRandomBackgroundProfile()));
  };

  const handleDownload = () => {
    const width = clamp(downloadWidth, 32, 8192);
    const height = clamp(downloadHeight, 32, 8192);
    setDownloadWidth(width);
    setDownloadHeight(height);
    const dataUrl = generateDitheredGradientImage({
      width,
      height,
      gradient,
      dither,
      performance,
    });
    const link = document.createElement("a");
    const stamp = new Date().toISOString().split("T")[0];
    link.href = dataUrl;
    link.download = `dice-background-${width}x${height}-${stamp}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <main className="flex min-h-screen flex-col">
      <header className="border-b bg-background/70 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Dice by Spicadust
            </h1>
            <p className="text-sm text-muted-foreground">
              Fine-tune WebGL dithered gradients and export them as PNG images.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={randomizeProfile}>
              Randomize
            </Button>
            <Button onClick={handleDownload}>Download PNG</Button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-6xl flex-1 gap-6 p-4 pb-12 lg:grid-cols-[minmax(0,_1fr)_380px]">
        <Card className="relative overflow-hidden rounded-2xl border border-border/60 bg-muted/40">
          <div className="absolute inset-0">
            <div ref={containerRef} className="absolute inset-0" />
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent p-4">
            <div className="pointer-events-auto flex flex-wrap items-center gap-3">
              <ParameterPill
                label="Noise"
                value={gradient.noiseStrength?.toFixed(2) ?? "0.00"}
              />
              <ParameterPill
                label="Frequency"
                value={gradient.frequency?.toFixed(2) ?? "0.00"}
              />
              <ParameterPill
                label="Amplitude"
                value={gradient.amplitude?.toFixed(2) ?? "0.00"}
              />
              <ParameterPill label="Dither" value={dither.ditherType ?? ""} />
            </div>
          </div>
        </Card>

        <Card className="flex h-full flex-col gap-6 overflow-hidden border border-border/60 bg-card p-4 shadow-sm">
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Canvas</h2>
            <div className="grid grid-cols-2 gap-4">
              <NumberField
                label="Width"
                value={downloadWidth}
                onChange={setDownloadWidth}
                min={32}
                max={8192}
              />
              <NumberField
                label="Height"
                value={downloadHeight}
                onChange={setDownloadHeight}
                min={32}
                max={8192}
              />
            </div>
            <div className="space-y-2">
              <Label>Render scale</Label>
              <Slider
                value={[performance.renderScale ?? 1]}
                min={0.5}
                max={1.2}
                step={0.02}
                onValueChange={([value]) =>
                  setPerformanceValue({ renderScale: value })
                }
              />
              <div className="text-xs text-muted-foreground">
                Controls the internal render resolution. Lower values trade
                detail for speed.
              </div>
            </div>
          </div>

          <Separator />

          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Gradient</h2>
            <div className="grid grid-cols-3 gap-4">
              {gradient.colors?.map((color, index) => (
                <div key={index} className="space-y-2">
                  <Label>Color {index + 1}</Label>
                  <Input
                    type="color"
                    value={color}
                    onChange={(event) =>
                      setGradientColor(index, event.target.value)
                    }
                    className="h-10 cursor-pointer"
                  />
                </div>
              ))}
            </div>

            <SliderField
              label="Noise density"
              min={0}
              max={2}
              step={0.01}
              value={gradient.noiseDensity ?? 0}
              onChange={(value) => setGradientValue({ noiseDensity: value })}
            />
            <SliderField
              label="Noise strength"
              min={0}
              max={3}
              step={0.01}
              value={gradient.noiseStrength ?? 0}
              onChange={(value) => setGradientValue({ noiseStrength: value })}
            />
            <SliderField
              label="Frequency"
              min={0}
              max={2}
              step={0.01}
              value={gradient.frequency ?? 0}
              onChange={(value) => setGradientValue({ frequency: value })}
            />
            <SliderField
              label="Amplitude"
              min={0}
              max={2}
              step={0.01}
              value={gradient.amplitude ?? 0}
              onChange={(value) => setGradientValue({ amplitude: value })}
            />
            <SliderField
              label="Intensity"
              min={0}
              max={1}
              step={0.01}
              value={gradient.intensity ?? 0}
              onChange={(value) => setGradientValue({ intensity: value })}
            />
            <SliderField
              label="Speed"
              min={0}
              max={1}
              step={0.01}
              value={gradient.speed ?? 0}
              onChange={(value) => setGradientValue({ speed: value })}
            />
          </section>

          <Separator />

          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Dithering</h2>
            <div className="space-y-2">
              <Label>Dither type</Label>
              <Select
                value={dither.ditherType as DitherTypeOption}
                onValueChange={(value) =>
                  setDitherValue({ ditherType: value as DitherTypeOption })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DITHER_TYPES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <SliderField
              label="Dither strength"
              min={0}
              max={1}
              step={0.01}
              value={dither.ditherStrength ?? 0}
              onChange={(value) => setDitherValue({ ditherStrength: value })}
            />
            <SliderField
              label="Palette levels"
              min={2}
              max={16}
              step={1}
              value={dither.levels ?? 0}
              onChange={(value) =>
                setDitherValue({ levels: Math.round(value) })
              }
            />
            <SliderField
              label="Pixel size"
              min={0.5}
              max={8}
              step={0.1}
              value={dither.pixelSize ?? 0}
              onChange={(value) => setDitherValue({ pixelSize: value })}
            />
            <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
              <div>
                <Label className="font-medium">Use original colors</Label>
                <p className="text-xs text-muted-foreground">
                  Blend quantized dither with the gradient colors.
                </p>
              </div>
              <Switch
                checked={dither.useOriginalColors ?? false}
                onCheckedChange={(checked) =>
                  setDitherValue({ useOriginalColors: checked })
                }
              />
            </div>
            <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
              <div>
                <Label className="font-medium">Enabled</Label>
                <p className="text-xs text-muted-foreground">
                  Toggle dithering post-processing.
                </p>
              </div>
              <Switch
                checked={dither.enabled ?? false}
                onCheckedChange={(checked) =>
                  setDitherValue({ enabled: checked })
                }
              />
            </div>
          </section>
        </Card>
      </section>
    </main>
  );
}

function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  const precision = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-xs tabular-nums text-muted-foreground">
          {value.toFixed(precision)}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([newValue]) => onChange(newValue)}
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={label}>{label}</Label>
      <Input
        id={label}
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (!Number.isNaN(next)) {
            onChange(next);
          }
        }}
      />
    </div>
  );
}

function ParameterPill({ label, value }: { label: string; value: string }) {
  return (
    <span
      className={cn(
        "rounded-full border border-white/60 bg-white/80 px-3 py-1 text-xs font-medium text-gray-700 shadow-sm backdrop-blur"
      )}
    >
      {label}: <span className="font-semibold">{value}</span>
    </span>
  );
}
