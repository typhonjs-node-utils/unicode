/**
 * Provides a helper utility to potentially swap a typed array to little endian.
 */
export class Swap32LE
{
   /**
    * Swaps the given typed array as necessary to little endian as necessary. Uint8Array is assumed to have 32-bit data
    * internally.
    *
    * @param {Uint8Array | Uint32Array} array - Array to potentially swap.
    *
    * @returns {Uint8Array | Uint32Array} Passed in array.
    */
   static swap(array: Uint8Array | Uint32Array)
   {
      if (this.#isBigEndian) { this.#swap32(array); }

      return array;
   }

   static #isBigEndian: boolean = (new Uint8Array(new Uint32Array([0x12345678]).buffer)[0] === 0x12);

   static #swap(b, n, m)
   {
      const i = b[n];
      b[n] = b[m];
      b[m] = i;
   }

   static #swap32(array: Uint8Array | Uint32Array)
   {
      const len = array.length;

      for (let i = 0; i < len; i += 4)
      {
         this.#swap(array, i, i + 3);
         this.#swap(array, i + 1, i + 2);
      }
   }
}
