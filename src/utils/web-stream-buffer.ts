export class WebStreamBuffer {
  readers: { read(data: object): void }[] = [];

  write(data: object): void {
    for (const reader of this.readers) {
      reader.read(data);
    }
  }

  addReader(reader: { read(data: object): void }): void {
    this.readers.push(reader);
  }

  removeReader(reader: { read(data: object): void }): boolean {
    const index = this.readers.indexOf(reader);
    if (index !== -1) {
      this.readers.splice(index, 1);
      return true;
    }
    return false;
  }
}
