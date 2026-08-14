/* =========================================================================
   Загрузка обычных 2D-текстур (не из .glb, см. glb.ts/modelRenderer.ts —
   те заранее знают формат/mime из самого файла) — общий маленький хелпер
   для текстур земли/декора (см. terrainMesh.ts/decorMesh.ts): тот же приём
   уменьшения до разумного размера перед закачкой в GPU, что уже отработан
   в uploadGLB (полноразмерная закачка стабильно роняла GPU-соединение в
   этой песочнице).
   ========================================================================= */
export async function loadTexture(device: GPUDevice, url: string, maxSize = 1024): Promise<GPUTexture> {
  const res = await fetch(url);
  const blob = await res.blob();
  const rawBitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxSize / Math.max(rawBitmap.width, rawBitmap.height));
  const bitmap =
    scale < 1
      ? await createImageBitmap(rawBitmap, {
          resizeWidth: Math.round(rawBitmap.width * scale),
          resizeHeight: Math.round(rawBitmap.height * scale),
          resizeQuality: "medium",
        })
      : rawBitmap;
  if (scale < 1) rawBitmap.close();
  const texture = device.createTexture({
    size: [bitmap.width, bitmap.height],
    format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  device.queue.copyExternalImageToTexture({ source: bitmap }, { texture }, [bitmap.width, bitmap.height]);
  bitmap.close();
  return texture;
}
