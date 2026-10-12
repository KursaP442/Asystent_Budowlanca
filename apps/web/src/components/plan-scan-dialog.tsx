"use client";

import { useEffect, useRef, useState } from "react";
import { CadDocumentSchema, type CadDocument } from "@asystent/schemas";
import { cadError, cadRequest } from "@/lib/cad-client";
import { getSupabaseClient } from "@/lib/supabase";

async function rasterize(file: File, pageNumber: number): Promise<Blob> {
  if (!file.size || file.size > 10485760) throw new Error("Wybierz niepusty plik do 10 MB.");
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Przeglądarka nie udostępnia obsługi obrazów.");
  if (file.type === "application/pdf") {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const pdf = await task.promise;
    try {
      if (pageNumber > pdf.numPages) throw new Error(`PDF ma ${pdf.numPages} stron. Wybierz prawidłową stronę.`);
      const page = await pdf.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(3, 2400 / Math.max(base.width, base.height)) });
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
    } finally { await task.destroy(); }
  } else {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Wybierz PDF, JPEG, PNG lub WebP.");
    const image = await createImageBitmap(file);
    try {
      if (!image.width || !image.height || image.width * image.height > 25000000) throw new Error("Obraz może mieć maksymalnie 25 megapikseli.");
      const scale = Math.min(1, 2400 / Math.max(image.width, image.height));
      canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    } finally { image.close(); }
  }
  const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Nie można odczytać skanu.")), "image/png"));
  if (png.size > 10485760) throw new Error("Po przetworzeniu skan przekracza 10 MB. Wybierz mniejszy plik.");
  return png;
}

export function PlanScanDialog({ drawing, onClose, onImport }: {
  drawing: CadDocument; onClose: () => void; onImport: (next: CadDocument) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [consent, setConsent] = useState(false);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.focus();
    return () => { if (previous instanceof HTMLElement) previous.focus(); };
  }, []);
  async function keyAction(remove = false) {
    setBusy(true); setError(""); setNotice("");
    try {
      await cadRequest("/api/ai/key", remove ? null : { key }, remove ? "DELETE" : "PUT");
      setKey(""); setNotice(remove ? "Usunięto klucz AI." : "Zapisano zaszyfrowany klucz. Nie jest udostępniany przeglądarce.");
    } catch (cause) { setError(cadError(cause)); } finally { setBusy(false); }
  }
  async function scan() {
    if (!file || !consent) { setError("Wybierz plik i potwierdź zgodę na płatną analizę."); return; }
    setBusy(true); setError(""); setNotice("");
    const uploadedPaths: string[] = [];
    try {
      const png = await rasterize(file, pageNumber);
      const { data, error: sessionError } = await getSupabaseClient().auth.getUser();
      if (sessionError) throw sessionError;
      if (!data.user) throw new Error("Sesja wygasła.");
      const sourceId = crypto.randomUUID();
      const uploadedPath = `${data.user.id}/${drawing.projectId}/${sourceId}.png`;
      const extension = file.type === "application/pdf" ? "pdf" : file.type === "image/jpeg" ? "jpg" : file.type === "image/webp" ? "webp" : "png";
      const originalPath = `${data.user.id}/${drawing.projectId}/${sourceId}-original.${extension}`;
      const storage = getSupabaseClient().storage.from("project-scans");
      const { error: originalError } = await storage.upload(originalPath, file, { contentType: file.type });
      if (originalError) throw originalError;
      uploadedPaths.push(originalPath);
      const { error: uploadError } = await storage.upload(uploadedPath, png, { contentType: "image/png" });
      if (uploadError) throw uploadError;
      uploadedPaths.push(uploadedPath);
      setNotice("AI odczytuje wybraną stronę i przygotowuje elementy do edycji…");
      const response = await cadRequest("/api/cad/scan", {
        projectId: drawing.projectId, requirementId: drawing.requirementId, sourceId, consent: true,
        page: file.type === "application/pdf" ? pageNumber : 1, originalExtension: extension,
      });
      if (!response || typeof response !== "object" || !("entities" in response) || !("sourceImage" in response)) throw new Error("Nieprawidłowa odpowiedź analizy.");
      const next = CadDocumentSchema.parse({
        ...drawing, calibration: null, sourceImage: response.sourceImage, status: "draft",
        importWarnings: "warnings" in response ? response.warnings : [],
        // Replacing a scan is explicit; mixing two differently scaled scans is not supported.
        entities: response.entities,
      });
      onImport(next); uploadedPaths.length = 0;
      onClose();
    } catch (cause) {
      let message = cadError(cause);
      if (uploadedPaths.length) {
        const { error: cleanupError } = await getSupabaseClient().storage.from("project-scans").remove(uploadedPaths);
        if (cleanupError) message += " Nie udało się usunąć nieudanego importu z prywatnego magazynu.";
      }
      setError(message);
    } finally { setBusy(false); }
  }
  return <div className="cad-modal-backdrop"><section ref={dialogRef} tabIndex={-1} className="cad-scan-dialog form-stack" role="dialog"
    aria-modal="true" aria-labelledby="scan-dialog-title" onKeyDown={(event) => {
      if (event.key === "Escape" && !busy) onClose();
      if (event.key === "Tab") {
        const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled),summary"))
          .filter((element) => element.getClientRects().length > 0);
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
    <div className="cad-heading"><h2 id="scan-dialog-title">Skanuj lub importuj projekt</h2>
      <button type="button" className="quiet-button" disabled={busy} onClick={onClose} aria-label="Zamknij skanowanie">×</button></div>
    <p>Wybierz rysunek bieżącego etapu. AI naniesie edytowalną propozycję na płótno. Następnie ustaw skalę
      dwoma punktami, sprawdź obrysy i uzupełnij parametry. Nie zatwierdzamy automatycznie konstrukcji ani zbrojenia.</p>
    <p>Użyj prostego skanu lub zdjęcia wykonanego prostopadle do kartki. Ten import nie koryguje perspektywy
      i nie gwarantuje dokładnego odtworzenia wymiarów.</p>
    {drawing.entities.length > 0 && <p className="alert alert-error">Import zastąpi bieżący rysunek. Możesz cofnąć tę zmianę przyciskiem „Cofnij”.</p>}
    {error && <div className="alert alert-error" role="alert">{error}</div>}
    {notice && <p role="status">{notice}</p>}
    <fieldset disabled={busy}>
      <label>Projekt PDF lub zdjęcie<input type="file" accept="application/pdf,image/png,image/jpeg,image/webp"
        onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(""); }} /></label>
      {file?.type === "application/pdf" && <label>Strona PDF<input type="number" min={1} max={1000} value={pageNumber}
        onChange={(event) => setPageNumber(Math.max(1, Math.floor(Number(event.target.value))))} /></label>}
      <details><summary>Konfiguracja mojego klucza OpenAI</summary>
        <p>Klucz przechowujemy zaszyfrowany na serwerze, osobno dla Twojego konta. Nie jest zapisywany w localStorage.</p>
        <label htmlFor="openai-user-key">Klucz OpenAI API</label><input id="openai-user-key" type="password" autoComplete="off" value={key}
          onChange={(event) => setKey(event.target.value)} />
        <div className="form-actions"><button type="button" className="quiet-button" onClick={() => void keyAction()}>Zapisz klucz AI</button>
          <button type="button" className="quiet-button" onClick={() => void keyAction(true)}>Usuń mój klucz AI</button></div>
      </details>
      <label className="checkbox-field"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
        Zgadzam się na przesłanie wybranej strony projektu do OpenAI i koszt analizy na moim koncie API.</label>
      <p>Limit aplikacji: 10 prób na godzinę. Usuń ze skanu dane osobowe i poufne informacje przed analizą.
        PDF jest przetwarzany lokalnie; do AI trafia tylko obraz wybranej strony.</p>
    </fieldset>
    <div className="form-actions"><button type="button" className="quiet-button" disabled={busy} onClick={onClose}>Anuluj</button>
      <button type="button" className="primary-button" disabled={busy || !file || !consent} onClick={() => void scan()}>
        {busy ? "Analizowanie…" : "Skanuj i narysuj z AI"}</button></div>
  </section></div>;
}
