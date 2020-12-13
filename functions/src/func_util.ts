import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import * as Cors from 'cors'
const cors = Cors({origin: true})
import * as _ from 'lodash'
import * as U from './util'

export function MethodIs(req: functions.Request, method: string): boolean {
  if (req.method === method) { return true }
  console.warn(`unexpected method: ${req.method}`)
  return false
}


interface APIFuncParam {
  patharr?: string[]
}
type APIFunc = (req: functions.https.Request, res: functions.Response, param: APIFuncParam) => any

/**
 * @description CFをcors付きで定義する
 */
export function FuncDef(func: APIFunc, runtimeOption: functions.RuntimeOptions = {}) { return functions.region("asia-northeast1").runWith(runtimeOption).https.onRequest((req, res) => cors(req, res, async () => {
  const task_id = req.header("x-aurea-task_id");
  const function_execution_id = req.header("function-execution-id") || null;
  let task: FirebaseFirestore.DocumentSnapshot | null = null;
  try {
    const m = DecompilePath(req);
    if (typeof task_id === "string") {
      console.log(`task_id: ${task_id}`);
      task = await admin.firestore().collection("tasklog").doc(task_id).get();
      if (!task.exists) {
        console.log(`task not found: ${task_id}`);
        res.status(404).send("task not found");
        return;
      }
      if (task.get("succeeded"))  {
        console.log(`task already succeeded: ${task_id}`);
        res.status(200).send("already suceeded");
        return;
      }
      await task.ref.update({ invoked_at: new Date(), invoked: true, function_execution_id }).catch(console.warn);
    }
    await func(req, res, { patharr: m, })
    if (task) {
      await task.ref.update({ succeeded_at: new Date(), succeeded: true, function_execution_id }).catch(console.warn);
    }
  } catch(e) {
    console.error(e);
    if (task) {
      await task.ref.update({ failed_at: new Date(), failed: true, function_execution_id }).catch(console.warn);
    }
    // Default Catcher
    res.status(500).send(e);
  }
})) }
/**
 * @description 呼び出せないCF
 */
export function FuncStop(func: APIFunc){ return FuncDef((req, res) => res.status(404).send()) }

export function FuncPatch(func: APIFunc) { 
  return FuncDef((req, res, params) => MethodIs(req, "PATCH") ? func(req, res, params) : res.status(200).send())
}

export function FuncPost(func: APIFunc) { 
  return FuncDef((req, res, params) => MethodIs(req, "POST") ? func(req, res, params) : res.status(200).send())
}

function DecompilePath(req: functions.Request): string[] | undefined {
  const path = req.path;
  console.log(`request_path: ${path}`);
  if (typeof path !== "string") { return undefined }
  const m = _.compact(path.split(/\//))
  return m.length > 0 ? m : undefined
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

type HookHandler<T extends "onCreate" | "onUpdate" | "onWrite" | "onDelete"> = Parameters<(ReturnType<typeof functions.firestore.document>)[T]>[0]
const functionBuilder = functions.region("asia-northeast1").firestore;

/**
 * データ同期用のFirestoreフックをまとめて定義する
 * @param doc_path_from 
 * @param doc_path_to 
 * @param option 
 */
export function synchronizer(
  db: FirebaseFirestore.Firestore,
  doc_path_from: string,
  mapping: {
    [doc_path_to: string]: {
      write?: boolean | ((data: functions.Change<functions.firestore.DocumentSnapshot>) => any);
      create?: boolean | ((data: functions.firestore.QueryDocumentSnapshot) => any);
      update?: boolean | ((data: functions.Change<functions.firestore.QueryDocumentSnapshot>) => any);
      delete?: boolean;
    }
  }
) {

  const procs: {
    write: HookHandler<"onWrite">[];
    create: HookHandler<"onCreate">[];
    update: HookHandler<"onUpdate">[];
    delete: HookHandler<"onDelete">[];
  } = {
    write: [],
    create: [],
    update: [],
    delete: [],
  }

  const params_from = (U.u_matchAll(doc_path_from, /\{(\w+?)\}/)).map(m => m[1]).sort();
  _.each(mapping, (option, doc_path_to) => {
    const params_to = (U.u_matchAll(doc_path_to, /\{(\w+?)\}/)).map(m => m[1]).sort();
    console.log(params_from, params_to)
    if (params_from.join(" ") !== params_to.join(" ")) {
      throw new Error("path not matches");
    }

    if (option.write && !option.create && !option.update) {
      procs.write.push((document, context) => {
        let path = doc_path_to;
        _.each(context.params, (value, key) => {
          path = path.replace(`{${key}}`, value);
        });
        console.log(doc_path_to, "->", path);
        const data = typeof option.write === "function" ? option.write(document) : document.after.data()!;
        if (!data) { return null; }
        return db.doc(path).set(data);
      });
    }
    if (!option.write && option.create) {
      procs.create.push((document, context) => {
        let path = doc_path_to;
        _.each(context.params, (value, key) => {
          path = path.replace(`{${key}}`, value);
        });
        console.log(doc_path_to, "->", path);
        const data = typeof option.create === "function" ? option.create(document) : document.data()!;
        if (!data) { return null; }
        return db.doc(path).set(data);
      });
    }
    if (!option.write && option.update) {
      procs.update.push((document, context) => {
        let path = doc_path_to;
        _.each(context.params, (value, key) => {
          path = path.replace(`{${key}}`, value);
        });
        console.log(doc_path_to, "->", path);
        const data = typeof option.update === "function" ? option.update(document) : document.after.data()!;
        if (!data) { return null; } 
        return db.doc(path).set(data);
      });
    }
    if (option.delete) {
      procs.delete.push((document, context) => {
        let path = doc_path_to;
        _.each(context.params, (value, key) => {
          path = path.replace(`{${key}}`, value);
        });
        console.log(doc_path_to, "->", path);
        return db.doc(path).delete();
      });
    }
  });

  const funcs: {
    write?: functions.CloudFunction<functions.Change<functions.firestore.DocumentSnapshot>>;
    create?: functions.CloudFunction<functions.firestore.QueryDocumentSnapshot>;
    update?: functions.CloudFunction<functions.Change<functions.firestore.QueryDocumentSnapshot>>;
    delete?: functions.CloudFunction<functions.firestore.QueryDocumentSnapshot>;
  } = {};
  if (procs.write.length > 0) {
    funcs.write = functionBuilder.document(doc_path_from).onWrite((document, context) => {
      procs.write.forEach(handler => handler(document, context));
    });
  }
  if (procs.create.length > 0) {
    funcs.create = functionBuilder.document(doc_path_from).onCreate((document, context) => {
      procs.create.forEach(handler => handler(document, context));
    });
  }
  if (procs.update.length > 0) {
    funcs.update = functionBuilder.document(doc_path_from).onUpdate((document, context) => {
      procs.update.forEach(handler => handler(document, context));
    });
  }
  if (procs.delete.length > 0) {
    funcs.delete = functionBuilder.document(doc_path_from).onDelete((document, context) => {
      procs.delete.forEach(handler => handler(document, context));
    });
  }
  return funcs;
}
