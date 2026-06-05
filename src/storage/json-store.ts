export class JsonStore<T> {
  constructor(private readonly fallback: T) {}

  read(): T {
    return this.fallback;
  }

  write(value: T): T {
    return value;
  }
}
