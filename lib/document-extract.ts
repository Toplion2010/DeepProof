/**
 * Client-side document extraction: PDF text + metadata, image resizing and hashing.
 * Handles PDF parsing with pdfjs-dist and image canvas manipulation.
 * Returns structured extraction data for the API.
 */

export interface DocumentExtraction {
  extractedText: string
  pageCount: number
  firstPageImage: string // base64 JPEG, no data: prefix; "" if render failed
  pageWidth: number
  pageHeight: number
  fileType: "pdf" | "image"
  isScannedPdf: boolean // true when PDF has no extractable text (triggers image-only analysis path)
  pdfCreationDate?: string
  pdfModificationDate?: string
  pdfProducer?: string
  pdfCreator?: string
  fileHash: string // SHA-256 hex of raw file bytes (no preprocessing)
}

/**
 * Extract document: PDF text + first page image, or image file directly.
 * Handles resizing, compression, and file hashing.
 * Enforces 30s timeout and validates canvas renders.
 */
export async function extractDocument(file: File): Promise<DocumentExtraction> {
  const fileType = file.type.startsWith("application/pdf") ? "pdf" : "image"

  // Hash raw file bytes first (before any preprocessing)
  const fileHash = await hashFile(file)

  // Extract based on file type
  if (fileType === "pdf") {
    return extractPdf(file, fileHash)
  } else {
    return extractImage(file, fileHash)
  }
}

/**
 * Hash raw file bytes using SHA-256
 */
async function hashFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

/**
 * Resize canvas to max dimensions, preserving aspect ratio
 */
function resizeCanvas(
  canvas: HTMLCanvasElement,
  maxWidth: number
): HTMLCanvasElement {
  const { width, height } = canvas
  if (width <= maxWidth) return canvas

  const scale = maxWidth / width
  const newHeight = Math.round(height * scale)

  const resized = document.createElement("canvas")
  resized.width = maxWidth
  resized.height = newHeight

  const ctx = resized.getContext("2d")
  if (!ctx) return canvas

  ctx.drawImage(canvas, 0, 0, maxWidth, newHeight)
  return resized
}

/**
 * Canvas to base64 JPEG with quality 0.75
 */
function canvasToBase64Jpeg(canvas: HTMLCanvasElement): string {
  if (canvas.width <= 0 || canvas.height <= 0) return ""
  const data = canvas.toDataURL("image/jpeg", 0.75)
  // Remove "data:image/jpeg;base64," prefix
  return data.split(",")[1] || ""
}

/**
 * Extract PDF: text from all pages (capped at 50), first page image, metadata
 */
async function extractPdf(file: File, fileHash: string): Promise<DocumentExtraction> {
  let pdfjsLib: typeof import("pdfjs-dist")
  let pdf: any
  let pageCount = 0
  let extractedText = ""
  let isScannedPdf = false
  let firstPageImage = ""
  let pageWidth = 0
  let pageHeight = 0
  let pdfCreationDate: string | undefined
  let pdfModificationDate: string | undefined
  let pdfProducer: string | undefined
  let pdfCreator: string | undefined

  try {
    // Load pdfjs-dist lazily
    pdfjsLib = await import("pdfjs-dist")

    // Set worker source BEFORE first getDocument call
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@5/build/pdf.worker.min.mjs"

    // Load PDF from file blob
    const blob = new Blob([file], { type: "application/pdf" })
    const url = URL.createObjectURL(blob)

    try {
      // Enforce 30s timeout
      const extractPromise = (async () => {
        pdf = await pdfjsLib.getDocument(url).promise
        pageCount = pdf.numPages

        // Extract text from up to 50 pages
        const maxPages = Math.min(50, pageCount)
        const textChunks: string[] = []

        for (let i = 1; i <= maxPages; i++) {
          try {
            const page = await pdf.getPage(i)
            const textContent = await page.getTextContent()
            const pageText = textContent.items
              .map((item: any) => (typeof item.str === "string" ? item.str : ""))
              .join(" ")
            textChunks.push(pageText)
          } catch (e) {
            // Skip pages that fail to extract
            console.warn(`Failed to extract text from PDF page ${i}:`, e)
          }
        }

        extractedText = textChunks.join(" ")

        if (maxPages < pageCount) {
          extractedText += " [Text truncated at 50 pages]"
        }

        // If no text extracted, mark as scanned PDF
        if (!extractedText.trim()) {
          isScannedPdf = true
        }

        // Extract metadata
        try {
          const metadata = await pdf.getMetadata()
          if (metadata?.info) {
            pdfCreationDate =
              metadata.info.CreationDate || metadata.info.creationDate
            pdfModificationDate =
              metadata.info.ModDate || metadata.info.modDate
            pdfProducer = metadata.info.Producer || metadata.info.producer
            pdfCreator = metadata.info.Creator || metadata.info.creator
          }
        } catch (e) {
          console.warn("Failed to extract PDF metadata:", e)
        }

        // Render first page to image
        try {
          const firstPage = await pdf.getPage(1)
          const viewport = firstPage.getViewport({ scale: 1 })
          pageWidth = Math.round(viewport.width)
          pageHeight = Math.round(viewport.height)

          const canvas = document.createElement("canvas")
          canvas.width = viewport.width
          canvas.height = viewport.height

          const context = canvas.getContext("2d")
          if (!context) throw new Error("Failed to get 2D context")

          await firstPage.render({
            canvasContext: context,
            viewport: viewport,
          }).promise

          // Resize to max 1200px width
          const resized = resizeCanvas(canvas, 1200)
          firstPageImage = canvasToBase64Jpeg(resized)

          if (!firstPageImage) {
            isScannedPdf = true
          }
        } catch (e) {
          console.warn("Failed to render PDF first page:", e)
          isScannedPdf = true
        }
      })()

      await Promise.race([
        extractPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("PDF extraction timeout")), 30000)
        ),
      ])
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch (error) {
    console.error("PDF extraction error:", error)
    throw new Error(
      `Failed to extract PDF: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  return {
    extractedText,
    pageCount,
    firstPageImage,
    pageWidth,
    pageHeight,
    fileType: "pdf",
    isScannedPdf,
    pdfCreationDate,
    pdfModificationDate,
    pdfProducer,
    pdfCreator,
    fileHash,
  }
}

/**
 * Extract image: resize, compress, base64 encode
 */
async function extractImage(file: File, fileHash: string): Promise<DocumentExtraction> {
  let imageBase64 = ""
  let pageWidth = 0
  let pageHeight = 0

  try {
    const url = URL.createObjectURL(file)

    try {
      await new Promise<void>((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
          try {
            const canvas = document.createElement("canvas")
            canvas.width = img.naturalWidth
            canvas.height = img.naturalHeight

            const ctx = canvas.getContext("2d")
            if (!ctx) throw new Error("Failed to get 2D context")

            ctx.drawImage(img, 0, 0)

            // Resize to max 1600px width
            const resized = resizeCanvas(canvas, 1600)
            pageWidth = resized.width
            pageHeight = resized.height

            imageBase64 = canvasToBase64Jpeg(resized)

            resolve()
          } catch (error) {
            reject(error)
          }
        }
        img.onerror = () => reject(new Error("Failed to load image"))
        img.src = url
      })
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch (error) {
    console.error("Image extraction error:", error)
    throw new Error(
      `Failed to extract image: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  return {
    extractedText: "",
    pageCount: 1,
    firstPageImage: imageBase64,
    pageWidth,
    pageHeight,
    fileType: "image",
    isScannedPdf: false,
    fileHash,
  }
}
