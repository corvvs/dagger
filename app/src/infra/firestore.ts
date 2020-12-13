import * as _ from "lodash";
import firebase, { firestore } from "firebase";

type ObjectBase = {
  id: string;
  created_at: number;
  updated_at: number;
}
type ListerStatus = "idling" | "working";
/**
 * Firebase collection I/O
 */
export class ObjectLister<T extends ObjectBase> {
  /**
   * 保存ステータス
   */
  get save_status() { return this._save_status; }
  private _save_status: ListerStatus = "idling";
  private change_save_status(status: ListerStatus) {
    this._save_status = status;
    if (this.option.saveStatusCallback) { this.option.saveStatusCallback(this._save_status); }
  }
  private collection: firebase.firestore.CollectionReference;

  constructor(user: Auth.User, collection: string, public option: {
    /**
     * snapshotの後処理コールバック
     */
    snapshotCallback?: (d: { object: T } & firebase.firestore.DocumentChange) => void,
    /**
     * 保存処理の状態コールバック
     */
    saveStatusCallback?: (status: ListerStatus) => void,

    /**
     * 保存を行う
     */
    saver?: (object: T) => Promise<any>,

    /**
     * 取得・展開を行う
     */
    deserializer?: (doc: firebase.firestore.DocumentSnapshot) => Promise<T>,
  } = {}) {
    this.collection = firestore().collection(`user/${user.uid}/${collection}`);
  }

  /**
   * 保存(set)
   */
  async save(object: T) {
    const t = Date.now();
    object.created_at = object.created_at || t;
    object.updated_at = t;

    this.change_save_status("working");
    try {
      const result = await (this.option.saver ? this.option.saver(object) : this.collection.doc(object.id).set(object));
      this.change_save_status("idling");
      return result;
    } catch (e) {
      this.change_save_status("idling");
      throw e;
    }
  }

  /**
   * 削除
   */
  async delete(object_id: string) {
    this.change_save_status("working");
    try {
      const result = this.collection.doc(object_id).delete();
      this.change_save_status("idling");
      return result;
    } catch (e) {
      this.change_save_status("idling");
      throw e;
    }
  }

  async fetch(limit = 100) {
    return (await this.collection.orderBy("created_at", "desc")
      .limit(limit)
      .get()).docs.map((d) => d.data() as T);
  }

  async get(id: string) {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) { return null; }
    return {
      id, ...doc.data(),
    } as T;
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

import { ref, Ref, reactive, SetupContext, watch } from '@vue/composition-api';
import * as Auth from "@/models/auth";

export const useObjectLister = <ObjectType extends ObjectBase>(
  context: SetupContext,
  listerGenerator: (user: Auth.User) => ObjectLister<ObjectType>
  ) => {
  const lister: {
    lister: ObjectLister<ObjectType> | null;
    unsubscriber: () => void;
    items: ObjectType[];
  } = reactive({
    lister: null,
    unsubscriber: () => 1,
    items: [],
  });

  const listerStatusRef: Ref<ListerStatus | null> = ref(null);

  watch(()=> lister.lister ? lister.lister.save_status : null, (newValue) => listerStatusRef.value = newValue);

  return {
    lister,
    listerStatusRef,

    delete_item: (object_id: string) => {
      if (!lister.lister)  { return; }
      return lister.lister.delete(object_id);
    },

    changed_user: async (auth_state: Auth.AuthState) => {
      if (auth_state.user) {
        // -- lister --
        // setup
        lister.lister = listerGenerator(auth_state.user);
        lister.lister.option.snapshotCallback = (change) => {
          const { doc, object } = change;
          // console.log(`[!!] ${change.type} ${change.object.id}`)
          switch (change.type) {
          case "added":
          case "modified":
            (() => {
              const i = lister.items.findIndex((d) => d.id === doc.id)
              if (0 <= i) {
                lister.items.splice(i, 1, object);
              } else {
                lister.items.splice(0, 0, object);
              }
            })()
            break;
          case "removed":
            (() => {
              const i = lister.items.findIndex((d) => d.id === doc.id);
              if (0 <= i) {
                lister.items.splice(i, 1);
              }
            })();
            break;
          }
        };

        // fetch
        (await lister.lister.fetch()).forEach((d) => lister.items.push(d));
        lister.unsubscriber = lister.lister.snapshot();
        console.log("snapshotting")
      } else {
        if (lister.unsubscriber) { lister.unsubscriber() }
        lister.lister = null;
        lister.items = [];
      }
    },
  };
};

export const useObjectEditor = <ObjectType extends ObjectBase>(
  context: SetupContext,
  collectionPath: string,
  option: {
    saveFormatter?: (object: ObjectType) => any,
    fetchFormatter?: (data: firestore.DocumentSnapshot) => ObjectType,
  } = {}
) => {
  const editor: {
    object: ObjectType | null;
    working: "idling" | "fetching" | "saving";
  } = reactive({
    object: null,
    working: "idling",
  });

  return {
    editor,

    async fetch_object(id: string) {
      if (editor.working === "idling") {
        try {
          editor.working = "fetching";
          const doc = await firestore().collection(collectionPath).doc(id).get();
          return option.fetchFormatter ? option.fetchFormatter(doc) : doc.data();
        } catch (e) {
          editor.working = "idling";
          throw e;
        }
      }
      return null;
    },

    async save_object(merge = false) {
      if (editor.object && editor.working === "idling") {
        try {
          editor.working = "saving";
          const data = option.saveFormatter ? option.saveFormatter(editor.object) : editor.object;
          return firestore().collection(collectionPath).doc(editor.object.id).set(data, { merge });
        } catch (e) {
          editor.working = "idling";
          throw e;
        }
      }
    }
  };
}