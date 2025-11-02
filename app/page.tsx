"use client";

import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { HexColorPicker } from "react-colorful";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const HEX_6 = /^#[0-9A-F]{6}$/;
const HEX_3 = /^#[0-9A-F]{3}$/;

const normalizeHexColor = (value: string) => {
  const uppercase = value.toUpperCase();
  if (HEX_6.test(uppercase)) {
    return uppercase;
  }
  if (HEX_3.test(uppercase)) {
    const r = uppercase[1] ?? "0";
    const g = uppercase[2] ?? "0";
    const b = uppercase[3] ?? "0";
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return uppercase.startsWith("#")
    ? uppercase.slice(0, 7)
    : `#${uppercase.slice(0, 6)}`;
};

const isValidHexColor = (value: string) =>
  HEX_6.test(value.toUpperCase()) || HEX_3.test(value.toUpperCase());

const sanitizeHexInput = (value: string) => {
  const uppercase = value.toUpperCase();
  const stripped = uppercase.replace(/[^0-9A-F]/g, "").slice(0, 6);
  return `#${stripped}`;
};

const isHexColorDark = (value: string) => {
  const normalized = normalizeHexColor(value);
  if (!HEX_6.test(normalized)) {
    return false;
  }
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  const luminance =
    0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);
  return luminance < 0.6;
};

function createStateFromProfile(profile: BackgroundProfile, meshShape = 0) {
  return {
    gradient: profileToGradient(profile, meshShape),
    dither: {
      ...profile.dither,
      useOriginalColors: profile.dither.useOriginalColors ?? false,
    },
  };
}

export default function Page() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gradientRef = useRef<DitheredGradient | null>(null);
  const backgroundContainerRef = useRef<HTMLDivElement>(null);
  const backgroundGradientRef = useRef<DitheredGradient | null>(null);
  const [hasInitializedRandom, setHasInitializedRandom] = useState(false);
  const hasInitializedGradient = useRef(false);

  // Use deterministic default for both SSR and initial client render to avoid hydration mismatch
  const deterministicProfile: BackgroundProfile = useMemo(
    () => ({
      colors: ["#fdfdfd", "#ededed", "#d5d5d5"] as [string, string, string],
      speed: 1,
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

  const [{ gradient, dither }, setConfigs] = useState(() =>
    createStateFromProfile(deterministicProfile)
  );

  const [meshTime, setMeshTime] = useState(0);
  const [downloadWidth, setDownloadWidth] = useState(1920);
  const [downloadHeight, setDownloadHeight] = useState(1080);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const performance = useMemo(() => ({ renderScale: null }), []);

  // Generate a random profile for the page background
  const backgroundProfile = useMemo(() => {
    if (typeof window === "undefined") {
      return deterministicProfile;
    }
    return createRandomBackgroundProfile();
  }, [deterministicProfile]);

  const backgroundState = useMemo(() => {
    const state = createStateFromProfile(backgroundProfile);
    return {
      gradient: {
        ...state.gradient,
        speed: 0,
      },
      dither: state.dither,
    };
  }, [backgroundProfile]);

  const previewAspectRatio = useMemo(() => {
    if (!Number.isFinite(downloadWidth) || !Number.isFinite(downloadHeight)) {
      return 16 / 9;
    }
    if (downloadHeight <= 0) {
      return 16 / 9;
    }
    return downloadWidth / Math.max(downloadHeight, 1);
  }, [downloadWidth, downloadHeight]);

  const profileToState = useCallback(
    (profile: BackgroundProfile) => createStateFromProfile(profile),
    []
  );

  // Regenerate with random values once mounted on client
  useEffect(() => {
    if (typeof window !== "undefined" && !hasInitializedRandom) {
      setConfigs(profileToState(createRandomBackgroundProfile()));
      setMeshTime(Math.random() * 10);
      setHasInitializedRandom(true);
    }
  }, [profileToState, hasInitializedRandom]);

  // Initialize preview gradient when container is ready and random profile is set
  useEffect(() => {
    if (!hasInitializedRandom || hasInitializedGradient.current) return;

    const container = containerRef.current;
    if (!container) return;

    // Only initialize if we don't have an instance yet
    if (gradientRef.current) return;

    // Wait for next frame to ensure container is properly sized and state is updated
    const timeoutId = setTimeout(() => {
      if (
        gradientRef.current ||
        !containerRef.current ||
        hasInitializedGradient.current
      )
        return;

      const instance = new DitheredGradient({
        container: containerRef.current,
        gradient,
        dither,
        performance,
      });
      gradientRef.current = instance;
      instance.setManualTime(meshTime);
      instance.start();
      hasInitializedGradient.current = true;
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      if (gradientRef.current) {
        gradientRef.current.dispose();
        gradientRef.current = null;
        hasInitializedGradient.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasInitializedRandom, gradient, dither, performance]);

  // Update preview gradient when state changes (only if already initialized)
  useEffect(() => {
    if (!gradientRef.current || !hasInitializedRandom) return;

    gradientRef.current.update({
      gradient,
      dither,
      performance,
    });
  }, [gradient, dither, performance, hasInitializedRandom]);

  useEffect(() => {
    gradientRef.current?.setManualTime(meshTime);
  }, [meshTime]);

  // Initialize background gradient
  useEffect(() => {
    const container = backgroundContainerRef.current;
    if (!container) return;

    const instance = new DitheredGradient({
      container,
      gradient: backgroundState.gradient,
      dither: backgroundState.dither,
      performance,
    });
    backgroundGradientRef.current = instance;
    instance.start();

    return () => {
      instance.dispose();
      backgroundGradientRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Generate preview image when configuration changes
  useEffect(() => {
    if (!hasInitializedRandom || typeof window === "undefined") return;

    const previewMaxSize = 800;
    const aspectRatio = previewAspectRatio;
    let previewWidth = previewMaxSize;
    let previewHeight = previewMaxSize / aspectRatio;

    // If height would be too large, constrain by height instead
    if (previewHeight > previewMaxSize) {
      previewHeight = previewMaxSize;
      previewWidth = previewMaxSize * aspectRatio;
    }

    try {
      const dataUrl = generateDitheredGradientImage({
        width: Math.round(previewWidth),
        height: Math.round(previewHeight),
        gradient,
        dither,
        performance,
        time: meshTime,
      });
      setPreviewImageUrl(dataUrl);
    } catch (error) {
      console.error("Failed to generate preview image:", error);
      setPreviewImageUrl(null);
    }
  }, [
    gradient,
    dither,
    performance,
    previewAspectRatio,
    hasInitializedRandom,
    meshTime,
  ]);

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

  const randomizeProfile = () => {
    setConfigs(profileToState(createRandomBackgroundProfile()));
    setMeshTime(Math.random() * 10);
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
      time: meshTime,
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
    <>
      <div
        ref={backgroundContainerRef}
        className="fixed inset-0 -z-10"
        aria-hidden="true"
      />
      <main className="relative flex min-h-screen flex-col">
        <header className="border-b bg-background/70 backdrop-blur">
          <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-4 px-4 py-4">
            <div>
              <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
                Dice
                <a
                  href="https://github.com/AirswitchAsa/dice"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center transition-colors"
                  aria-label="View on GitHub"
                >
                  <svg
                    className="h-5 w-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                      clipRule="evenodd"
                    />
                  </svg>
                </a>
              </h1>
              <p className="text-sm text-muted-foreground">
                Fine-tune dithered mesh gradients. Made by{" "}
                <a
                  href="https://spicadust.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground transition-colors hover:text-primary hover:underline"
                >
                  Spicadust.
                </a>
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

        <section className="mx-auto grid w-full max-w-[1252px] flex-1 gap-6 p-4 pb-12 lg:grid-cols-[minmax(0,_1fr)_380px]">
          <Card className="flex aspect-square w-full max-w-full self-center flex-col overflow-hidden border border-border/60 bg-card shadow-sm">
            {previewImageUrl ? (
              <div className="flex h-full w-full items-center justify-center">
                <img
                  src={previewImageUrl}
                  alt="Preview"
                  className="object-contain"
                  style={{
                    aspectRatio: previewAspectRatio,
                    maxWidth: "80%",
                    maxHeight: "80%",
                  }}
                />
              </div>
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <span className="text-sm">Generating preview...</span>
              </div>
            )}
          </Card>

          <Card className="flex flex-col gap-6 overflow-hidden border border-border/60 bg-card p-4 shadow-sm self-center">
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
            </div>

            <Separator />

            <section className="space-y-4">
              <h2 className="text-lg font-semibold">Gradient</h2>
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Colors</h3>
                <div className="grid grid-cols-3 gap-2">
                  {gradient.colors?.map((color, index) => (
                    <ColorPickerField
                      key={index}
                      value={color}
                      onChange={(nextColor) =>
                        setGradientColor(index, nextColor)
                      }
                    />
                  ))}
                </div>
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
                label="Mesh time"
                min={0}
                max={10}
                step={0.01}
                value={meshTime}
                onChange={(value) => setMeshTime(value)}
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
              <div className="flex items-center justify-between gap-2">
                <Label>Original Colors</Label>
                <Switch
                  checked={dither.useOriginalColors ?? false}
                  onCheckedChange={(checked) =>
                    setDitherValue({ useOriginalColors: checked })
                  }
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label>Dither</Label>
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

        <footer className="mx-auto w-full max-w-[1252px] px-4 pb-12">
          <div className="flex flex-col items-center border-t border-border/60 pt-8">
            <div className="rounded-full bg-white/60 border border-border/40 px-2 py-0.5">
              <div className="flex flex-wrap items-center justify-center gap-1 text-sm text-muted-foreground">
                <div className="flex items-center">
                  <span>Built with</span>
                  <a
                    href="https://github.com/paper-design/shaders"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-foreground transition-colors hover:text-primary ml-1 hover:underline"
                  >
                    @paper-design/shaders
                  </a>
                </div>
                <div className="flex items-center gap-1">
                  <span>and</span>
                  <a
                    href="https://github.com/ruucm/shadergradient"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-foreground transition-colors hover:text-primary hover:underline"
                  >
                    @ruucm/shadergradient
                  </a>
                </div>
              </div>
            </div>
            <div className="rounded-full bg-white/60 border border-border/40 px-2 py-0.5 mt-4">
              <div className="text-xs text-muted-foreground">
                © {new Date().getFullYear()} Spicadust Inc. All rights reserved.
              </div>
            </div>
          </div>
        </footer>
      </main>
    </>
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

function ColorPickerField({
  label,
  value,
  onChange,
}: {
  label?: string;
  value: string;
  onChange: (color: string) => void;
}) {
  const [inputValue, setInputValue] = useState(() => normalizeHexColor(value));
  const [pickerColor, setPickerColor] = useState(() =>
    normalizeHexColor(value)
  );

  useEffect(() => {
    const normalized = normalizeHexColor(value);
    setInputValue(normalized);
    setPickerColor(normalized);
  }, [value]);

  const handlePickerChange = useCallback(
    (next: string) => {
      const normalized = normalizeHexColor(next);
      setPickerColor(normalized);
      setInputValue(normalized);
      onChange(normalized);
    },
    [onChange]
  );

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const sanitized = sanitizeHexInput(event.target.value);
      setInputValue(sanitized);
      if (isValidHexColor(sanitized)) {
        const normalized = normalizeHexColor(sanitized);
        setPickerColor(normalized);
        onChange(normalized);
      }
    },
    [onChange]
  );

  const handleInputBlur = useCallback(() => {
    if (!isValidHexColor(inputValue)) {
      setInputValue(pickerColor);
    }
  }, [inputValue, pickerColor]);

  const textIsLight = isHexColorDark(pickerColor);
  const buttonClasses = cn(
    "group flex h-10 w-full items-center justify-between rounded-md border px-3 text-sm font-medium shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    textIsLight ? "border-white/60" : "border-border/60"
  );
  const inputId = useMemo(
    () => `${(label || "color").replace(/\s+/g, "-").toLowerCase()}-hex`,
    [label]
  );

  return (
    <div className="space-y-2">
      {label && <Label>{label}</Label>}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={buttonClasses}
            style={{ backgroundColor: pickerColor }}
          >
            <span className="flex items-center gap-2">
              <span
                className="size-6 rounded-full border border-white/60 shadow-sm"
                style={{ backgroundColor: pickerColor }}
              />
              <span
                className={cn(
                  "font-mono text-xs uppercase tracking-wide",
                  textIsLight ? "text-white/90" : "text-slate-900"
                )}
              >
                {pickerColor}
              </span>
            </span>
            <span
              className={cn(
                "text-xs font-semibold uppercase tracking-wide",
                textIsLight ? "text-white/80" : "text-slate-700"
              )}
            ></span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 space-y-4 p-4 bg-white" align="start">
          <div className="space-y-3">
            <HexColorPicker
              color={pickerColor}
              onChange={handlePickerChange}
              className="h-48 w-full"
            />
            <div className="space-y-1.5">
              <Label htmlFor={inputId} className="text-xs uppercase">
                Hex value
              </Label>
              <Input
                id={inputId}
                value={inputValue}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                className="font-mono text-sm uppercase"
                spellCheck={false}
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
