import * as _ from 'lodash';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
// import * as Crypto from 'crypto';

export async function PromiseMap<T>(pmap: { [P in keyof T]: Promise<T[P]> }) {
  const r: any = {}
  await Promise.all(Object.keys(pmap).map(key => (async () => {
    r[key] = await (pmap as any)[key]
  })()))
  return r as T
}

export function u_katakanize(str: string) {
  return str.replace(/[\u3041-\u3096]/g, m => String.fromCharCode(m.charCodeAt(0) + 0x60))
}

export function u_hankakunize(str: string) {
  return str.replace(/[！-～]/g, tmpStr => String.fromCharCode( tmpStr.charCodeAt(0) - 0xFEE0 ))
  .replace(/’/g, "'")
  .replace(/‘/g, "`")
  .replace(/￥/g, "\\")
  .replace(/　/g, " ")
  .replace(/〜/g, "~");  
}

export function u_hankakunize_digit(str: string) {
  return str.replace(/[０-９]/g, d => String.fromCharCode( d.charCodeAt(0) - 0xFEE0 ))
}

export function u_zenkakunize_digit(str: string) {
  return str.replace(/[0-9]/g, d => String.fromCharCode( d.charCodeAt(0) + 0xFEE0 ))
}

export function u_upcase_jp(str: string) {
  return str.replace(/[ァィゥェォッャュョ]/g, c => {
    return ({
      "ァ": "ア",
      "ィ": "イ",
      "ゥ": "ウ",
      "ェ": "エ",
      "ォ": "オ",
      "ッ": "ツ",
      "ャ": "ヤ",
      "ュ": "ユ",
      "ョ": "ヨ",
    } as any)[c] || c
  })
}

export function u_remove_accessories(str: string) {
  return str.replace(/[・\-•=　 ]/g, "");
}

type KeyMapFunction = (value: any, key: string) => string | { [key:string]: any }
/**
 * 辞書のkeyを付け替える
 * @param preserve - keymapに登場しないkeyの取り扱い; true: そのまま残す; false: 捨てる
 */
export function u_twist(object: any, keymap: { [key:string]: (string | KeyMapFunction) }, preserve = false) {
  const r: any = {}
  Object.keys(object).forEach(key => {
    const value = object[key]
    const m = keymap[key]
    // console.log(key, value, m)
    if (m) {
      if (typeof m === "string") {
        r[m] = value
      } else {
        const o = m(value, key)
        if (o) {
          if (typeof o === "string") {
            r[o] = value
          } else {
            Object.keys(o).forEach(k => r[k] = o[k])
          }
        }
      }
    } else if (preserve) {
      r[key] = value
    }
  })
  return r
}

export function u_datify(data: any) {
  if (_.isNull(data)) { return undefined; }
  if (data instanceof admin.firestore.Timestamp) { return data.toDate(); }
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

/**
 * in bytes
 * cf. https://firebase.google.com/docs/firestore/storage-size?hl=ja
 */
export function u_documentSizeOnFirestore(data: any, path?: string): number {
  if (_.isNull(data)) { return 1; }
  if (typeof data === "string") { return data.length + 1; }
  if (data instanceof admin.firestore.Timestamp) { return 8; }
  if (data instanceof admin.firestore.GeoPoint) { return 16; }
  if (data instanceof admin.firestore.DocumentReference) { return u_documentSizeOnFirestore(undefined, data.path); }
  if (typeof data === "number") { return 8; }
  if (typeof data === "boolean") { return 1; }
  if (_.isArray(data)) { return data.reduce((s,a) => s + u_documentSizeOnFirestore(a), 0); }
  if (typeof data === "object") {
    const base = (path ? path.split("/").reduce((s,a) => s + u_documentSizeOnFirestore(a), 16) : 0) + 32;
    return base + _.map(data, (v,k) => u_documentSizeOnFirestore(v) + u_documentSizeOnFirestore(k)).reduce((s,a) => s + a, 0);
  }
  return 0;
}

export function u_fillUndefined(data: any, filler: any) {
  if (data instanceof admin.firestore.Timestamp) { return; }
  if (data instanceof admin.firestore.GeoPoint) { return; }
  if (data instanceof admin.firestore.DocumentReference) { return; }
  if (_.isArray(data)) {
    data.forEach((v,i) => {
      if (typeof v === "object") { u_fillUndefined(v, filler); }
      if (typeof v === "undefined") { data[i] = filler; }
    });
    return;
  }
  if (typeof data === "object") {
    _.each(data, (v, k) => {
      if (typeof v === "object") { u_fillUndefined(v, filler); }
      if (typeof v === "undefined") { data[k] = filler; }
    })
  }
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

/**
 * うるう年対策:
 * 与えられたMomentオブジェクトの日付がうるう年の2/28だった場合、2/29に進める
 */
export function u_leapYear229(m: moment.Moment) {
  // console.log(m.format("YYYY-MM-DD"), m.isLeapYear(), m.month() + 1, m.date());
  if (m.isLeapYear() && m.month() + 1 === 2 && m.date() === 28) { m.add(1, "day"); }
  return m;
}

export function u_commanize(v: string) {
  const vs = v.split(".");
  vs[0] = vs[0]
    .split("")
    .reverse()
    .join("")
    .replace(/\d{3}(?=\d)/g, m => `${m},`)
    .split("")
    .reverse()
    .join("");
  return vs.join(".");
}

export function u_shaving_name_jp(name: string) {
  return name
  .replace(/(\s|　)*株式会社(\s|　)*/g,"")
  .replace(/\(.+\)/g,"")
  .replace(/（.+）/g,"")
}

export function u_shaving_person_name_jp(name: string) {
  return name
  .replace(/(\s|\n|　)+/g,"")
  .replace(/\(.+\)/g,"")
  .replace(/（.+）.{0,4}$/g,"")
  .replace(/（.+）/g,"")
}

export function u_doifundef<T>(block: (value: T) => void, value: T) {
  if (typeof value !== "undefined") { block(value); }
}

/**
 * Keyのリストを辞書に変換する
 */
export function u_listmap_key<K extends string, T>(keys: K[], mapper: (key: K) => T): { [k in K]: T } {
  const r: any = {};
  keys.forEach(k => r[k] = mapper(k));
  return r;
}

/**
 * Valueのリストを辞書に変換する
 */
export function u_listmap_value<K extends string, T>(items: T[], mapper: (item: T) => K): { [k in K]: T } {
  const r: any = {};
  items.forEach(item => r[mapper(item)] = item);
  return r;
}

export type APICore = {
  db: admin.firestore.Firestore;
  storage: admin.storage.Storage;
  ll: MicroLogger;
  request: functions.https.Request;
  response: functions.Response;
  startedAt: Date,
  config: any,
};

export class MicroLogger {
  constructor(public prefix: string, public on: boolean = true) {

  }

  log(...arg: Parameters<typeof console.log>) {
    if (!this.on) { return; }
    this.log_on(...arg);
  }

  warn(...arg: Parameters<typeof console.log>) {
    if (!this.on) { return; }
    this.warn_on(...arg);
  }

  error(...arg: Parameters<typeof console.log>) {
    if (!this.on) { return; }
    this.error_on(...arg);
  }

  log_on(...arg: Parameters<typeof console.log>) {
    console.log(this.prefix, ...arg);
  }

  warn_on(...arg: Parameters<typeof console.warn>) {
    console.warn(this.prefix, ...arg);
  }

  error_on(...arg: Parameters<typeof console.error>) {
    console.error(this.prefix, ...arg);
  }
}

export function u_matchAll(str: string, regexp: RegExp) { 
  const matches: RegExpMatchArray[] = [];
  if (!regexp.global) { return matches; }
  while (true) {
    const m = str.match(regexp);
    if (!m) { break }
    matches.push(m);
  }
  return matches;
}