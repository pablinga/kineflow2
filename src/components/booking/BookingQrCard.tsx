"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode, { type QRCodeRenderersOptions } from "qrcode";
import { Download } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";

type BookingQrCardProps = {
  bookingUrl: string;
  workspaceName: string;
};

// ocean-700 de tailwind.config.ts (color de marca de la app).
const BRAND_COLOR = "#0B43AE";
// Corrección "H" (~30%): el QR sigue leyéndose con el logo tapando el centro.
const QR_OPTIONS: QRCodeRenderersOptions = {
  color: { dark: "#000000", light: "#ffffff" },
  errorCorrectionLevel: "H",
  margin: 4,
};
const LOGO_SRC = "/icon-512.png";
// Lado del logo respecto del QR: ~20% queda holgado dentro de la corrección H.
const LOGO_RATIO = 0.2;

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;
const CARD_PADDING_X = 90;

// El QR lleva ?src=qr (o &src=qr) para distinguir el origen de la visita; el
// link que se muestra y se copia queda sin el parámetro.
function buildQrUrl(bookingUrl: string) {
  try {
    const url = new URL(bookingUrl);
    url.searchParams.set("src", "qr");
    return url.toString();
  } catch {
    return bookingUrl;
  }
}

function downloadBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Dar tiempo a que el navegador tome el archivo antes de liberar la URL.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("No pudimos generar la imagen."));
      }
    }, "image/png");
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No pudimos cargar el logo."));
    image.src = src;
  });
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

// Achica la fuente hasta que el texto entre en el ancho disponible.
function fitFontSize(
  context: CanvasRenderingContext2D,
  text: string,
  fontFamily: string,
  weight: string,
  maxSize: number,
  minSize: number,
  maxWidth: number,
) {
  let size = maxSize;

  while (size > minSize) {
    context.font = `${weight} ${size}px ${fontFamily}`;

    if (context.measureText(text).width <= maxWidth) {
      break;
    }

    size -= 2;
  }

  context.font = `${weight} ${size}px ${fontFamily}`;
  return size;
}

// Parte el nombre en hasta dos líneas; si aun así no entra, corta con "…".
function wrapToTwoLines(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (context.measureText(text).width <= maxWidth) {
    return [text];
  }

  const words = text.split(/\s+/);
  let firstLine = "";
  let index = 0;

  while (index < words.length) {
    const candidate = firstLine ? `${firstLine} ${words[index]}` : words[index];

    if (context.measureText(candidate).width > maxWidth && firstLine) {
      break;
    }

    firstLine = candidate;
    index += 1;
  }

  let secondLine = words.slice(index).join(" ");

  while (secondLine && context.measureText(`${secondLine}…`).width > maxWidth) {
    secondLine = secondLine.slice(0, -1).trimEnd();
  }

  const truncated = secondLine !== words.slice(index).join(" ");
  const lines = [firstLine];

  if (secondLine) {
    lines.push(truncated ? `${secondLine}…` : secondLine);
  }

  return lines;
}

async function drawShareCard(qrUrl: string, workspaceName: string) {
  await document.fonts.ready;
  const fontFamily = getComputedStyle(document.body).fontFamily || "sans-serif";
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Tu navegador no permite generar la tarjeta.");
  }

  const maxTextWidth = CARD_WIDTH - CARD_PADDING_X * 2;

  context.fillStyle = BRAND_COLOR;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  context.fillStyle = "#ffffff";
  context.textAlign = "center";
  context.textBaseline = "alphabetic";

  const titleSize = fitFontSize(
    context,
    "Reservá tu turno online",
    fontFamily,
    "700",
    80,
    48,
    maxTextWidth,
  );
  let cursorY = 110 + titleSize;
  context.fillText("Reservá tu turno online", CARD_WIDTH / 2, cursorY);

  const nameSize = fitFontSize(context, workspaceName, fontFamily, "500", 48, 34, maxTextWidth);
  const nameLines = wrapToTwoLines(context, workspaceName, maxTextWidth);
  cursorY += 28;

  for (const line of nameLines) {
    cursorY += nameSize + 10;
    context.fillText(line, CARD_WIDTH / 2, cursorY);
  }

  const qrSize = 620;
  const boxPadding = 36;
  const boxSize = qrSize + boxPadding * 2;
  const boxX = (CARD_WIDTH - boxSize) / 2;
  const boxY = Math.max(cursorY + 56, 330);

  context.fillStyle = "#ffffff";
  roundedRect(context, boxX, boxY, boxSize, boxSize, 40);
  context.fill();

  const qrCanvas = document.createElement("canvas");
  const [, logo] = await Promise.all([
    QRCode.toCanvas(qrCanvas, qrUrl, { ...QR_OPTIONS, width: qrSize }),
    loadImage(LOGO_SRC),
  ]);
  const qrX = boxX + boxPadding;
  const qrY = boxY + boxPadding;
  context.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

  // Logo al centro sobre un recuadro blanco, para que no se mezcle con los módulos.
  const logoSize = Math.round(qrSize * LOGO_RATIO);
  const logoPadding = 14;
  const logoX = qrX + (qrSize - logoSize) / 2;
  const logoY = qrY + (qrSize - logoSize) / 2;
  context.fillStyle = "#ffffff";
  roundedRect(
    context,
    logoX - logoPadding,
    logoY - logoPadding,
    logoSize + logoPadding * 2,
    logoSize + logoPadding * 2,
    28,
  );
  context.fill();
  context.drawImage(logo, logoX, logoY, logoSize, logoSize);

  context.fillStyle = "#ffffff";
  fitFontSize(
    context,
    "Escaneá el código con la cámara de tu celular",
    fontFamily,
    "500",
    38,
    26,
    maxTextWidth,
  );
  context.fillText(
    "Escaneá el código con la cámara de tu celular",
    CARD_WIDTH / 2,
    boxY + boxSize + 78,
  );

  context.globalAlpha = 0.7;
  context.font = `500 28px ${fontFamily}`;
  context.fillText("con KineFlow · kineflow.ar", CARD_WIDTH / 2, CARD_HEIGHT - 64);
  context.globalAlpha = 1;

  return canvasToBlob(canvas);
}

/**
 * QR del link público de reservas con el logo de KineFlow al centro: vista
 * previa y descarga de una tarjeta vertical lista para imprimir o compartir.
 * Todo se genera en el navegador.
 */
export function BookingQrCard({ bookingUrl, workspaceName }: BookingQrCardProps) {
  const qrUrl = useMemo(() => buildQrUrl(bookingUrl), [bookingUrl]);
  const [previewSrc, setPreviewSrc] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    QRCode.toString(qrUrl, { ...QR_OPTIONS, type: "svg" })
      .then((svg) => {
        if (!cancelled) {
          setPreviewSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("No pudimos generar el código QR.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [qrUrl]);

  async function runDownload(action: () => Promise<void>) {
    setBusy(true);
    setError("");

    try {
      await action();
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "No pudimos generar la descarga.",
      );
    } finally {
      setBusy(false);
    }
  }

  function downloadCard() {
    return runDownload(async () => {
      downloadBlob(
        await drawShareCard(qrUrl, workspaceName.trim() || "Mi consultorio"),
        "kineflow-qr-reservas.png",
      );
    });
  }

  return (
    <div className="mt-4 border-t border-ocean-100 pt-4">
      <div className="flex justify-center">
        {previewSrc ? (
          <div className="relative h-[180px] w-[180px]">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL generada en el cliente */}
            <img
              alt="Código QR del link de reservas"
              className="h-[180px] w-[180px] rounded-lg border border-ocean-100 bg-white"
              height={180}
              src={previewSrc}
              width={180}
            />
            <span className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg bg-white p-1">
              {/* eslint-disable-next-line @next/next/no-img-element -- ícono estático de /public */}
              <img alt="" className="h-full w-full" height={32} src={LOGO_SRC} width={32} />
            </span>
          </div>
        ) : (
          <div className="h-[180px] w-[180px] animate-pulse rounded-lg bg-ocean-50" />
        )}
      </div>

      {error ? (
        <Alert className="mt-3" tone="error">
          {error}
        </Alert>
      ) : null}

      <Button
        className="mt-4 w-full"
        disabled={busy}
        onClick={downloadCard}
        type="button"
        variant="secondary"
      >
        <Download className="h-4 w-4" />
        {busy ? "Generando..." : "Descargar QR"}
      </Button>
    </div>
  );
}
