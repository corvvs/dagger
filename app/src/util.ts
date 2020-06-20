import * as _ from 'lodash';
const Crypto = require('crypto');
import * as moment from "moment"
import "moment-timezone"
moment.tz.setDefault("Asia/Tokyo")

export async function PromiseMap<T>(pmap: { [P in keyof T]: Promise<T[P]> }) {
  const r: any = {}
  await Promise.all(Object.keys(pmap).map(key => (async () => {
    r[key] = await pmap[key as (keyof T)]
  })()))
  return r as T
}

export function u_datify(data: any) {
  if (_.isNull(data)) { return undefined; }
  if (data instanceof Date) { return data; }
  if (typeof data === "number") {
    return new Date(data);
  }
  if (typeof data === "object") {
    if (typeof data._seconds === "number" && typeof data._nanoseconds === "number") {
      return new Date(data._seconds * 1000 + data._nanoseconds / 1000);
    }
  }
  return undefined;
}

function residual(digits: number[], radix: number, mod: number): number {
  let radixMod = 1; // これはキャッシュできる
  return digits.map((d,i) => {
    const s = d * radixMod % mod;
    radixMod = radixMod * radix % mod;
    return s;
  }).reduce((s,x) => (s + x) % mod, 0) % mod;
}

function divide(digits: number[], radix: number, divisor: number) {
  for (let i = digits.length - 1; 0 <= i; --i) {
    const r = digits[i] % divisor;
    const q = Math.floor(digits[i] / divisor);
    digits[i] = q;
    if (i - 1 >= 0) {
      digits[i - 1] += radix * r;
    }
  }
}

/**
 * 整数 given_ys の基数を radixFrom から radixTo に変換する
 * @param given_ys 変換元基数 radixFrom で表記された整数の各桁の数字
 * @param radixFrom 変換元基数
 * @param radixTo 変換先基数
 */
function changeRadix(digits: number[], radixFrom: number, radixTo: number): number[] {
  const ys = [...digits];
  const xs: number[] = [];
  while (ys.some(y => y > 0)) {
    const r = residual(ys, radixFrom, radixTo);
    xs.push(r);
    divide(ys, radixFrom, radixTo);
  }
  return xs;
}

/**
 * uuidを短縮する
 */
export function u_shorten_uuid(uuid: string) {
  // 実装:
  // 1. uuid(16進32桁の定数)を4つの16進8桁の整数に分割
  // 2. それぞれの16進整数を62進整数に変換
  // 3. 62進整数の各桁を英数字A-Za-z0-9に変換
  // 4. 変換後の文字を結合
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const radix = chars.length;
  const suuid = uuid.replace(/\-/g, "").split("").map(s => parseInt(s, 16));
  const q62s = changeRadix(suuid, 16, radix);
  return q62s.map(q => chars[q]).join("");
}
