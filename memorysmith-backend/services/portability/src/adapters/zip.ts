/**
 * A minimal ZIP writer, stored (uncompressed) entries only.
 *
 * Written here rather than pulled from a dependency because the export is the
 * promise of zero lock-in, and the fewer moving parts stand between the vault
 * and a folder of .md files, the more that promise is worth. Markdown also
 * compresses well enough at the transport layer that storing is no penalty.
 */

import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib';

interface Entry {
  readonly name: string;
  readonly data: Buffer;
  readonly compressed: Buffer;
  readonly crc: number;
  offset: number;
}

const DEFLATED = 8;

function dosTime(date: Date): { time: number; date: number } {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

export function createZip(files: Array<{ path: string; content: string }>, now: Date): Buffer {
  const stamp = dosTime(now);
  const entries: Entry[] = files.map((file) => {
    const data = Buffer.from(file.content, 'utf8');
    return {
      name: file.path,
      data,
      compressed: deflateRawSync(data),
      crc: crc32(data),
      offset: 0,
    };
  });

  const chunks: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    entry.offset = offset;
    const name = Buffer.from(entry.name, 'utf8');
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4); // version needed
    header.writeUInt16LE(0x0800, 6); // UTF-8 names
    header.writeUInt16LE(DEFLATED, 8);
    header.writeUInt16LE(stamp.time, 10);
    header.writeUInt16LE(stamp.date, 12);
    header.writeUInt32LE(entry.crc, 14);
    header.writeUInt32LE(entry.compressed.length, 18);
    header.writeUInt32LE(entry.data.length, 22);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(0, 28);

    chunks.push(header, name, entry.compressed);
    offset += header.length + name.length + entry.compressed.length;
  }

  const centralStart = offset;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(DEFLATED, 10);
    central.writeUInt16LE(stamp.time, 12);
    central.writeUInt16LE(stamp.date, 14);
    central.writeUInt32LE(entry.crc, 16);
    central.writeUInt32LE(entry.compressed.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(entry.offset, 42);

    chunks.push(central, name);
    offset += central.length + name.length;
  }

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(offset - centralStart, 12);
  end.writeUInt32LE(centralStart, 16);
  chunks.push(end);

  return Buffer.concat(chunks);
}

/**
 * The other side of the door: the entries of an archive, by name.
 *
 * It reads the central directory rather than walking the local headers,
 * because the directory is the authoritative index of a zip and a local header
 * may declare a size of zero and defer it to a descriptor. Stored and deflated
 * entries are both read; anything else is refused, since a `.vault` is written
 * by the function above and a file that is not one has no claim on being read.
 */
export function readZip(archive: Buffer): Record<string, string> {
  const end = findEndOfCentralDirectory(archive);
  if (end === -1) throw new Error('not a zip archive');

  const count = archive.readUInt16LE(end + 10);
  let at = archive.readUInt32LE(end + 16);
  const entries: Record<string, string> = {};

  for (let index = 0; index < count; index++) {
    if (archive.readUInt32LE(at) !== 0x02014b50) throw new Error('corrupt central directory');
    const method = archive.readUInt16LE(at + 10);
    const compressedSize = archive.readUInt32LE(at + 20);
    const nameLength = archive.readUInt16LE(at + 28);
    const extraLength = archive.readUInt16LE(at + 30);
    const commentLength = archive.readUInt16LE(at + 32);
    const localOffset = archive.readUInt32LE(at + 42);
    const name = archive.subarray(at + 46, at + 46 + nameLength).toString('utf8');

    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const dataAt = localOffset + 30 + localNameLength + localExtraLength;
    const data = archive.subarray(dataAt, dataAt + compressedSize);

    if (method === 0) entries[name] = data.toString('utf8');
    else if (method === DEFLATED) entries[name] = inflateRawSync(data).toString('utf8');
    else throw new Error(`unsupported compression method ${method}`);

    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** The record is at the end, after a comment nobody writes and anyone may. */
function findEndOfCentralDirectory(archive: Buffer): number {
  for (let at = archive.length - 22; at >= 0; at--) {
    if (archive.readUInt32LE(at) === 0x06054b50) return at;
  }
  return -1;
}
