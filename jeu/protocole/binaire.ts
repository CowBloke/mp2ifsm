/*
 * Lecture et écriture binaires compactes : entiers en varint (petits
 * nombres = un octet), signés en zigzag, textes en UTF-8 préfixés de
 * leur longueur. Aucune dépendance : tourne dans Node comme dans le
 * navigateur.
 */

const encodeur = new TextEncoder();
const decodeur = new TextDecoder();

export class Ecrivain {
  private octets = new Uint8Array(1024);
  longueur = 0;

  private reserver(n: number): void {
    if (this.longueur + n <= this.octets.length) return;
    const plus = new Uint8Array(Math.max(this.octets.length * 2, this.longueur + n));
    plus.set(this.octets.subarray(0, this.longueur));
    this.octets = plus;
  }

  octet(v: number): this {
    this.reserver(1);
    this.octets[this.longueur++] = v & 0xff;
    return this;
  }

  /** Entier naturel, en varint (7 bits par octet). */
  naturel(v: number): this {
    if (!Number.isSafeInteger(v) || v < 0) throw new RangeError(`naturel invalide : ${v}`);
    this.reserver(8);
    while (v >= 0x80) {
      this.octets[this.longueur++] = (v % 0x80) | 0x80;
      v = Math.floor(v / 0x80);
    }
    this.octets[this.longueur++] = v;
    return this;
  }

  /** Entier relatif, en zigzag puis varint : 0, -1, 1, -2… → 0, 1, 2, 3… */
  entier(v: number): this {
    if (!Number.isSafeInteger(v)) throw new RangeError(`entier invalide : ${v}`);
    return this.naturel(v >= 0 ? v * 2 : -v * 2 - 1);
  }

  booleen(v: boolean): this {
    return this.octet(v ? 1 : 0);
  }

  texte(s: string): this {
    const b = encodeur.encode(s);
    this.naturel(b.length);
    this.reserver(b.length);
    this.octets.set(b, this.longueur);
    this.longueur += b.length;
    return this;
  }

  /** Copie des octets écrits. */
  resultat(): Uint8Array {
    return this.octets.slice(0, this.longueur);
  }

  vider(): this {
    this.longueur = 0;
    return this;
  }
}

export class Lecteur {
  private position = 0;
  constructor(private readonly octets: Uint8Array) {}

  private verifier(n: number): void {
    if (this.position + n > this.octets.length) throw new RangeError("message tronqué");
  }

  octet(): number {
    this.verifier(1);
    return this.octets[this.position++];
  }

  naturel(): number {
    let v = 0;
    let facteur = 1;
    for (let i = 0; i < 8; i++) {
      const b = this.octet();
      v += (b & 0x7f) * facteur;
      if (b < 0x80) return v;
      facteur *= 0x80;
    }
    throw new RangeError("varint trop long");
  }

  entier(): number {
    const n = this.naturel();
    return n % 2 === 0 ? n / 2 : -(n + 1) / 2;
  }

  booleen(): boolean {
    return this.octet() !== 0;
  }

  texte(): string {
    const n = this.naturel();
    this.verifier(n);
    const s = decodeur.decode(this.octets.subarray(this.position, this.position + n));
    this.position += n;
    return s;
  }

  fini(): boolean {
    return this.position >= this.octets.length;
  }
}
