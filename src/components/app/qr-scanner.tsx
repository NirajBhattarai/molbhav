"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { outlineButton, primaryButton } from "@/components/ui/styles";

type Detector = { detect(src: HTMLVideoElement): Promise<{ rawValue: string }[]> };

/** Reads a QR from a still photo, trying a few sizes. */
async function decodePhoto(file: File): Promise<string> {
  const jsQR = (await import("jsqr")).default;
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return "";
  try {
    for (const side of [1200, 800, 1800, 500]) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const hit = jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" });
      if (hit?.data) return hit.data;
    }
  } finally {
    bitmap.close();
  }
  return "";
}

/**
 * Live camera QR scan. Uses BarcodeDetector where available, jsQR on frames otherwise.
 * If the live camera can't start, a photo capture works instead.
 */
export function QrScanner({
  onResult,
  onCancel,
}: {
  onResult: (text: string) => void;
  onCancel: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const result = useRef(onResult);
  useEffect(() => {
    result.current = onResult;
  });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let alive = true;
    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError("The live camera isn’t available here. Take a photo of your QR instead.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (!alive || !video.current) return stream.getTracks().forEach((t) => t.stop());
        video.current.srcObject = stream;
        await video.current.play();
        setReady(true);

        const BD = (
          window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }
        ).BarcodeDetector;
        const native = BD ? new BD({ formats: ["qr_code"] }) : null;
        const jsQR = native ? null : (await import("jsqr")).default;
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        const tick = async () => {
          const v = video.current;
          if (!alive || !v) return;
          let text = "";
          if (v.videoWidth) {
            if (native) {
              text = (await native.detect(v).catch(() => []))[0]?.rawValue ?? "";
            } else if (jsQR && ctx) {
              const scale = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
              canvas.width = Math.round(v.videoWidth * scale);
              canvas.height = Math.round(v.videoHeight * scale);
              ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              text =
                jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data ??
                "";
            }
          }
          if (!alive) return;
          if (text) return result.current(text);
          timer = window.setTimeout(() => void tick(), native ? 120 : 160);
        };
        void tick();
      } catch (e) {
        setError(
          (e as Error).name === "NotAllowedError"
            ? "Camera access is off. Allow it in Settings, or take a photo of your QR instead."
            : "The camera didn’t start. Take a photo of your QR instead.",
        );
      }
    })();
    return () => {
      alive = false;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="grid gap-3">
      {error ? (
        <>
          <p className="text-sm text-pretty text-muted-foreground">{error}</p>
          <label
            className={`${primaryButton} w-full cursor-pointer ${photoBusy ? "pointer-events-none opacity-60" : ""}`}
          >
            {photoBusy ? (
              <Loader2 className="size-5 motion-safe:animate-spin" aria-hidden />
            ) : (
              <Camera className="size-5" aria-hidden />
            )}
            {photoBusy ? "Reading the QR…" : "Take a photo of your QR"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setPhotoBusy(true);
                setPhotoError("");
                try {
                  const text = await decodePhoto(file);
                  if (text) result.current(text);
                  else
                    setPhotoError(
                      "No QR found in that photo. Hold the phone closer so the QR fills the picture.",
                    );
                } catch {
                  setPhotoError("Couldn’t read that photo. Try again, or type your UPI ID.");
                } finally {
                  setPhotoBusy(false);
                }
              }}
            />
          </label>
          {photoError && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {photoError}
            </p>
          )}
        </>
      ) : (
        <div className="relative overflow-hidden rounded-2xl bg-foreground">
          <video
            ref={video}
            playsInline
            muted
            className="aspect-square w-full object-cover"
            aria-label="Camera view for scanning your UPI QR"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-[16%] rounded-2xl border-4 border-secondary"
          />
          {!ready && (
            <p className="absolute inset-x-0 bottom-3 text-center text-sm font-semibold text-background">
              Opening camera…
            </p>
          )}
        </div>
      )}
      <button type="button" onClick={onCancel} className={`${outlineButton} w-full`}>
        {error ? "Type my UPI ID instead" : "Stop scanning"}
      </button>
    </div>
  );
}
