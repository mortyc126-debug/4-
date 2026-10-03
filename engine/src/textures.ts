/* =========================================================================
   Загрузка обычных 2D-текстур (не из .glb, см. glb.ts/modelRenderer.ts —
   те заранее знают формат/mime из самого файла) — общий маленький хелпер
   для текстур земли/декора (см. terrainMesh.ts/decorMesh.ts): тот же приём
   уменьшения до разумного размера перед закачкой в GPU, что уже отработан
   в uploadGLB (полноразмерная закачка стабильно роняла GPU-соединение в
   этой песочнице).
   ========================================================================= */
// Закачка картинки в GPU — по желанию с полной цепочкой мипмапов.
//
// Мипмапы — уменьшенные копии текстуры (½, ¼, … до 1×1), из которых GPU
// сам берёт подходящую по размеру на экране. Без них земля вдали читала
// текстуру 1024×1024 в полном разрешении ради пикселя, который покрывает
// десятки её текселей: это и рябь на дальних склонах, и лишняя нагрузка на
// память видеокарты — на телефоне самое дорогое в кадре (см. комментарий у
// весов почвы в TERRAIN_SHADER). Уровни строит сам браузер, тем же
// createImageBitmap с resizeQuality "medium", что и общее уменьшение ниже:
// отдельного прохода рендера под генерацию мипов заводить незачем.
// Памяти цепочка берёт на треть больше самой текстуры.
//
// bitmap закрывает вызывающий — уровни строятся из него же.
export async function uploadBitmap(device: GPUDevice, bitmap: ImageBitmap, mipmaps: boolean): Promise<GPUTexture> {
  const w = bitmap.width, h = bitmap.height;
  const levels = mipmaps ? Math.floor(Math.log2(Math.max(w, h))) + 1 : 1;
  const texture = device.createTexture({
    size: [w, h],
    format: "rgba8unorm",
    mipLevelCount: levels,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  device.queue.copyExternalImageToTexture({ source: bitmap }, { texture }, [w, h]);
  for (let lv = 1; lv < levels; lv++) {
    const lw = Math.max(1, w >> lv), lh = Math.max(1, h >> lv);
    const level = await createImageBitmap(bitmap, {
      resizeWidth: lw, resizeHeight: lh, resizeQuality: "medium", premultiplyAlpha: "none",
    });
    device.queue.copyExternalImageToTexture({ source: level }, { texture, mipLevel: lv }, [lw, lh]);
    level.close();
  }
  return texture;
}

// mipmaps — только для текстур, которые шейдер читает с производными (почва,
// деталь воды). Листве декора они вредны (прозрачность по альфе на дальних
// уровнях размывается, и деревья вдали теряют листья), линиям границ
// областей тоже (тонкая линия на уменьшенном уровне бледнеет).
export async function loadTexture(device: GPUDevice, url: string, maxSize = 1024, mipmaps = false): Promise<GPUTexture> {
  const res = await fetch(url);
  const blob = await res.blob();
  // premultiplyAlpha:"none" — обязательно для текстур С АЛЬФОЙ (разметка
  // регионов, облака). По умолчанию браузер домножает RGB на альфу, а
  // шейдеры тут ждут НЕ домноженный цвет: они сами делают mix(фон, tex.rgb,
  // tex.a). С домножением полупрозрачные места приезжают потемневшими ровно
  // во столько раз, во сколько они прозрачны — заливка территории с альфой
  // 0.3 вместо окраски давала бы затемнение втрое темнее задуманного. У
  // непрозрачных текстур (земля, небо) альфа = 1 и опция ничего не меняет.
  const rawBitmap = await createImageBitmap(blob, { premultiplyAlpha: "none" });
  const scale = Math.min(1, maxSize / Math.max(rawBitmap.width, rawBitmap.height));
  const bitmap =
    scale < 1
      ? await createImageBitmap(rawBitmap, {
          resizeWidth: Math.round(rawBitmap.width * scale),
          resizeHeight: Math.round(rawBitmap.height * scale),
          resizeQuality: "medium",
          premultiplyAlpha: "none",   // см. выше — уменьшение не должно вернуть домножение
        })
      : rawBitmap;
  if (scale < 1) rawBitmap.close();
  const texture = await uploadBitmap(device, bitmap, mipmaps);
  bitmap.close();
  return texture;
}
