// Генератор иконки приложения (снежинка FrozenWest) без внешних зависимостей.
// Создаёт build/icon.png (512×512) и build/icon.ico (256×256).
// Запуск:  node scripts/make-icon.mjs   (или pnpm make-icon)
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const buildDir = join(root, 'build')

// ---- CRC32 / PNG ----
const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const t = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0)
  return Buffer.concat([len, t, data, crc])
}
function encodePng(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const idat = deflateSync(raw, { level: 9 })
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

// ---- geometry ----
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy || 1
  let t = ((px - ax) * dx + (py - ay) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}
function snowflakeSegs(size) {
  const c = size / 2
  const r = size * 0.34
  const segs = []
  for (let i = 0; i < 6; i++) {
    const a = (i * 60 * Math.PI) / 180
    segs.push([c, c, c + r * Math.cos(a), c + r * Math.sin(a)])
    for (const t of [0.48, 0.74]) {
      const bx = c + r * t * Math.cos(a)
      const by = c + r * t * Math.sin(a)
      const bl = r * 0.26
      for (const s of [1, -1]) {
        const ba = a + (s * 58 * Math.PI) / 180
        segs.push([bx, by, bx + bl * Math.cos(ba), by + bl * Math.sin(ba)])
      }
    }
  }
  return { segs, c }
}
function render(size) {
  const rgba = Buffer.alloc(size * size * 4)
  const { segs, c } = snowflakeSegs(size)
  const radius = size * 0.2
  const half = size * 0.5
  const lineHalf = size * 0.016
  const hubR = size * 0.04
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const qx = Math.abs(x + 0.5 - half) - (half - radius)
      const qy = Math.abs(y + 0.5 - half) - (half - radius)
      const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius
      const a = Math.max(0, Math.min(1, 0.5 - outside))
      if (a <= 0) continue
      const tg = y / size
      let R = Math.round(0x1d + (0x12 - 0x1d) * tg)
      let G = Math.round(0x6b + (0x48 - 0x6b) * tg)
      let B = Math.round(0x55 + (0x37 - 0x55) * tg)
      let d = Math.hypot(x + 0.5 - c, y + 0.5 - c) <= hubR ? 0 : Infinity
      for (const s of segs) {
        const dd = segDist(x + 0.5, y + 0.5, s[0], s[1], s[2], s[3])
        if (dd < d) d = dd
      }
      const flake = Math.max(0, Math.min(1, (lineHalf + 0.75 - d) / 1.5))
      if (flake > 0) {
        R = Math.round(R + (255 - R) * flake)
        G = Math.round(G + (255 - G) * flake)
        B = Math.round(B + (255 - B) * flake)
      }
      rgba[i] = R
      rgba[i + 1] = G
      rgba[i + 2] = B
      rgba[i + 3] = Math.round(a * 255)
    }
  }
  return rgba
}
function encodeIco(png) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)
  const entry = Buffer.alloc(16)
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(22, 12)
  return Buffer.concat([header, entry, png])
}

mkdirSync(buildDir, { recursive: true })
writeFileSync(join(buildDir, 'icon.png'), encodePng(512, render(512)))
writeFileSync(join(buildDir, 'icon.ico'), encodeIco(encodePng(256, render(256))))
console.log('✓ build/icon.png (512×512) и build/icon.ico (256×256) созданы')
