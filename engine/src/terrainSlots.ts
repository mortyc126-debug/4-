/* =========================================================================
   Слоты слоя рельефа: где именно лежит каждый чанк внутри общего буфера.

   Слой (ближний/дальний/задник, см. renderer.ts) — один GPUBuffer на все
   свои чанки: так весь слой рисуется одним draw() вместо сотни. Вопрос
   только в том, как класть в этот буфер новые чанки и вынимать ушедшие.

   Раньше слой пересобирался ЦЕЛИКОМ: все вершины всех чанков копировались
   заново и разом уходили на GPU. Для ближнего слоя это 49 чанков по 1536
   вершин по 15 float — около 4.3МБ за пересборку, и столько же у дальнего,
   каждые 120мс всё время, пока камера движется. Именно это ощущалось как
   «лёгкие подлагивания при перемещении камеры».

   Здесь — то же самое, но по слотам. Все чанки одного слоя одинаковы по
   числу вершин по построению (ближние — всегда CHUNK_SIZE×CHUNK_SIZE с
   шагом 1, дальние — FAR_CHUNK_SIZE×FAR_CHUNK_SIZE с шагом FAR_STEP, см.
   вызовы buildTerrainPatch в main.ts; задник вообще один), поэтому слот —
   это просто индекс, а не диапазон переменной длины. Подгрузка чанка —
   запись одного слота (~90КБ), выгрузка — тоже одна запись.

   Про GPU этот файл не знает ничего: наружу торчат две операции («создать
   буфер такого размера» и «записать столько-то байт по такому смещению»),
   renderer.ts подставляет туда WebGPU, а тест — обычный массив.
   ========================================================================= */

export interface TierSlotsSink {
  /** (Пере)создать буфер слоя под указанный размер в байтах. */
  createBuffer(byteSize: number): void;
  /** Записать данные чанка по смещению в байтах от начала буфера. */
  write(byteOffset: number, data: Float32Array): void;
}

export class TierSlots {
  private floatsPerChunk = 0;
  private vertsPerChunk = 0;
  private capacityChunks = 0;
  /** слот -> ключ чанка. Рисуется сплошной кусок из первых order.length слотов. */
  private order: string[] = [];
  private slotOf = new Map<string, number>();
  /** те же массивы, что держит renderer.ts — нужны, чтобы перезалить слой при расширении. */
  private dataOf = new Map<string, Float32Array>();
  /** сколько вершин реально рисовать */
  vertexCount = 0;

  constructor(private readonly sink: TierSlotsSink) {}

  has(key: string): boolean {
    return this.slotOf.has(key);
  }

  /** Положить (или обновить на месте) чанк. */
  put(key: string, data: Float32Array, vertexCount: number): void {
    // Первый чанк слоя задаёт размер слота. Несовпадение размера по
    // построению невозможно, но если однажды случится — честно пересобрать
    // слой под новый шаг, а не писать вершины мимо слотов.
    if (this.floatsPerChunk !== data.length) this.restride(data.length, vertexCount);
    this.dataOf.set(key, data);
    let slot = this.slotOf.get(key);
    if (slot === undefined) {
      slot = this.order.length;
      if (slot + 1 > this.capacityChunks) this.grow(slot + 1);
      this.order.push(key);
      this.slotOf.set(key, slot);
    }
    this.sink.write(slot * this.floatsPerChunk * 4, data);
    this.vertexCount = this.order.length * this.vertsPerChunk;
  }

  /** Убрать чанк. */
  remove(key: string): void {
    const slot = this.slotOf.get(key);
    this.dataOf.delete(key);
    if (slot === undefined) return;
    // Освободившийся слот занимает ПОСЛЕДНИЙ чанк слоя — так рисуемая часть
    // буфера остаётся сплошной, а на GPU уходит одна маленькая запись
    // вместо сдвига всего хвоста. Порядок чанков в буфере ни на что не
    // влияет: они рисуются одним draw() как общий список треугольников, без
    // индексов и без сортировки.
    const last = this.order.length - 1;
    if (slot !== last) {
      const movedKey = this.order[last];
      this.order[slot] = movedKey;
      this.slotOf.set(movedKey, slot);
      const moved = this.dataOf.get(movedKey);
      if (moved) this.sink.write(slot * this.floatsPerChunk * 4, moved);
    }
    this.order.pop();
    this.slotOf.delete(key);
    this.vertexCount = this.order.length * this.vertsPerChunk;
  }

  /**
   * Расширить слой. Единственный случай, когда всё же перезаливается всё
   * содержимое — но случается он только пока мир наполняется до
   * устоявшегося размера, а не при каждом шаге камеры. Запас в полтора раза
   * — чтобы на границе радиуса подгрузки/выгрузки не упираться в потолок и
   * не расширяться на каждый чанк.
   */
  private grow(needChunks: number): void {
    const cap = Math.max(needChunks, Math.ceil(this.capacityChunks * 1.5), 8);
    this.capacityChunks = cap;
    this.sink.createBuffer(cap * this.floatsPerChunk * 4);
    for (let i = 0; i < this.order.length; i++) {
      const data = this.dataOf.get(this.order[i]);
      if (data) this.sink.write(i * this.floatsPerChunk * 4, data);
    }
  }

  /** Слой начинается заново под другой размер чанка (см. put). */
  private restride(floatsPerChunk: number, vertsPerChunk: number): void {
    const keys = this.order.slice();
    this.floatsPerChunk = floatsPerChunk;
    this.vertsPerChunk = vertsPerChunk;
    this.capacityChunks = 0;
    this.order = [];
    this.slotOf = new Map();
    this.vertexCount = 0;
    if (!keys.length) return;
    this.grow(keys.length);
    for (const k of keys) {
      const data = this.dataOf.get(k);
      if (!data || data.length !== floatsPerChunk) continue;
      const slot = this.order.length;
      this.order.push(k);
      this.slotOf.set(k, slot);
      this.sink.write(slot * floatsPerChunk * 4, data);
    }
    this.vertexCount = this.order.length * this.vertsPerChunk;
  }
}
