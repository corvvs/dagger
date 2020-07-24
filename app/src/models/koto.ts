import * as _ from "lodash";
import firebase, { firestore, auth } from "firebase";
import * as uuid from "uuid";
import * as U from "@/util";
import * as FB from "@/models/fb";

type KotoStatus = "resolved";

export type Koto = {
  saved: boolean;
  id: string; // "koto_" で始める
  title: string;
  body: string;
  created_at: number;
  updated_at: number;

  // この事が依存している事; 順依存
  dependency?: { [id: string]: Koto };

  // この事に依存している事: 逆依存
  reverse_dependency?: { [id: string]: Koto };
};

export type DeletedKoto = {
  id: string;
};

type KotoError = Partial<Record<keyof Koto, string>>;
export type KotoLister = FB.FirestoreObjectLister<Koto>;

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

  // -- Firebase I/O --
  function koto_collection(uid: string) {
    return firebase.firestore().collection(`user/${uid}/koto`);
  }

  export function lister(uid: string)  {
    return new FB.FirestoreObjectLister<Koto>(koto_collection(uid));
  }

  export function copy(object: Koto) {
    return _.cloneDeep(object);
  }

  export function validate_creation(object: Koto) {
    const e: KotoError = {};
    if (!object.id) {
      e.id = "入力してください。";
    }
    if (!(object.title || "").trim()) {
      e.title = "入力してください。";
    }
    return Object.keys(e).length > 0 ? e : undefined;
  }

  export function validate_update(object?: Koto) {
    if (!object) { return undefined; }
    const e: KotoError = {};
    if (!object.id) {
      e.id = "入力してください。";
    }
    if (!(object.title || "").trim()) {
      e.title = "入力してください。";
    }
    return Object.keys(e).length > 0 ? e : undefined;
  }
}

