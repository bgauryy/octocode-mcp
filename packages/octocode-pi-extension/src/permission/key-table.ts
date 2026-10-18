/**
 * A map from a 53-bit hash to a small non-negative integer (a slot of the provenance ring), for a table that holds at
 * most `limit` keys: open addressing over two typed arrays, so inserting a 256 KB web result's 200,000 hashes allocates
 * nothing per key (a `Map` does, and was most of the cost of indexing one). The arrays are allocated on the first
 * `set` and dropped by `clear`. Keys are already well mixed hashes, so a multiply-xor of their two halves picks the cell.
 */
export class KeyTable {
  private keys: Float64Array | undefined;
  private slots: Int32Array | undefined;
  /** Cells, a power of two at least twice `limit`: a probe always meets an empty cell. */
  private readonly capacity: number;
  private count = 0;

  constructor(limit: number) {
    this.capacity = 2 ** Math.max(4, Math.ceil(Math.log2(Math.max(limit, 1) * 2)));
  }

  get size(): number {
    return this.count;
  }

  get(key: number): number | undefined {
    if (!this.slots) return undefined;
    const cell = this.find(key);
    return cell >= 0 ? this.slots[cell] : undefined;
  }

  has(key: number): boolean {
    return this.get(key) !== undefined;
  }

  set(key: number, slot: number): void {
    if (!this.keys || !this.slots) {
      this.keys = new Float64Array(this.capacity);
      this.slots = new Int32Array(this.capacity).fill(-1);
    }
    const cell = this.find(key);
    if (cell >= 0) {
      this.slots[cell] = slot;
      return;
    }
    this.keys[-1 - cell] = key;
    this.slots[-1 - cell] = slot;
    this.count++;
  }

  delete(key: number): void {
    if (!this.keys || !this.slots) return;
    let hole = this.find(key);
    if (hole < 0) return;
    this.count--;
    // Backward shift: each following cell of the run moves into the hole when its home is not between the hole and itself.
    const mask = this.capacity - 1;
    for (let at = (hole + 1) & mask; this.slots[at] !== -1; at = (at + 1) & mask) {
      const home = this.home(this.keys[at]!);
      const between = hole <= at ? home > hole && home <= at : home > hole || home <= at;
      if (between) continue;
      this.keys[hole] = this.keys[at]!;
      this.slots[hole] = this.slots[at]!;
      hole = at;
    }
    this.slots[hole] = -1;
  }

  clear(): void {
    this.keys = undefined;
    this.slots = undefined;
    this.count = 0;
  }

  private home(key: number): number {
    return (Math.imul(key | 0, 0x9e3779b1) ^ Math.imul((key / 0x100000000) | 0, 0x85ebca6b)) & (this.capacity - 1);
  }

  /** The cell holding `key`, or `-1 - cell` for the empty cell where it would go. */
  private find(key: number): number {
    const mask = this.capacity - 1;
    let cell = this.home(key);
    while (this.slots![cell] !== -1) {
      if (this.keys![cell] === key) return cell;
      cell = (cell + 1) & mask;
    }
    return -1 - cell;
  }
}
