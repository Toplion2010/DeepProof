/**
 * Inline Web Worker factory for forensic analysis.
 *
 * Turbopack (Next.js 16) copies `new URL("./file.ts", import.meta.url)` as a
 * raw static asset instead of compiling it, so the browser receives uncompiled
 * TypeScript. This module works around that by embedding the worker source as
 * a string and creating it via Blob URL.
 *
 * The worker code below is a self-contained copy of forensic-worker.ts +
 * forensic-algorithms.ts with all TypeScript annotations stripped.
 */

/* eslint-disable no-restricted-syntax */

const WORKER_SOURCE = /* js */ `
"use strict";

// ── forensic-algorithms (inlined) ───────────────────────────────────

function computeELA(original, recompressed, width, height, regionSize) {
  if (regionSize === undefined) regionSize = 16;
  if (original.length !== recompressed.length || original.length === 0) {
    return { score: 0, maxRegionalDeviation: 0, meanDeviation: 0 };
  }
  var pixelCount = width * height;
  var totalDiff = 0;
  var diffs = new Float32Array(pixelCount);
  for (var i = 0; i < pixelCount; i++) {
    var idx = i * 4;
    var dr = Math.abs(original[idx] - recompressed[idx]);
    var dg = Math.abs(original[idx + 1] - recompressed[idx + 1]);
    var db = Math.abs(original[idx + 2] - recompressed[idx + 2]);
    var avg = (dr + dg + db) / 3;
    diffs[i] = avg;
    totalDiff += avg;
  }
  var meanDeviation = totalDiff / pixelCount;
  if (meanDeviation < 0.0001) {
    return { score: 0, maxRegionalDeviation: 0, meanDeviation: 0 };
  }
  var regionsX = Math.ceil(width / regionSize);
  var regionsY = Math.ceil(height / regionSize);
  var maxRegionalDeviation = 0;
  for (var ry = 0; ry < regionsY; ry++) {
    for (var rx = 0; rx < regionsX; rx++) {
      var regionSum = 0;
      var regionCount = 0;
      var startX = rx * regionSize;
      var startY = ry * regionSize;
      var endX = Math.min(startX + regionSize, width);
      var endY = Math.min(startY + regionSize, height);
      for (var y = startY; y < endY; y++) {
        for (var x = startX; x < endX; x++) {
          regionSum += diffs[y * width + x];
          regionCount++;
        }
      }
      if (regionCount > 0) {
        var regionAvg = regionSum / regionCount;
        var deviation = Math.abs(regionAvg - meanDeviation) / meanDeviation;
        if (deviation > maxRegionalDeviation) {
          maxRegionalDeviation = deviation;
        }
      }
    }
  }
  var score = Math.max(0, Math.min(100, maxRegionalDeviation * 25));
  return { score: score, maxRegionalDeviation: maxRegionalDeviation, meanDeviation: meanDeviation };
}

function computeNoiseVariance(pixels, width, height, regionSize) {
  if (regionSize === undefined) regionSize = 32;
  if (pixels.length === 0 || width < 3 || height < 3) {
    return { score: 0, varianceOfVariance: 0 };
  }
  var gray = new Float32Array(width * height);
  for (var i = 0; i < width * height; i++) {
    var idx = i * 4;
    gray[i] = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
  }
  var lw = width - 2;
  var lh = height - 2;
  var laplacian = new Float32Array(lw * lh);
  for (var y = 1; y < height - 1; y++) {
    for (var x = 1; x < width - 1; x++) {
      var center = gray[y * width + x];
      var top = gray[(y - 1) * width + x];
      var bottom = gray[(y + 1) * width + x];
      var left = gray[y * width + (x - 1)];
      var right = gray[y * width + (x + 1)];
      laplacian[(y - 1) * lw + (x - 1)] = Math.abs(4 * center - top - bottom - left - right);
    }
  }
  var regionsX = Math.ceil(lw / regionSize);
  var regionsY = Math.ceil(lh / regionSize);
  var regionVariances = [];
  for (var ry = 0; ry < regionsY; ry++) {
    for (var rx = 0; rx < regionsX; rx++) {
      var startX = rx * regionSize;
      var startY = ry * regionSize;
      var endX = Math.min(startX + regionSize, lw);
      var endY = Math.min(startY + regionSize, lh);
      var sum = 0;
      var sumSq = 0;
      var count = 0;
      for (var y = startY; y < endY; y++) {
        for (var x = startX; x < endX; x++) {
          var val = laplacian[y * lw + x];
          sum += val;
          sumSq += val * val;
          count++;
        }
      }
      if (count > 1) {
        var mean = sum / count;
        var variance = sumSq / count - mean * mean;
        regionVariances.push(Math.max(0, variance));
      }
    }
  }
  if (regionVariances.length < 2) {
    return { score: 0, varianceOfVariance: 0 };
  }
  var meanVar = regionVariances.reduce(function (a, b) { return a + b; }, 0) / regionVariances.length;
  var varOfVar = regionVariances.reduce(function (a, v) { return a + Math.pow(v - meanVar, 2); }, 0) / regionVariances.length;
  var normalizedVoV = Math.max(0, Math.min(1, 1 - varOfVar / 500));
  var score = Math.max(0, Math.min(100, normalizedVoV * 100));
  return { score: score, varianceOfVariance: varOfVar };
}

function computeTemporalDiff(frames, width, height) {
  var empty = { diffScores: [], cv: 0, anomalyIndices: [], consistencyScore: 0 };
  if (frames.length < 2) return empty;
  var pixelCount = width * height;
  var diffScores = [];
  for (var f = 0; f < frames.length - 1; f++) {
    var frameA = frames[f];
    var frameB = frames[f + 1];
    if (frameA.length !== frameB.length || frameA.length !== pixelCount * 4) {
      diffScores.push(0);
      continue;
    }
    var totalDiff = 0;
    for (var i = 0; i < pixelCount; i++) {
      var idx = i * 4;
      var dr = Math.abs(frameA[idx] - frameB[idx]);
      var dg = Math.abs(frameA[idx + 1] - frameB[idx + 1]);
      var db = Math.abs(frameA[idx + 2] - frameB[idx + 2]);
      totalDiff += (dr + dg + db) / 3;
    }
    diffScores.push(totalDiff / pixelCount);
  }
  if (diffScores.length === 0) return empty;
  var meanDiff = diffScores.reduce(function (a, b) { return a + b; }, 0) / diffScores.length;
  if (meanDiff < 0.0001) {
    return { diffScores: diffScores, cv: 0, anomalyIndices: [], consistencyScore: 0 };
  }
  var variance = diffScores.reduce(function (a, d) { return a + Math.pow(d - meanDiff, 2); }, 0) / diffScores.length;
  var stddev = Math.sqrt(variance);
  var cv = stddev / meanDiff;
  var anomalyIndices = diffScores
    .map(function (d, i) { return d > meanDiff * 2 ? i : -1; })
    .filter(function (i) { return i >= 0; });
  var consistencyScore = Math.max(0, Math.min(100, cv * 100));
  return { diffScores: diffScores, cv: cv, anomalyIndices: anomalyIndices, consistencyScore: consistencyScore };
}

// ── Worker message handler ──────────────────────────────────────────

var hasOffscreenCanvas = typeof OffscreenCanvas !== "undefined";

self.onmessage = async function (e) {
  var data = e.data;
  var type = data.type;
  var id = data.id;
  var frames = data.frames;

  console.log("[forensic-worker] Received message:", type, "frames:", frames ? frames.length : 0, "hasOffscreenCanvas:", hasOffscreenCanvas);

  if (type === "init") {
    self.postMessage({ id: id, type: "init", fallback: !hasOffscreenCanvas });
    return;
  }

  if (type !== "ela" && type !== "noise" && type !== "temporal") {
    return;
  }

  if (!hasOffscreenCanvas) {
    console.warn("[forensic-worker] OffscreenCanvas not available, falling back");
    self.postMessage({ id: id, type: type, fallback: true });
    return;
  }

  try {
    if (type === "ela") {
      await handleELA(id, frames);
    } else if (type === "noise") {
      await handleNoise(id, frames);
    } else if (type === "temporal") {
      await handleTemporal(id, frames);
    }
  } catch (err) {
    self.postMessage({
      id: id,
      type: type,
      error: err instanceof Error ? err.message : "Worker error",
    });
  }
};

async function loadImage(base64) {
  try {
    var response = await fetch(base64);
    var blob = await response.blob();
    var bmp = await createImageBitmap(blob);
    console.log("[forensic-worker] loadImage OK:", bmp.width, "x", bmp.height);
    return bmp;
  } catch (e) {
    console.warn("[forensic-worker] loadImage FAILED:", e instanceof Error ? e.message : e, "base64 prefix:", typeof base64 === "string" ? base64.substring(0, 60) : typeof base64);
    return null;
  }
}

function getPixels(bitmap, targetWidth) {
  var scale = targetWidth ? Math.min(1, targetWidth / bitmap.width) : 1;
  var width = Math.round(bitmap.width * scale);
  var height = Math.round(bitmap.height * scale);
  var canvas = new OffscreenCanvas(width, height);
  var ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, width, height);
  var imageData = ctx.getImageData(0, 0, width, height);
  canvas.width = 0;
  canvas.height = 0;
  return { pixels: imageData.data, width: width, height: height };
}

function recompressPixels(bitmap, width, height, quality) {
  var canvas = new OffscreenCanvas(width, height);
  var ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, width, height);
  var imageData = ctx.getImageData(0, 0, width, height);
  var data = imageData.data;
  var step = Math.max(1, Math.round((1 - quality) * 16));
  var result = new Uint8ClampedArray(data.length);
  for (var i = 0; i < data.length; i += 4) {
    result[i] = Math.round(data[i] / step) * step;
    result[i + 1] = Math.round(data[i + 1] / step) * step;
    result[i + 2] = Math.round(data[i + 2] / step) * step;
    result[i + 3] = data[i + 3];
  }
  canvas.width = 0;
  canvas.height = 0;
  return result;
}

async function handleELA(id, frames) {
  console.log("[forensic-worker] handleELA: processing", frames.length, "frames");
  var results = [];
  for (var i = 0; i < frames.length; i++) {
    var bitmap = await loadImage(frames[i]);
    if (!bitmap || bitmap.width < 200) {
      console.warn("[forensic-worker] ELA frame", i, "skipped:", bitmap ? "too small (" + bitmap.width + "px)" : "loadImage returned null");
      if (bitmap) bitmap.close();
      continue;
    }
    var px = getPixels(bitmap, 320);
    var recompressed = recompressPixels(bitmap, px.width, px.height, 0.75);
    bitmap.close();
    results.push(computeELA(px.pixels, recompressed, px.width, px.height));
  }
  var avgScore = results.length > 0
    ? results.reduce(function (a, r) { return a + r.score; }, 0) / results.length
    : 0;
  self.postMessage({
    id: id,
    type: "ela",
    elaScore: Math.max(0, Math.min(100, avgScore)),
    framesAnalyzed: results.length,
    perFrameResults: results,
  });
}

async function handleNoise(id, frames) {
  console.log("[forensic-worker] handleNoise: processing", frames.length, "frames");
  var results = [];
  for (var i = 0; i < frames.length; i++) {
    var bitmap = await loadImage(frames[i]);
    if (!bitmap || bitmap.width < 200) {
      console.warn("[forensic-worker] Noise frame", i, "skipped:", bitmap ? "too small (" + bitmap.width + "px)" : "loadImage returned null");
      if (bitmap) bitmap.close();
      continue;
    }
    var px = getPixels(bitmap, 320);
    bitmap.close();
    results.push(computeNoiseVariance(px.pixels, px.width, px.height));
  }
  var avgScore = results.length > 0
    ? results.reduce(function (a, r) { return a + r.score; }, 0) / results.length
    : 0;
  self.postMessage({
    id: id,
    type: "noise",
    noiseScore: Math.max(0, Math.min(100, avgScore)),
    framesAnalyzed: results.length,
    perFrameResults: results,
  });
}

async function handleTemporal(id, frames) {
  var pixelArrays = [];
  var frameWidth = 0;
  var frameHeight = 0;
  for (var i = 0; i < frames.length; i++) {
    var bitmap = await loadImage(frames[i]);
    if (!bitmap || bitmap.width < 200) {
      if (bitmap) bitmap.close();
      continue;
    }
    var px = getPixels(bitmap, 256);
    bitmap.close();
    if (frameWidth === 0) {
      frameWidth = px.width;
      frameHeight = px.height;
    } else if (px.width !== frameWidth || px.height !== frameHeight) {
      continue;
    }
    pixelArrays.push(px.pixels);
  }
  var result = computeTemporalDiff(pixelArrays, frameWidth, frameHeight);
  self.postMessage({
    id: id,
    type: "temporal",
    consistencyScore: Math.max(0, Math.min(100, result.consistencyScore)),
    cv: result.cv,
    anomalyIndices: result.anomalyIndices,
    framesAnalyzed: pixelArrays.length,
    diffScores: result.diffScores,
  });
}
`;

let blobUrl: string | null = null;

/**
 * Create a Web Worker from the inlined source code.
 * Returns a standard Worker instance.
 */
export function createForensicWorker(): Worker {
  if (!blobUrl) {
    const blob = new Blob([WORKER_SOURCE], { type: "application/javascript" })
    blobUrl = URL.createObjectURL(blob)
  }
  return new Worker(blobUrl)
}
