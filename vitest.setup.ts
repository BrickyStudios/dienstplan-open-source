import "@testing-library/jest-dom";

/**
 * localStorage/sessionStorage für die Testumgebung nachrüsten.
 *
 * jsdom 29 stellt Web Storage nicht mehr bereit — `window.localStorage` ist
 * schlicht `undefined`, obwohl die Umgebung eine echte http-Origin hat. Tests,
 * die vorher liefen (z. B. __tests__/DeviceCheck.test.tsx), scheitern dadurch
 * schon in `beforeEach` an `localStorage.clear()`.
 *
 * Das hier ist bewusst nur ein Test-Hilfsmittel: eine Map hinter der
 * Storage-Schnittstelle, mehr braucht keiner der Tests. Sobald jsdom Web
 * Storage wieder mitbringt, kann der Block ersatzlos weg.
 */
class MemoryStorage implements Storage {
  #entries = new Map<string, string>();

  get length() {
    return this.#entries.size;
  }
  key(index: number) {
    return [...this.#entries.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.#entries.get(String(key)) ?? null;
  }
  setItem(key: string, value: string) {
    this.#entries.set(String(key), String(value));
  }
  removeItem(key: string) {
    this.#entries.delete(String(key));
  }
  clear() {
    this.#entries.clear();
  }
  [name: string]: unknown;
}

for (const name of ["localStorage", "sessionStorage"] as const) {
  if (typeof globalThis[name] === "undefined") {
    const storage = new MemoryStorage();
    Object.defineProperty(globalThis, name, { value: storage, configurable: true, writable: true });
    if (typeof window !== "undefined") {
      Object.defineProperty(window, name, { value: storage, configurable: true, writable: true });
    }
  }
}
