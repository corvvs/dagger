import * as _ from "lodash";
import firebase, { firestore, auth } from "firebase";
import * as uuid from "uuid";
import * as U from "@/util";

type KotoStatus = "resolved";

export type Koto = {
  saved: boolean
  id: string; // "factor_" で始める
  title: string;
  body: string;
  created_at: number;
  updated_at: number;
};

type ListerStatus = "idling" | "working";
/**
 * Firebase collection I/O
 */
export class FirestoreObjectLister<T extends { 
  id: string;
  created_at: number;
  updated_at: number;
}> {
  /**
   * 保存ステータス
   */
  get save_status() { return this._save_status; }
  private _save_status: ListerStatus = "idling";
  private change_save_status(status: ListerStatus) {
    this._save_status = status;
    if (this.option.saveStatusCallback) { this.option.saveStatusCallback(this._save_status); }
  }

  constructor(private collection: firebase.firestore.CollectionReference, public option: {
    /**
     * snapshotの後処理コールバック
     */
    snapshotCallback?: (d: { object: T } & firebase.firestore.DocumentChange) => void,
    /**
     * 保存処理の状態コールバック
     */
    saveStatusCallback?: (status: ListerStatus) => void,
  } = {}) {
  }

  /**
   * 保存(set)
   */
  async save(object: T) {
    const t = Date.now();
    object.created_at = object.created_at || t;
    object.updated_at = t;

    this.change_save_status("working")
    try {
      const result = this.collection.doc(object.id).set(object);
      this.change_save_status("idling")
      return result;
    } catch (e) {
      this.change_save_status("idling")
      throw e;
    }
  }


  async fetch(limit = 100) {
    return (await this.collection.orderBy("created_at", "desc")
      .limit(limit)
      .get()).docs.map((d) => d.data() as T);
  }

  /**
   * snapshot
   */
  snapshot(limit = 100) {
    return this.collection.orderBy("created_at", "desc")
      .limit(limit)
      .onSnapshot(snapshot => snapshot.docChanges().forEach((change) => {
        if (this.option.snapshotCallback) {
          this.option.snapshotCallback({ object: change.doc.data() as T, ...change });
        }
      }));
  }
}

const storageKey = "dagger_test_kotos";
export namespace Koto {
  export function spawn(): Koto {
    return {
      id: `koto_${U.u_shorten_uuid(uuid.v4())}`,
      title: "",
      body: "",
      saved: false,
      created_at: 0,
      updated_at: 0,
    };
  }

  export function test_flush_storage() {
    sessionStorage.setItem(storageKey, "[[");
  }

  export function test_write(kotos: Koto[]) {
    const t = Date.now();
    kotos.forEach((f) => {
      f.created_at = f.created_at || t;
      f.updated_at = t;
    })
    sessionStorage.setItem(storageKey, JSON.stringify(kotos));
  }

  export function test_get(): Koto[] {
    const string_data = sessionStorage.getItem(storageKey); 
    try {
      const data = string_data ? JSON.parse(string_data) : [];
      return data;
    } catch (e) {
      console.error(e)
      return [];
    }
  }

  // -- Firebase I/O --
  function koto_collection(uid: string) {
    return firebase.firestore().collection(`user/${uid}/koto`);
  }

  export function lister(uid: string)  {
    return new FirestoreObjectLister<Koto>(koto_collection(uid));
  }
}

